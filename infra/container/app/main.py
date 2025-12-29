"""
FastAPI server for HunyuanVideo-1.5 video generation inference.
Production-ready with error handling, logging, and S3 integration.
"""
import os
import asyncio
import traceback
from contextlib import asynccontextmanager
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from loguru import logger
import torch

from app.inference import VideoGenerator, VideoGenerationError
from app.utils import upload_to_s3, cleanup_temp_file


# Configure logging
logger.add(
    "logs/app_{time}.log",
    rotation="500 MB",
    retention="10 days",
    level="INFO",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}"
)

# Global model instance
video_generator: Optional[VideoGenerator] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI app - loads model on startup."""
    global video_generator

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
            logger.info("Loading HunyuanVideo-1.5 model...")
            video_generator = VideoGenerator()
            logger.info("Model loaded successfully!")
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

    # Optional parameters - updated defaults for HunyuanVideo
    seed: Optional[int] = Field(default=None, description="Random seed for reproducibility")
    steps: Optional[int] = Field(default=30, ge=1, le=100, description="Number of inference steps")
    duration: Optional[int] = Field(default=4, ge=1, le=10, description="Video duration in seconds")
    fps: Optional[int] = Field(default=15, ge=4, le=30, description="Frames per second")
    guidance_scale: Optional[float] = Field(default=6.0, ge=1.0, le=20.0, description="Guidance scale")
    width: Optional[int] = Field(default=1280, ge=256, le=1920, description="Video width")
    height: Optional[int] = Field(default=720, ge=256, le=1080, description="Video height")


class GenerateResponse(BaseModel):
    """Response model for video generation."""
    status: str
    video_key: Optional[str] = None
    job_id: str
    message: Optional[str] = None
    generation_time_seconds: Optional[float] = None


class GpuMemory(BaseModel):
    """GPU memory information."""
    total_gb: float
    allocated_gb: float
    cached_gb: float


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    model_loaded: bool
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
        cuda_available=cuda_available,
        gpu_name=gpu_name,
        gpu_memory=gpu_memory,
        inference_mode=inference_mode,
        timestamp=datetime.utcnow().isoformat()
    )


@app.post("/generate", response_model=GenerateResponse)
async def generate_video(
    request: GenerateRequest,
    background_tasks: BackgroundTasks
):
    """
    Generate video from text prompt using HunyuanVideo-1.5.

    This endpoint:
    1. Validates the request
    2. Generates video using the loaded model
    3. Uploads the video to S3
    4. Returns the S3 key
    """
    if not video_generator:
        logger.error("Model not loaded")
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Validate model selection
    # Note: Currently only hunyuan-video is loaded. ltx-video support requires separate pipeline.
    if request.model not in ["hunyuan-video", "ltx-video"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model: {request.model}. Supported models: hunyuan-video, ltx-video"
        )

    if request.model == "ltx-video":
        # TODO: Implement LTX-Video pipeline support
        raise HTTPException(
            status_code=501,
            detail="LTX-Video support not yet implemented. Currently only hunyuan-video is available."
        )

    logger.info(f"Starting generation for job_id: {request.job_id}")
    logger.info(f"Model: {request.model}")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Parameters - steps: {request.steps}, duration: {request.duration}s, fps: {request.fps}")

    start_time = datetime.utcnow()
    temp_video_path = None

    try:
        # Generate video
        logger.info(f"[{request.job_id}] Starting inference...")
        temp_video_path = await asyncio.to_thread(
            video_generator.generate,
            prompt=request.prompt,
            num_inference_steps=request.steps,
            duration_seconds=request.duration,
            fps=request.fps,
            guidance_scale=request.guidance_scale,
            width=request.width,
            height=request.height,
            seed=request.seed
        )

        if not temp_video_path or not os.path.exists(temp_video_path):
            raise VideoGenerationError("Video generation failed - no output file")

        logger.info(f"[{request.job_id}] Video generated: {temp_video_path}")

        # Upload to S3
        logger.info(f"[{request.job_id}] Uploading to S3 bucket: {request.bucket_name}")
        video_key = f"generated-videos/{request.job_id}.mp4"

        s3_url = await asyncio.to_thread(
            upload_to_s3,
            file_path=temp_video_path,
            bucket_name=request.bucket_name,
            s3_key=video_key
        )

        logger.info(f"[{request.job_id}] Upload successful: {s3_url}")

        # Calculate generation time
        generation_time = (datetime.utcnow() - start_time).total_seconds()

        # Schedule cleanup in background
        if temp_video_path:
            background_tasks.add_task(cleanup_temp_file, temp_video_path)

        logger.info(f"[{request.job_id}] Completed in {generation_time:.2f}s")

        return GenerateResponse(
            status="completed",
            video_key=video_key,
            job_id=request.job_id,
            message="Video generated and uploaded successfully",
            generation_time_seconds=round(generation_time, 2)
        )

    except VideoGenerationError as e:
        logger.error(f"[{request.job_id}] Video generation error: {str(e)}")
        logger.error(traceback.format_exc())

        # Cleanup on error
        if temp_video_path:
            background_tasks.add_task(cleanup_temp_file, temp_video_path)

        raise HTTPException(
            status_code=500,
            detail=f"Video generation failed: {str(e)}"
        )

    except Exception as e:
        logger.error(f"[{request.job_id}] Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())

        # Cleanup on error
        if temp_video_path:
            background_tasks.add_task(cleanup_temp_file, temp_video_path)

        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
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
