"""
FastAPI server for HunyuanVideo-1.5 video generation inference.
Production-ready with error handling, logging, and S3 integration.
"""
import os
import asyncio
import traceback
import secrets
from contextlib import asynccontextmanager
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from loguru import logger
import torch

from app.inference import create_video_generator, VideoGenerationError, BaseVideoGenerator
from app.utils import upload_to_s3, cleanup_temp_file


# Model-specific default parameters
MODEL_DEFAULTS = {
    "hunyuan-video": {
        "guidance_scale": 6.0,
        "steps": 30,
    },
    "ltx-video": {
        "guidance_scale": 3.0,
        "steps": 50,
    },
    "hunyuan-video-15-i2v": {
        "guidance_scale": 6.0,
        "steps": 50,
    },
}


# Configure logging
logger.add(
    "logs/app_{time}.log",
    rotation="500 MB",
    retention="10 days",
    level="INFO",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}"
)

# Global model instance
video_generator: Optional[BaseVideoGenerator] = None
loaded_model_type: Optional[str] = None

# In-memory job status tracking
# Format: {job_id: {status, video_key, error, started_at, completed_at, generation_time_seconds}}
job_statuses: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI app - loads model on startup."""
    global video_generator, loaded_model_type

    logger.info("Starting FastAPI application...")
    logger.info(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

    try:
        # Initialize video generator (loads model)
        # Skip model loading if no GPU available (for local testing)
        skip_model = os.environ.get('SKIP_MODEL_LOAD', 'false').lower() == 'true'

        if torch.cuda.is_available() and not skip_model:
            loaded_model_type = os.environ.get('VIDEO_MODEL', 'hunyuan-video')
            logger.info(f"Loading model: {loaded_model_type}")
            video_generator = create_video_generator(loaded_model_type)
            logger.info(f"Model {loaded_model_type} loaded successfully!")
        elif skip_model:
            logger.warning("Skipping model load (SKIP_MODEL_LOAD=true)")
        else:
            logger.warning("No GPU detected - skipping model load for local testing")
            logger.warning("The /generate endpoint will return 503 until model is loaded")

        yield

    except Exception as e:
        logger.error(f"Failed to load model: {str(e)}")
        logger.error(traceback.format_exc())
        raise
    finally:
        # Cleanup on shutdown
        logger.info("Shutting down application...")
        if video_generator:
            video_generator.cleanup()


app = FastAPI(
    title="HunyuanVideo-1.5 Inference Server",
    description="Production inference server for HunyuanVideo text-to-video generation",
    version="2.0.0",
    lifespan=lifespan
)


# Request/Response Models
class GenerateRequest(BaseModel):
    """Request model for video generation."""
    prompt: str = Field(..., description="Text prompt for video generation", min_length=1)
    model: str = Field(default="hunyuan-video", description="Model to use: 'hunyuan-video' or 'ltx-video'")
    job_id: str = Field(..., description="Unique job identifier")
    bucket_name: str = Field(..., description="S3 bucket name for output video")

    # Optional parameters
    # Note: height=704 is divisible by 32 (required by LTX-Video) and close to 720p
    seed: Optional[int] = Field(default=None, description="Random seed for reproducibility")
    steps: Optional[int] = Field(default=None, ge=1, le=100, description="Number of inference steps (default: model-specific)")
    duration: Optional[int] = Field(default=4, ge=1, le=10, description="Video duration in seconds")
    fps: Optional[int] = Field(default=15, ge=4, le=30, description="Frames per second")
    guidance_scale: Optional[float] = Field(default=None, ge=1.0, le=20.0, description="Guidance scale (default: model-specific)")
    width: Optional[int] = Field(default=1280, ge=256, le=1920, description="Video width")
    height: Optional[int] = Field(default=704, ge=256, le=1080, description="Video height (704 for LTX compatibility)")

    # Image-to-video (LTX only)
    image_url: Optional[str] = Field(default=None, description="S3 URL of input image for LTX image-to-video")


class GenerateResponse(BaseModel):
    """Response model for video generation - immediate response."""
    status: str
    job_id: str
    message: str


class JobStatusResponse(BaseModel):
    """Response model for job status polling."""
    status: str  # 'processing', 'completed', 'failed'
    job_id: str
    video_key: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    generation_time_seconds: Optional[float] = None
    message: Optional[str] = None


class GpuMemory(BaseModel):
    """GPU memory information."""
    total_gb: float
    allocated_gb: float
    cached_gb: float


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    model_loaded: bool
    loaded_model: Optional[str] = None
    cuda_available: bool
    gpu_name: Optional[str] = None
    gpu_memory: Optional[GpuMemory] = None
    inference_mode: str
    timestamp: str


# API Endpoints
@app.get("/", response_model=dict)
async def root():
    """Root endpoint with API information."""
    return {
        "service": "HunyuanVideo-1.5 Inference Server",
        "version": "2.0.0",
        "status": "running",
        "endpoints": {
            "generate": "POST /generate",
            "health": "GET /health"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check with GPU and model status."""
    cuda_available = torch.cuda.is_available()
    gpu_name = None
    gpu_memory = None

    if cuda_available:
        try:
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory = GpuMemory(
                total_gb=round(torch.cuda.get_device_properties(0).total_memory / 1e9, 2),
                allocated_gb=round(torch.cuda.memory_allocated(0) / 1e9, 2),
                cached_gb=round(torch.cuda.memory_reserved(0) / 1e9, 2),
            )
        except Exception:
            pass

    model_loaded = video_generator is not None and video_generator.pipeline is not None

    # Determine inference mode
    if model_loaded:
        inference_mode = "native"
    elif cuda_available:
        inference_mode = "initializing"
    else:
        inference_mode = "no_gpu"

    return HealthResponse(
        status="healthy" if model_loaded else "model_not_loaded",
        model_loaded=model_loaded,
        loaded_model=loaded_model_type,
        cuda_available=cuda_available,
        gpu_name=gpu_name,
        gpu_memory=gpu_memory,
        inference_mode=inference_mode,
        timestamp=datetime.utcnow().isoformat()
    )


