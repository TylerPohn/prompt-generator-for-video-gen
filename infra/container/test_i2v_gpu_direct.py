#!/usr/bin/env python3
"""
Test script for HunyuanVideo-1.5 I2V with DIRECT GPU loading (no CPU offload).

This tests building the model directly on the GPU to avoid CPU<->GPU transfer latency.
With 4-bit quantization, the model should fit in ~14GB VRAM.

Usage:
    python test_i2v_gpu_direct.py [--skip-generation]
"""
import argparse
import gc
import os
import sys
import time
from datetime import datetime

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def get_gpu_memory() -> dict:
    """Get current GPU memory stats."""
    import torch
    if not torch.cuda.is_available():
        return {"error": "CUDA not available"}

    return {
        "allocated_gb": round(torch.cuda.memory_allocated() / 1e9, 3),
        "reserved_gb": round(torch.cuda.memory_reserved() / 1e9, 3),
        "max_allocated_gb": round(torch.cuda.max_memory_allocated() / 1e9, 3),
        "total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1e9, 2),
    }


def clear_gpu_memory():
    """Clear GPU memory cache."""
    import torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()


def test_gpu_direct_load():
    """Load I2V model directly on GPU with quantization (no CPU offload)."""
    print("\n" + "="*60)
    print("TEST: Load quantized I2V model DIRECTLY on GPU")
    print("="*60)

    import torch
    if not torch.cuda.is_available():
        print("CUDA not available")
        return None

    try:
        from diffusers import HunyuanVideo15ImageToVideoPipeline
        from diffusers.quantizers import PipelineQuantizationConfig

        clear_gpu_memory()
        mem_before = get_gpu_memory()
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"Total VRAM: {mem_before['total_gb']} GB")
        print(f"Memory before load: {mem_before['allocated_gb']} GB allocated")

        MODEL_ID = "hunyuanvideo-community/HunyuanVideo-1.5-Diffusers-480p_i2v"

        print(f"\nLoading {MODEL_ID}")
        print("With 4-bit quantization, DIRECTLY to GPU (no CPU offload)...")

        start_time = time.time()

        # Configure bitsandbytes 4-bit NF4 quantization
        pipeline_quant_config = PipelineQuantizationConfig(
            quant_backend="bitsandbytes_4bit",
            quant_kwargs={
                "load_in_4bit": True,
                "bnb_4bit_quant_type": "nf4",
                "bnb_4bit_compute_dtype": torch.bfloat16
            },
            components_to_quantize=["transformer"]
        )

        # Load directly to CUDA device (no CPU offload)
        pipeline = HunyuanVideo15ImageToVideoPipeline.from_pretrained(
            MODEL_ID,
            quantization_config=pipeline_quant_config,
            torch_dtype=torch.bfloat16,
        ).to("cuda")  # Direct GPU placement

        load_time = time.time() - start_time
        print(f"Model loaded in {load_time:.2f}s")

        mem_after = get_gpu_memory()
        print(f"Memory after load: {mem_after['allocated_gb']} GB allocated")
        print(f"Memory increase: {mem_after['allocated_gb'] - mem_before['allocated_gb']:.3f} GB")

        # Enable VAE optimizations
        if hasattr(pipeline.vae, 'enable_tiling'):
            pipeline.vae.enable_tiling()
            print("VAE tiling enabled")
        if hasattr(pipeline.vae, 'enable_slicing'):
            pipeline.vae.enable_slicing()
            print("VAE slicing enabled")

        return pipeline

    except Exception as e:
        print(f"Model load failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_generation(pipeline, output_dir: str = "/tmp"):
    """Test video generation with GPU-direct model."""
    print("\n" + "="*60)
    print("TEST: Video generation (GPU-direct)")
    print("="*60)

    if pipeline is None:
        print("Skipping: No pipeline available")
        return False

    import torch
    from PIL import Image

    try:
        clear_gpu_memory()
        torch.cuda.reset_peak_memory_stats()

        mem_before = get_gpu_memory()
        print(f"Memory before generation: {mem_before['allocated_gb']} GB")

        # Create test image
        print("Creating test image (848x480)...")
        test_image = Image.new('RGB', (848, 480), color=(100, 150, 200))

        # Set guidance scale via guider
        if hasattr(pipeline, 'guider') and hasattr(pipeline.guider, 'new'):
            pipeline.guider = pipeline.guider.new(guidance_scale=6.0)
            print("Guidance scale set to 6.0")

        prompt = "A serene landscape with gentle wind movement"
        num_frames = 17  # Minimum: 4*4+1

        print(f"Generating {num_frames} frames...")
        print(f"Prompt: {prompt}")

        start_time = time.time()
        generator = torch.Generator(device="cuda").manual_seed(42)

        output = pipeline(
            prompt=prompt,
            image=test_image,
            num_frames=num_frames,
            num_inference_steps=10,  # Low for testing
            generator=generator,
        )

        generation_time = time.time() - start_time

        mem_after = get_gpu_memory()
        peak_memory = mem_after['max_allocated_gb']

        print(f"Generation completed in {generation_time:.2f}s")
        print(f"Peak GPU memory: {peak_memory} GB")

        frames = output.frames[0]
        if frames is None or len(frames) == 0:
            print("No frames generated")
            return False

        print(f"Generated {len(frames)} frames")

        # Save first frame
        output_path = os.path.join(output_dir, "i2v_gpu_direct_test.png")
        first_frame = frames[0]
        if isinstance(first_frame, Image.Image):
            first_frame.save(output_path)
        else:
            Image.fromarray(first_frame).save(output_path)
        print(f"First frame saved to: {output_path}")

        del output, frames
        clear_gpu_memory()

        return True

    except Exception as e:
        print(f"Generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    parser = argparse.ArgumentParser(description="Test I2V GPU-direct loading")
    parser.add_argument("--skip-generation", action="store_true",
                       help="Skip video generation test")
    args = parser.parse_args()

    print("\n" + "#"*60)
    print("# HunyuanVideo-1.5 I2V - GPU Direct Loading Test")
    print(f"# Date: {datetime.now().isoformat()}")
    print("#"*60)

    # Test 1: GPU-direct load
    pipeline = test_gpu_direct_load()

    # Test 2: Generation
    if not args.skip_generation and pipeline is not None:
        test_generation(pipeline)

    # Cleanup
    if pipeline is not None:
        del pipeline
        clear_gpu_memory()

    print("\n" + "="*60)
    print("DONE")
    print("="*60)

    import torch
    if torch.cuda.is_available():
        mem = get_gpu_memory()
        print(f"Final GPU memory: {mem['allocated_gb']} GB")


if __name__ == "__main__":
    main()
