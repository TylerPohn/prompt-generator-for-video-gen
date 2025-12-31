"""
Inference logic for video generation.
Supports multiple models via VIDEO_MODEL environment variable:
- hunyuan-video: HunyuanVideo-1.5 with GGUF Q4 quantization
- ltx-video: LTX-Video with FP8 quantization
"""
import os
import tempfile
import uuid
from abc import ABC, abstractmethod
from typing import Optional, List
from PIL import Image
import gc

import torch
import numpy as np
from loguru import logger

# Workaround for PyTorch 2.4 compatibility with HunyuanVideo's enable_gqa parameter
# See: https://github.com/QwenLM/Qwen-Image/issues/65
import torch.nn.functional as F
_orig_sdpa = F.scaled_dot_product_attention

def _sdpa_drop_enable_gqa(*args, **kwargs):
    """Wrapper to drop enable_gqa parameter for PyTorch < 2.5 compatibility."""
    kwargs.pop("enable_gqa", None)
    return _orig_sdpa(*args, **kwargs)

F.scaled_dot_product_attention = _sdpa_drop_enable_gqa
logger.info("Applied PyTorch 2.4 compatibility patch for enable_gqa")

# Import will fail if diffusers < 0.36.0
from diffusers import HunyuanVideoPipeline, HunyuanVideoTransformer3DModel, GGUFQuantizationConfig, LTXPipeline, LTXImageToVideoPipeline, HunyuanVideo15ImageToVideoPipeline
from diffusers.quantizers import PipelineQuantizationConfig
from diffusers.utils import export_to_video


class VideoGenerationError(Exception):
    """Custom exception for video generation errors."""
    pass


class BaseVideoGenerator(ABC):
    """Abstract base class for video generation pipelines."""

    def __init__(self):
        self.pipeline = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    @abstractmethod
    def _load_model(self):
        """Load the model pipeline."""
        pass

    @abstractmethod
    def generate(
        self,
        prompt: str,
        num_inference_steps: int = 30,
        duration_seconds: int = 4,
        fps: int = 15,
        guidance_scale: float = 6.0,
        width: int = 1280,
        height: int = 720,
        seed: Optional[int] = None
    ) -> str:
        """Generate video from prompt. Returns path to video file."""
        pass

    def cleanup(self):
        """Cleanup resources."""
        if self.pipeline:
            del self.pipeline
            self.pipeline = None
        if self.device == "cuda":
            torch.cuda.empty_cache()
        gc.collect()