async def generate_video_background(request: GenerateRequest, effective_steps: int, effective_guidance: float):
    """
    Background task to generate video and update job status.
    This runs asynchronously while the /generate endpoint returns immediately.

    Args:
        request: The generation request
        effective_steps: Model-specific steps value (from request or model defaults)
        effective_guidance: Model-specific guidance_scale value (from request or model defaults)
    """
    job_id = request.job_id
    start_time = datetime.utcnow()
    temp_video_path = None

    try:
        # Update status to processing
        job_statuses[job_id] = {
            "status": "processing",
            "job_id": job_id,
            "started_at": start_time.isoformat(),
            "message": "Video generation in progress"
        }

        logger.info(f"[{job_id}] Starting background video generation...")

        # Download input image if provided (LTX image-to-video)
        input_image = None
        if request.image_url:
            try:
                from app.utils import download_image_from_s3
                logger.info(f"[{job_id}] Downloading input image from {request.image_url}")
                input_image = await asyncio.to_thread(download_image_from_s3, request.image_url)
                logger.info(f"[{job_id}] Input image loaded: {input_image.size}")
            except Exception as e:
                logger.error(f"[{job_id}] Failed to download input image: {e}")
                raise VideoGenerationError(f"Failed to download input image: {str(e)}")

        # Generate video - only pass image parameter if model supports it
        generate_kwargs = {
            "prompt": request.prompt,
            "num_inference_steps": effective_steps,
            "duration_seconds": request.duration,
            "fps": request.fps,
            "guidance_scale": effective_guidance,
            "width": request.width,
            "height": request.height,
            "seed": request.seed,
        }
        # Only add image parameter for I2V models that support it
        if input_image is not None:
            generate_kwargs["image"] = input_image

        temp_video_path = await asyncio.to_thread(
            video_generator.generate,
            **generate_kwargs
        )

        if not temp_video_path or not os.path.exists(temp_video_path):
            raise VideoGenerationError("Video generation failed - no output file")

        logger.info(f"[{job_id}] Video generated: {temp_video_path}")

        # Upload to S3
        logger.info(f"[{job_id}] Uploading to S3 bucket: {request.bucket_name}")
        suffix = secrets.token_hex(2)  # 4 random hex chars
        video_key = f"generated-videos/{job_id}_{suffix}.mp4"

        s3_url = await asyncio.to_thread(
            upload_to_s3,
            file_path=temp_video_path,
            bucket_name=request.bucket_name,
            s3_key=video_key
        )

        logger.info(f"[{job_id}] Upload successful: {s3_url}")

        # Calculate generation time
        generation_time = (datetime.utcnow() - start_time).total_seconds()

        # Update status to completed
        job_statuses[job_id] = {
            "status": "completed",
            "job_id": job_id,
            "video_key": video_key,
            "started_at": start_time.isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
            "generation_time_seconds": round(generation_time, 2),
            "message": "Video generated and uploaded successfully"
        }

        logger.info(f"[{job_id}] Completed in {generation_time:.2f}s")

    except Exception as e:
        logger.error(f"[{job_id}] Background generation error: {str(e)}")
        logger.error(traceback.format_exc())

        # Update status to failed
        job_statuses[job_id] = {
            "status": "failed",
            "job_id": job_id,
            "error": str(e),
            "started_at": start_time.isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
            "message": f"Video generation failed: {str(e)}"
        }

    finally:
        # Cleanup temp file
        if temp_video_path and os.path.exists(temp_video_path):
            try:
                await asyncio.to_thread(cleanup_temp_file, temp_video_path)
            except Exception as e:
                logger.error(f"[{job_id}] Cleanup error: {str(e)}")


