"""
Inference logic for HunyuanVideo-1.5 video generation.
Uses GGUF Q8 quantization for near-lossless quality with ~14GB VRAM usage.
"""
import os
import tempfile
import uuid
from typing import Optional, List
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
from diffusers import HunyuanVideoPipeline, HunyuanVideoTransformer3DModel, GGUFQuantizationConfig
from diffusers.utils import export_to_video


class VideoGenerationError(Exception):
    """Custom exception for video generation errors."""
    pass


class VideoGenerator:
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
        self.model_id = model_id
        self.gguf_path = gguf_path or os.environ.get('GGUF_MODEL_PATH', self.DEFAULT_GGUF_PATH)
        self.pipeline = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        logger.info(f"Initializing VideoGenerator with GGUF quantization")
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

            # Move to GPU in smaller steps to avoid OOM during loading
            logger.info("Moving VAE to GPU...")
            self.pipeline.vae = self.pipeline.vae.to(self.device)
            logger.info("Moving text encoders to GPU...")
            self.pipeline.text_encoder = self.pipeline.text_encoder.to(self.device)
            if hasattr(self.pipeline, 'text_encoder_2'):
                self.pipeline.text_encoder_2 = self.pipeline.text_encoder_2.to(self.device)

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