class HunyuanVideoGenerator(BaseVideoGenerator):
    """
    Wrapper class for HunyuanVideo-1.5 video generation pipeline.
    Uses GGUF Q8 quantization for near-lossless quality with ~14GB VRAM usage.

    The GGUF quantization approach loads only the transformer in GGUF format,
    while other components (VAE, text encoders) are loaded from the standard
    diffusers format.
    """

    # Default GGUF model path (can be overridden via environment variable)
    # Note: Using Q4_0 quantization (~7GB) for better GPU memory fit
    #       Q8_0 is ~14GB and doesn't fit in 24GB GPU with all other components
    DEFAULT_GGUF_PATH = "/app/models/hunyuan-video-t2v-720p-Q4_0.gguf"

    def __init__(
        self,
        model_id: str = "hunyuanvideo-community/HunyuanVideo",
        gguf_path: Optional[str] = None
    ):
        """
        Initialize the video generator with GGUF quantization.

        Args:
            model_id: HuggingFace model ID for non-transformer components
            gguf_path: Path to GGUF model file. If None, uses DEFAULT_GGUF_PATH
                       or GGUF_MODEL_PATH environment variable.
        """
        super().__init__()
        self.model_id = model_id
        self.gguf_path = gguf_path or os.environ.get('GGUF_MODEL_PATH', self.DEFAULT_GGUF_PATH)

        logger.info(f"Initializing HunyuanVideoGenerator with GGUF quantization")
        logger.info(f"Model ID (for non-transformer): {model_id}")
        logger.info(f"GGUF path: {self.gguf_path}")
        logger.info(f"Device: {self.device}")

        # Enable CUDA kernels for ~10% speedup if available
        if self.device == "cuda":
            os.environ["DIFFUSERS_GGUF_CUDA_KERNELS"] = "true"
            logger.info("GGUF CUDA kernels enabled")

        # Log cache location
        hf_home = os.environ.get('HF_HOME', '/app/hf_cache')
        logger.info(f"HuggingFace cache: {hf_home}")
        if os.path.exists(hf_home):
            cache_contents = os.listdir(hf_home)
            logger.info(f"Cache contents: {len(cache_contents)} items")
        else:
            logger.warning(f"Cache directory does not exist: {hf_home}")

        self._load_model()

    def _download_gguf_model(self):
        """Download the GGUF model from HuggingFace if not already present."""
        if os.path.exists(self.gguf_path):
            logger.info(f"GGUF model already exists at {self.gguf_path}")
            return

        logger.info(f"Downloading GGUF model to {self.gguf_path}...")
        logger.info("This may take 10-20 minutes on first startup (14GB download)")

        try:
            from huggingface_hub import hf_hub_download

            # Ensure the models directory exists
            models_dir = os.path.dirname(self.gguf_path)
            os.makedirs(models_dir, exist_ok=True)

            # Download the GGUF model (Q4_0 quantization for memory efficiency)
            downloaded_path = hf_hub_download(
                repo_id="city96/HunyuanVideo-gguf",
                filename="hunyuan-video-t2v-720p-Q4_0.gguf",
                local_dir=models_dir,
            )
            logger.info(f"GGUF model downloaded to: {downloaded_path}")

        except Exception as e:
            raise VideoGenerationError(f"Failed to download GGUF model: {str(e)}")

    def _load_model(self):
        """Load the HunyuanVideo pipeline with GGUF Q8 quantization."""
        try:
            logger.info("Loading HunyuanVideo pipeline with GGUF Q8 quantization...")

            # Download GGUF model if not present
            self._download_gguf_model()

            # Verify GGUF model file exists
            if not os.path.exists(self.gguf_path):
                raise VideoGenerationError(
                    f"GGUF model file not found at {self.gguf_path} after download attempt."
                )

            gguf_size_gb = os.path.getsize(self.gguf_path) / 1e9
            logger.info(f"GGUF model file size: {gguf_size_gb:.2f}GB")

            # Step 1: Load GGUF-quantized transformer
            # This is the main 8.3B parameter model, quantized to Q8 (~14GB)
            logger.info("Loading GGUF-quantized transformer...")

            quantization_config = GGUFQuantizationConfig(
                compute_dtype=torch.bfloat16
            )

            transformer = HunyuanVideoTransformer3DModel.from_single_file(
                self.gguf_path,
                quantization_config=quantization_config,
                torch_dtype=torch.bfloat16,
            )
            logger.info("Transformer loaded from GGUF")

            # Move transformer to GPU
            logger.info("Moving transformer to GPU...")
            transformer = transformer.to(self.device)
            logger.info("Transformer moved to GPU")

            # Step 2: Load the rest of the pipeline with the quantized transformer
            # This loads VAE, text encoders, scheduler from HuggingFace
            logger.info(f"Loading pipeline components from {self.model_id}...")

            # Load pipeline components - transformer already loaded above
            self.pipeline = HunyuanVideoPipeline.from_pretrained(
                self.model_id,
                transformer=transformer,
                torch_dtype=torch.bfloat16,
            )
            logger.info("Pipeline components loaded")

            # Enable model CPU offload for better memory management
            # This keeps model parts on CPU and moves them to GPU only when needed
            logger.info("Enabling model CPU offload for memory management...")
            self.pipeline.enable_model_cpu_offload()

            # Enable gradient checkpointing for transformer to reduce memory
            logger.info("Enabling gradient checkpointing on transformer...")
            if hasattr(self.pipeline.transformer, 'enable_gradient_checkpointing'):
                self.pipeline.transformer.enable_gradient_checkpointing()
                logger.info("Gradient checkpointing enabled")
            else:
                logger.warning("Transformer does not support gradient checkpointing")

            # Enable VAE tiling AND slicing for maximum memory safety during decode phase
            logger.info("Enabling VAE tiling and slicing...")
            self.pipeline.vae.enable_tiling()
            self.pipeline.vae.enable_slicing()
            logger.info("VAE memory optimizations enabled")

            # Log memory usage after loading
            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated() / 1e9
                reserved = torch.cuda.memory_reserved() / 1e9
                logger.info(f"GPU memory - Allocated: {allocated:.2f}GB, Reserved: {reserved:.2f}GB")

            logger.info("Pipeline loaded successfully with GGUF Q8 quantization!")

        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise VideoGenerationError(f"Model loading failed: {str(e)}")

    def generate(
        self,
        prompt: str,
        num_inference_steps: int = 30,
        duration_seconds: int = 4,
        fps: int = 15,
        guidance_scale: float = 6.0,
        width: int = 1280,
        height: int = 720,
        seed: Optional[int] = None
    ) -> str:
        """
        Generate video from text prompt.

        Args:
            prompt: Text description of the video
            num_inference_steps: Number of denoising steps (default 30 for speed)
            duration_seconds: Video duration in seconds
            fps: Frames per second (HunyuanVideo native is 24, we use 15)
            guidance_scale: Embedded guidance scale (6.0 is default for HunyuanVideo)
            width: Video width in pixels (1280 for 720p)
            height: Video height in pixels (720 for 720p)
            seed: Random seed for reproducibility

        Returns:
            Path to generated MP4 video file
        """
        if not self.pipeline:
            raise VideoGenerationError("Pipeline not loaded")

        try:
            # Aggressive pre-generation memory cleanup
            if self.device == "cuda":
                logger.info("Pre-generation memory cleanup...")
                gc.collect()
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()

                # Log available memory before generation
                allocated = torch.cuda.memory_allocated() / 1e9
                reserved = torch.cuda.memory_reserved() / 1e9
                total = torch.cuda.get_device_properties(0).total_memory / 1e9
                free = total - allocated
                logger.info(f"Pre-generation GPU memory - Total: {total:.2f}GB, Allocated: {allocated:.2f}GB, Free: {free:.2f}GB, Reserved: {reserved:.2f}GB")

            # Calculate number of frames (must be 4k+1 for HunyuanVideo)
            # For 4 seconds at 15fps = 60 frames, round to 61 (4*15+1)
            num_frames = (duration_seconds * fps // 4) * 4 + 1
            logger.info(f"Generating {num_frames} frames at {fps} fps ({duration_seconds}s)")

            # Set random seed if provided
            generator = None
            if seed is not None:
                generator = torch.Generator(device="cpu").manual_seed(seed)
                logger.info(f"Using seed: {seed}")

            # Run inference
            logger.info("Running HunyuanVideo inference...")
            logger.info(f"Prompt: {prompt}")
            logger.info(f"Steps: {num_inference_steps}, Guidance: {guidance_scale}")
            logger.info(f"Resolution: {width}x{height}")

            # Log memory before generation
            if torch.cuda.is_available():
                torch.cuda.reset_peak_memory_stats()

            output = self.pipeline(
                prompt=prompt,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                height=height,
                width=width,
                num_frames=num_frames,
                generator=generator,
            )

            # Log peak memory
            if torch.cuda.is_available():
                peak_memory = torch.cuda.max_memory_allocated() / 1e9
                logger.info(f"Peak GPU memory: {peak_memory:.2f}GB")

            # Extract frames
            frames = output.frames[0]  # First (and only) video in batch

            if frames is None or len(frames) == 0:
                raise VideoGenerationError("No frames generated")

            logger.info(f"Generated {len(frames)} frames")

            # Export to video
            video_path = self._save_video(frames, fps)

            logger.info(f"Video saved to: {video_path}")

            # Aggressive cleanup to prevent memory fragmentation
            del output, frames
            if self.device == "cuda":
                # Force synchronization to ensure all operations complete
                torch.cuda.synchronize()
                # Empty cache multiple times to handle fragmentation
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()
                # Force garbage collection
                gc.collect()
                torch.cuda.empty_cache()

                # Log memory after cleanup
                allocated = torch.cuda.memory_allocated() / 1e9
                reserved = torch.cuda.memory_reserved() / 1e9
                logger.info(f"Post-cleanup GPU memory - Allocated: {allocated:.2f}GB, Reserved: {reserved:.2f}GB")

            gc.collect()

            return video_path

        except Exception as e:
            logger.error(f"Video generation failed: {str(e)}")
            raise VideoGenerationError(f"Generation failed: {str(e)}")

    def _save_video(self, frames: List, fps: int) -> str:
        """
        Save frames to MP4 video file using diffusers utility.

        Args:
            frames: List of PIL Images from pipeline output
            fps: Frames per second

        Returns:
            Path to saved video file
        """
        try:
            # Create temporary file
            temp_dir = os.environ.get('TEMP_VIDEO_DIR', '/app/tmp_videos')
            os.makedirs(temp_dir, exist_ok=True)

            video_filename = f"video_{uuid.uuid4().hex}.mp4"
            video_path = os.path.join(temp_dir, video_filename)

            logger.info(f"Saving video to: {video_path}")
            logger.info(f"FPS: {fps}, Frames: {len(frames)}")

            # Use diffusers utility for video export
            export_to_video(frames, video_path, fps=fps)

            # Verify file was created
            if not os.path.exists(video_path):
                raise VideoGenerationError("Video file was not created")

            file_size = os.path.getsize(video_path)
            logger.info(f"Video saved successfully: {file_size / 1024 / 1024:.2f} MB")

            return video_path

        except Exception as e:
            logger.error(f"Video save failed: {str(e)}")
            raise VideoGenerationError(f"Video save failed: {str(e)}")

    def cleanup(self):
        """Cleanup resources."""
        logger.info("Cleaning up video generator resources...")

        if self.pipeline:
            del self.pipeline
            self.pipeline = None

        if self.device == "cuda":
            torch.cuda.empty_cache()

        gc.collect()
        logger.info("Cleanup complete")


class LTXVideoGenerator(BaseVideoGenerator):
    """
    LTX-Video with FP8 quantization for 30-40% VRAM savings.
    Model cached on EFS at /app/hf_cache (mounted from /mnt/efs/hf_cache).
    """

    MODEL_ID = "Lightricks/LTX-Video"

    def __init__(self, use_fp8: bool = True):
        super().__init__()
        self.use_fp8 = use_fp8

        logger.info(f"Initializing LTXVideoGenerator (FP8: {use_fp8})")
        logger.info(f"Device: {self.device}")
        logger.info(f"HF cache: {os.environ.get('HF_HOME', '/app/hf_cache')}")

        self._load_model()

    def _load_model(self):
        """Load LTX-Video pipelines (text-to-video and image-to-video)."""
        try:
            logger.info("Loading LTX-Video text-to-video pipeline...")

            # Load text-to-video pipeline
            self.text_pipeline = LTXPipeline.from_pretrained(
                self.MODEL_ID,
                torch_dtype=torch.bfloat16,
            )
            logger.info("Text-to-video pipeline loaded")

            # Load image-to-video pipeline separately to avoid CPU offload hook conflicts
            # Using from_pipe() with CPU offload causes dtype mismatches in timestep embeddings
            logger.info("Loading image-to-video pipeline...")
            self.image_pipeline = LTXImageToVideoPipeline.from_pretrained(
                self.MODEL_ID,
                torch_dtype=torch.bfloat16,
            )
            logger.info("Image-to-video pipeline loaded")

            # NOTE: FP8 layerwise casting is disabled for now due to dtype mismatch issues
            # when combined with CPU offload. The timestep embeddings get passed as float32
            # while linear layers expect bfloat16, causing "mat1 and mat2 must have same dtype" error.
            if self.use_fp8:
                logger.warning("FP8 layerwise casting disabled due to dtype mismatch with CPU offload")

            # Enable CPU offload for memory management on both pipelines
            logger.info("Enabling model CPU offload...")
            self.text_pipeline.enable_model_cpu_offload()
            self.image_pipeline.enable_model_cpu_offload()

            # Enable VAE optimizations on both pipelines
            for pipeline in [self.text_pipeline, self.image_pipeline]:
                if hasattr(pipeline.vae, 'enable_tiling'):
                    pipeline.vae.enable_tiling()
                if hasattr(pipeline.vae, 'enable_slicing'):
                    pipeline.vae.enable_slicing()

            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated() / 1e9
                logger.info(f"GPU memory after load: {allocated:.2f}GB")

            logger.info("LTX-Video pipelines loaded successfully!")

        except Exception as e:
            logger.error(f"Failed to load LTX-Video: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise VideoGenerationError(f"LTX-Video loading failed: {str(e)}")

    def generate(
        self,
        prompt: str,
        image: Optional[Image.Image] = None,  # Input image for image-to-video
        num_inference_steps: int = 50,  # LTX default
        duration_seconds: int = 4,
        fps: int = 15,  # Match HunyuanVideo fps
        guidance_scale: float = 3.0,  # LTX default
        width: int = 1280,  # Match HunyuanVideo width
        height: int = 704,  # Closest to 720 divisible by 32
        seed: Optional[int] = None
    ) -> str:
        """Generate video from text prompt or image+prompt using LTX-Video."""
        if not self.text_pipeline:
            raise VideoGenerationError("Pipeline not loaded")

        try:
            # Pre-generation cleanup
            if self.device == "cuda":
                gc.collect()
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()

            # LTX-Video uses 8n+1 frame formula
            num_frames = ((duration_seconds * fps) // 8) * 8 + 1
            logger.info(f"Generating {num_frames} frames at {fps} fps ({duration_seconds}s)")
            logger.info(f"Resolution: {width}x{height}")
            logger.info(f"Prompt: {prompt[:100]}...")

            generator = None
            if seed is not None:
                generator = torch.Generator(device="cpu").manual_seed(seed)
                logger.info(f"Using seed: {seed}")

            # Choose pipeline based on whether image is provided
            if image is not None:
                logger.info(f"Using image-to-video pipeline (image size: {image.size})")
                # Resize image to match output dimensions if needed
                if image.size != (width, height):
                    logger.info(f"Resizing image from {image.size} to ({width}, {height})")
                    image = image.resize((width, height), Image.Resampling.LANCZOS)

                output = self.image_pipeline(
                    image=image,
                    prompt=prompt,
                    negative_prompt="worst quality, blurry, jittery, distorted",
                    width=width,
                    height=height,
                    num_frames=num_frames,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    generator=generator,
                )
            else:
                logger.info("Using text-to-video pipeline")
                output = self.text_pipeline(
                    prompt=prompt,
                    negative_prompt="worst quality, blurry, jittery, distorted",
                    width=width,
                    height=height,
                    num_frames=num_frames,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    generator=generator,
                )

            if torch.cuda.is_available():
                peak_memory = torch.cuda.max_memory_allocated() / 1e9
                logger.info(f"Peak GPU memory: {peak_memory:.2f}GB")

            frames = output.frames[0]
            if frames is None or len(frames) == 0:
                raise VideoGenerationError("No frames generated")

            logger.info(f"Generated {len(frames)} frames")

            # Save video
            video_path = self._save_video(frames, fps)

            # Cleanup
            del output, frames
            if self.device == "cuda":
                torch.cuda.synchronize()
                torch.cuda.empty_cache()
                gc.collect()

            return video_path

        except Exception as e:
            logger.error(f"LTX-Video generation failed: {str(e)}")
            raise VideoGenerationError(f"Generation failed: {str(e)}")

    def _save_video(self, frames: List, fps: int) -> str:
        """Save frames to MP4 video file."""
        temp_dir = os.environ.get('TEMP_VIDEO_DIR', '/app/tmp_videos')
        os.makedirs(temp_dir, exist_ok=True)

        video_filename = f"video_{uuid.uuid4().hex}.mp4"
        video_path = os.path.join(temp_dir, video_filename)

        logger.info(f"Saving video to: {video_path}")
        export_to_video(frames, video_path, fps=fps)

        if not os.path.exists(video_path):
            raise VideoGenerationError("Video file was not created")

        file_size = os.path.getsize(video_path)
        logger.info(f"Video saved: {file_size / 1024 / 1024:.2f} MB")

        return video_path


class HunyuanVideo15I2VGenerator(BaseVideoGenerator):
    """
    HunyuanVideo-1.5 Image-to-Video (480P) generator.
    Uses the 8.3B parameter model for high-quality image animation.

    Model: hunyuanvideo-community/HunyuanVideo-1.5-Diffusers-480p_i2v
    Native resolution: 480p
    Recommended: 50 steps, CFG 6.0

    Supports bitsandbytes 4-bit quantization for reduced VRAM usage (~14GB vs ~33GB).
    """

    MODEL_ID = "hunyuanvideo-community/HunyuanVideo-1.5-Diffusers-480p_i2v"

    def __init__(self, use_quantization: bool = True):
        """
        Initialize HunyuanVideo-1.5 I2V generator.

        Args:
            use_quantization: If True, use bitsandbytes 4-bit NF4 quantization
                            for the transformer to reduce VRAM from ~33GB to ~14GB.
                            Default: True
        """
        super().__init__()
        self.use_quantization = use_quantization
        logger.info(f"Initializing HunyuanVideo15I2VGenerator")
        logger.info(f"Quantization enabled: {self.use_quantization}")
        logger.info(f"Model ID: {self.MODEL_ID}")
        logger.info(f"Device: {self.device}")
        logger.info(f"HF cache: {os.environ.get('HF_HOME', '/app/hf_cache')}")
        self._load_model()

    def _load_model(self):
        """Load HunyuanVideo-1.5 Image-to-Video pipeline with optional quantization."""
        try:
            if self.use_quantization:
                logger.info("Loading HunyuanVideo-1.5 I2V with bitsandbytes 4-bit quantization...")

                # Configure bitsandbytes 4-bit NF4 quantization for the transformer
                # This reduces VRAM usage from ~33GB to ~14GB with minimal quality loss
                pipeline_quant_config = PipelineQuantizationConfig(
                    quant_backend="bitsandbytes_4bit",
                    quant_kwargs={
                        "load_in_4bit": True,
                        "bnb_4bit_quant_type": "nf4",
                        "bnb_4bit_compute_dtype": torch.bfloat16
                    },
                    components_to_quantize=["transformer"]
                )

                self.pipeline = HunyuanVideo15ImageToVideoPipeline.from_pretrained(
                    self.MODEL_ID,
                    quantization_config=pipeline_quant_config,
                    torch_dtype=torch.bfloat16,
                )
                logger.info("Pipeline loaded with 4-bit quantization")
            else:
                logger.info("Loading HunyuanVideo-1.5 I2V without quantization (full BF16)...")

                self.pipeline = HunyuanVideo15ImageToVideoPipeline.from_pretrained(
                    self.MODEL_ID,
                    torch_dtype=torch.bfloat16,
                )
                logger.info("Pipeline loaded from pretrained")

            # IMPORTANT: Use enable_model_cpu_offload, NOT enable_sequential_cpu_offload
            # There's a known bug with sequential offload + bitsandbytes int4:
            # https://github.com/huggingface/diffusers/issues/10800
            logger.info("Enabling model CPU offload...")
            self.pipeline.enable_model_cpu_offload()

            # Enable VAE optimizations
            if hasattr(self.pipeline.vae, 'enable_tiling'):
                self.pipeline.vae.enable_tiling()
            if hasattr(self.pipeline.vae, 'enable_slicing'):
                self.pipeline.vae.enable_slicing()
            logger.info("VAE memory optimizations enabled")

            # Configure guidance scale via guider (HunyuanVideo 1.5 specific)
            # Default CFG of 6.0 is set at generation time

            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated() / 1e9
                reserved = torch.cuda.memory_reserved() / 1e9
                logger.info(f"GPU memory after load - Allocated: {allocated:.2f}GB, Reserved: {reserved:.2f}GB")

            quant_status = "with 4-bit quantization" if self.use_quantization else "without quantization"
            logger.info(f"HunyuanVideo-1.5 I2V pipeline loaded successfully {quant_status}!")

        except Exception as e:
            logger.error(f"Failed to load HunyuanVideo-1.5 I2V: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            raise VideoGenerationError(f"HunyuanVideo-1.5 I2V loading failed: {str(e)}")

    def generate(
        self,
        prompt: str,
        image: Optional[Image.Image] = None,
        num_inference_steps: int = 50,
        duration_seconds: int = 4,
        fps: int = 24,  # HunyuanVideo native fps
        guidance_scale: float = 6.0,
        width: int = 848,  # 480p width
        height: int = 480,  # 480p height
        seed: Optional[int] = None
    ) -> str:
        """Generate video from image + prompt using HunyuanVideo-1.5 I2V."""
        if not self.pipeline:
            raise VideoGenerationError("Pipeline not loaded")

        if image is None:
            raise VideoGenerationError("HunyuanVideo-1.5 I2V requires an input image")

        try:
            # Pre-generation cleanup
            if self.device == "cuda":
                gc.collect()
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()

            # HunyuanVideo uses 4k+1 frame formula
            num_frames = (duration_seconds * fps // 4) * 4 + 1
            logger.info(f"Generating {num_frames} frames at {fps} fps ({duration_seconds}s)")
            logger.info(f"Resolution: {width}x{height}")
            logger.info(f"Prompt: {prompt[:100]}...")

            generator = None
            if seed is not None:
                generator = torch.Generator(device="cpu").manual_seed(seed)
                logger.info(f"Using seed: {seed}")

            # Resize image to match output dimensions if needed
            if image.size != (width, height):
                logger.info(f"Resizing image from {image.size} to ({width}, {height})")
                image = image.resize((width, height), Image.Resampling.LANCZOS)

            # Configure guidance scale via guider (HunyuanVideo 1.5 specific pattern)
            if hasattr(self.pipeline, 'guider') and hasattr(self.pipeline.guider, 'new'):
                self.pipeline.guider = self.pipeline.guider.new(guidance_scale=guidance_scale)
                logger.info(f"Set guidance scale to {guidance_scale} via guider")

            logger.info("Running HunyuanVideo-1.5 I2V inference...")
            output = self.pipeline(
                prompt=prompt,
                image=image,
                num_frames=num_frames,
                num_inference_steps=num_inference_steps,
                generator=generator,
            )

            if torch.cuda.is_available():
                peak_memory = torch.cuda.max_memory_allocated() / 1e9
                logger.info(f"Peak GPU memory: {peak_memory:.2f}GB")

            frames = output.frames[0]
            if frames is None or len(frames) == 0:
                raise VideoGenerationError("No frames generated")

            logger.info(f"Generated {len(frames)} frames")

            # Save video
            video_path = self._save_video(frames, fps)

            # Cleanup
            del output, frames
            if self.device == "cuda":
                torch.cuda.synchronize()
                torch.cuda.empty_cache()
                gc.collect()

            return video_path

        except Exception as e:
            logger.error(f"HunyuanVideo-1.5 I2V generation failed: {str(e)}")
            raise VideoGenerationError(f"Generation failed: {str(e)}")

    def _save_video(self, frames: List, fps: int) -> str:
        """Save frames to MP4 video file."""
        temp_dir = os.environ.get('TEMP_VIDEO_DIR', '/app/tmp_videos')
        os.makedirs(temp_dir, exist_ok=True)

        video_filename = f"video_{uuid.uuid4().hex}.mp4"
        video_path = os.path.join(temp_dir, video_filename)

        logger.info(f"Saving video to: {video_path}")
        export_to_video(frames, video_path, fps=fps)

        if not os.path.exists(video_path):
            raise VideoGenerationError("Video file was not created")

        file_size = os.path.getsize(video_path)
        logger.info(f"Video saved: {file_size / 1024 / 1024:.2f} MB")

        return video_path


def create_video_generator(model_type: Optional[str] = None, use_quantization: Optional[bool] = None) -> BaseVideoGenerator:
    """
    Factory to create video generator based on VIDEO_MODEL env var.

    Args:
        model_type: 'hunyuan-video', 'ltx-video', or 'hunyuan-video-15-i2v'.
                   Defaults to VIDEO_MODEL env var or 'hunyuan-video'.
        use_quantization: Whether to use quantization for models that support it.
                         Defaults to I2V_USE_QUANTIZATION env var or True.
                         Currently only affects hunyuan-video-15-i2v.
    """
    model_type = model_type or os.environ.get('VIDEO_MODEL', 'hunyuan-video')

    # Determine quantization setting from env var if not explicitly provided
    if use_quantization is None:
        use_quantization = os.environ.get('I2V_USE_QUANTIZATION', 'true').lower() == 'true'

    if model_type == 'hunyuan-video':
        logger.info("Creating HunyuanVideo generator")
        return HunyuanVideoGenerator()
    elif model_type == 'ltx-video':
        logger.info("Creating LTX-Video generator")
        return LTXVideoGenerator()
    elif model_type == 'hunyuan-video-15-i2v':
        logger.info(f"Creating HunyuanVideo-1.5 I2V generator (quantization: {use_quantization})")
        return HunyuanVideo15I2VGenerator(use_quantization=use_quantization)
    else:
        raise ValueError(f"Unknown model: {model_type}. Use: hunyuan-video, ltx-video, hunyuan-video-15-i2v")


# Backward compatibility alias
VideoGenerator = HunyuanVideoGenerator


def test_generation():
    """Test function for local development."""
    logger.info("Starting test generation...")

    generator = VideoGenerator()

    video_path = generator.generate(
        prompt="A cat playing with a ball of yarn, cinematic lighting",
        num_inference_steps=30,
        duration_seconds=3,
        fps=15,
        seed=42
    )

    logger.info(f"Test video generated: {video_path}")
    return video_path


if __name__ == "__main__":
    # Run test
    test_generation()