@app.post("/generate", response_model=GenerateResponse)
async def generate_video(request: GenerateRequest):
    """
    Start video generation from text prompt using HunyuanVideo-1.5.

    This endpoint returns immediately after accepting the job.
    Use GET /status/{job_id} to poll for completion status.

    Returns:
    - status: "accepted"
    - job_id: The job ID to use for status polling
    - message: Instructions for status polling
    """
    if not video_generator:
        logger.error("Model not loaded")
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Validate model selection
    if request.model not in ["hunyuan-video", "ltx-video", "hunyuan-video-15-i2v"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model: {request.model}. Supported models: hunyuan-video, ltx-video, hunyuan-video-15-i2v"
        )

    # Validate request model matches loaded model
    if request.model != loaded_model_type:
        raise HTTPException(
            status_code=400,
            detail=f"Requested model '{request.model}' but container loaded '{loaded_model_type}'. "
                   f"Restart container with VIDEO_MODEL={request.model} to switch."
        )

    # Validate image_url only allowed for I2V models
    if request.image_url and request.model not in ["ltx-video", "hunyuan-video-15-i2v"]:
        raise HTTPException(
            status_code=400,
            detail="Image-to-video is only supported for ltx-video and hunyuan-video-15-i2v models"
        )

    # Check for duplicate job submission (idempotency)
    existing_status = job_statuses.get(request.job_id)
    if existing_status:
        status = existing_status.get("status")
        if status in ("accepted", "processing", "completed"):
            logger.warning(f"Duplicate job rejected: {request.job_id} (status: {status})")
            raise HTTPException(
                status_code=409,
                detail=f"Job {request.job_id} already exists with status '{status}'. "
                       f"Cannot process duplicate job."
            )
        # If status is 'failed', allow reprocessing (intentional retry)
        logger.info(f"Reprocessing previously failed job: {request.job_id}")

    # Apply model-specific defaults for parameters not explicitly set
    model_defaults = MODEL_DEFAULTS.get(request.model, {})
    effective_steps = request.steps if request.steps is not None else model_defaults.get("steps", 30)
    effective_guidance = request.guidance_scale if request.guidance_scale is not None else model_defaults.get("guidance_scale", 6.0)

    logger.info(f"Accepting job_id: {request.job_id}")
    logger.info(f"Model: {request.model}")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Parameters - steps: {effective_steps}, guidance: {effective_guidance}, duration: {request.duration}s, fps: {request.fps}")

    # Initialize job status
    job_statuses[request.job_id] = {
        "status": "accepted",
        "job_id": request.job_id,
        "started_at": datetime.utcnow().isoformat(),
        "message": "Job accepted, starting generation"
    }

    # Start generation in background
    asyncio.create_task(generate_video_background(request, effective_steps, effective_guidance))

    return GenerateResponse(
        status="accepted",
        job_id=request.job_id,
        message=f"Job accepted. Poll GET /status/{request.job_id} for progress."
    )


@app.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Get the current status of a video generation job.

    Status values:
    - "accepted": Job has been accepted and queued
    - "processing": Video generation is in progress
    - "completed": Video has been generated and uploaded to S3
    - "failed": Video generation failed

    Returns job status with additional details when available.
    """
    if job_id not in job_statuses:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    status_data = job_statuses[job_id]

    return JobStatusResponse(
        status=status_data.get("status"),
        job_id=job_id,
        video_key=status_data.get("video_key"),
        error=status_data.get("error"),
        started_at=status_data.get("started_at"),
        completed_at=status_data.get("completed_at"),
        generation_time_seconds=status_data.get("generation_time_seconds"),
        message=status_data.get("message")
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors."""
    logger.error(f"Unhandled exception: {str(exc)}")
    logger.error(traceback.format_exc())

    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal server error",
            "detail": str(exc)
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
        log_level="info"
    )
