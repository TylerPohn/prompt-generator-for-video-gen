#!/usr/bin/env python3
"""
Test script for HunyuanVideo-1.5 I2V quantization validation.

Phase 2 validation per thoughts/shared/research/2025-12-31-i2v-quantization-handoff.md:
1. Test generation quality with quantization enabled
2. Measure actual memory usage reduction
3. Verify guider pattern still works with quantized model
4. Test with CPU offload combination
5. Compare generation times

Usage:
    python test_i2v_quantization.py [--no-quantization] [--skip-generation]

Environment:
    Requires CUDA GPU with ~16GB+ VRAM for quantized model testing.
    Set HF_HOME to cache directory if needed.
"""
import argparse
import gc
import os
import sys
import time
from datetime import datetime
from typing import Optional

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


def test_imports() -> bool:
    """Test that all required imports work."""
    print("\n" + "="*60)
    print("TEST: Import validation")
    print("="*60)

    try:
        import torch
        from diffusers import HunyuanVideo15ImageToVideoPipeline
        from diffusers.quantizers import PipelineQuantizationConfig
        from PIL import Image
        print(f"✓ PyTorch {torch.__version__}")
        print(f"✓ CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"  GPU: {torch.cuda.get_device_name(0)}")
            mem = get_gpu_memory()
            print(f"  Total VRAM: {mem['total_gb']} GB")
        print("✓ HunyuanVideo15ImageToVideoPipeline imported")
        print("✓ PipelineQuantizationConfig imported")
        print("✓ PIL.Image imported")
        return True
    except ImportError as e:
        print(f"✗ Import error: {e}")
        return False


def test_quantization_config() -> bool:
    """Test that PipelineQuantizationConfig can be created for I2V."""
    print("\n" + "="*60)
    print("TEST: PipelineQuantizationConfig creation")
    print("="*60)

    try:
        import torch
        from diffusers.quantizers import PipelineQuantizationConfig

        config = PipelineQuantizationConfig(
            quant_backend="bitsandbytes_4bit",
            quant_kwargs={
                "load_in_4bit": True,
                "bnb_4bit_quant_type": "nf4",
                "bnb_4bit_compute_dtype": torch.bfloat16
            },
            components_to_quantize=["transformer"]
        )

        print(f"✓ PipelineQuantizationConfig created successfully")
        print(f"  Backend: bitsandbytes_4bit")
        print(f"  Quant type: nf4")
        print(f"  Compute dtype: bfloat16")
        print(f"  Components: ['transformer']")
        return True
    except Exception as e:
        print(f"✗ Config creation failed: {e}")
        return False


def test_model_load_quantized() -> Optional[object]:
    """Test loading the I2V model with quantization."""
    print("\n" + "="*60)
    print("TEST: Load quantized I2V model")
    print("="*60)

    import torch
    if not torch.cuda.is_available():
        print("⚠ Skipping: No CUDA available")
        return None

    try:
        from diffusers import HunyuanVideo15ImageToVideoPipeline
        from diffusers.quantizers import PipelineQuantizationConfig

        clear_gpu_memory()
        mem_before = get_gpu_memory()
        print(f"Memory before load: {mem_before['allocated_gb']} GB allocated")

        start_time = time.time()

        MODEL_ID = "hunyuanvideo-community/HunyuanVideo-1.5-Diffusers-480p_i2v"

        print(f"Loading {MODEL_ID} with 4-bit quantization...")

        pipeline_quant_config = PipelineQuantizationConfig(
            quant_backend="bitsandbytes_4bit",
            quant_kwargs={
                "load_in_4bit": True,
                "bnb_4bit_quant_type": "nf4",
                "bnb_4bit_compute_dtype": torch.bfloat16
            },
            components_to_quantize=["transformer"]
        )

        pipeline = HunyuanVideo15ImageToVideoPipeline.from_pretrained(
            MODEL_ID,
            quantization_config=pipeline_quant_config,
            torch_dtype=torch.bfloat16,
        )

        load_time = time.time() - start_time
        print(f"✓ Model loaded in {load_time:.2f}s")

        # Enable CPU offload (NOT sequential - known bug)
        print("Enabling model CPU offload...")
        pipeline.enable_model_cpu_offload()
        print("✓ CPU offload enabled")

        # Enable VAE optimizations
        if hasattr(pipeline.vae, 'enable_tiling'):
            pipeline.vae.enable_tiling()
        if hasattr(pipeline.vae, 'enable_slicing'):
            pipeline.vae.enable_slicing()
        print("✓ VAE optimizations enabled")

        mem_after = get_gpu_memory()
        print(f"Memory after load: {mem_after['allocated_gb']} GB allocated")
        print(f"Memory increase: {mem_after['allocated_gb'] - mem_before['allocated_gb']:.3f} GB")

        return pipeline

    except Exception as e:
        print(f"✗ Model load failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_guider_pattern(pipeline) -> bool:
    """Test that the guider pattern works with quantized model."""
    print("\n" + "="*60)
    print("TEST: Guider pattern for guidance_scale")
    print("="*60)

    if pipeline is None:
        print("⚠ Skipping: No pipeline available")
        return False

    try:
        # Check guider exists
        if not hasattr(pipeline, 'guider'):
            print("✗ Pipeline has no 'guider' attribute")
            return False

        print(f"✓ Pipeline has guider: {type(pipeline.guider).__name__}")

        # Check guider has 'new' method
        if not hasattr(pipeline.guider, 'new'):
            print("✗ Guider has no 'new' method")
            return False

        print("✓ Guider has 'new' method")

        # Test updating guidance scale
        original_guider = pipeline.guider
        new_guider = pipeline.guider.new(guidance_scale=5.0)
        pipeline.guider = new_guider

        print("✓ Updated guidance_scale to 5.0 via guider.new()")

        # Restore
        pipeline.guider = original_guider
        print("✓ Restored original guider")

        return True

    except Exception as e:
        print(f"✗ Guider pattern test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_generation(pipeline, output_dir: str = "/tmp") -> bool:
    """Test actual video generation with quantized model."""
    print("\n" + "="*60)
    print("TEST: Video generation with quantized model")
    print("="*60)

    if pipeline is None:
        print("⚠ Skipping: No pipeline available")
        return False

    import torch
    from PIL import Image

    try:
        clear_gpu_memory()
        torch.cuda.reset_peak_memory_stats()

        mem_before = get_gpu_memory()
        print(f"Memory before generation: {mem_before['allocated_gb']} GB")

        # Create a test image (solid color for simplicity)
        print("Creating test image (848x480)...")
        test_image = Image.new('RGB', (848, 480), color=(100, 150, 200))

        # Set guidance scale via guider pattern
        pipeline.guider = pipeline.guider.new(guidance_scale=6.0)

        # Generate short video for testing
        prompt = "A serene landscape with gentle wind movement"
        num_frames = 17  # 4*4+1 = minimum for HunyuanVideo

        print(f"Generating {num_frames} frames...")
        print(f"Prompt: {prompt}")

        start_time = time.time()

        generator = torch.Generator(device="cpu").manual_seed(42)

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

        print(f"✓ Generation completed in {generation_time:.2f}s")
        print(f"Peak GPU memory: {peak_memory} GB")

        # Validate output
        frames = output.frames[0]
        if frames is None or len(frames) == 0:
            print("✗ No frames generated")
            return False

        print(f"✓ Generated {len(frames)} frames")

        # Save first frame as proof
        output_path = os.path.join(output_dir, "i2v_quant_test_frame.png")
        frames[0].save(output_path)
        print(f"✓ First frame saved to: {output_path}")

        # Cleanup
        del output, frames
        clear_gpu_memory()

        return True

    except Exception as e:
        print(f"✗ Generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_memory_comparison() -> dict:
    """Compare memory usage between quantized and non-quantized models.

    Note: This test requires significant VRAM and time. It loads each model
    separately and compares memory usage.
    """
    print("\n" + "="*60)
    print("TEST: Memory comparison (quantized vs non-quantized)")
    print("="*60)

    import torch
    if not torch.cuda.is_available():
        print("⚠ Skipping: No CUDA available")
        return {}

    results = {}

    # Test quantized first (already done above, but we'll record it)
    print("\n--- Quantized Model ---")
    clear_gpu_memory()

    try:
        from diffusers import HunyuanVideo15ImageToVideoPipeline
        from diffusers.quantizers import PipelineQuantizationConfig

        MODEL_ID = "hunyuanvideo-community/HunyuanVideo-1.5-Diffusers-480p_i2v"

        pipeline_quant_config = PipelineQuantizationConfig(
            quant_backend="bitsandbytes_4bit",
            quant_kwargs={
                "load_in_4bit": True,
                "bnb_4bit_quant_type": "nf4",
                "bnb_4bit_compute_dtype": torch.bfloat16
            },
            components_to_quantize=["transformer"]
        )

        pipeline = HunyuanVideo15ImageToVideoPipeline.from_pretrained(
            MODEL_ID,
            quantization_config=pipeline_quant_config,
            torch_dtype=torch.bfloat16,
        )
        pipeline.enable_model_cpu_offload()

        mem_quantized = get_gpu_memory()
        results['quantized_allocated_gb'] = mem_quantized['allocated_gb']
        print(f"Quantized model: {mem_quantized['allocated_gb']} GB allocated")

        # Cleanup
        del pipeline
        clear_gpu_memory()

    except Exception as e:
        print(f"Quantized test failed: {e}")

    # Test non-quantized (requires much more VRAM)
    print("\n--- Non-Quantized Model ---")
    print("Note: This requires ~33GB VRAM. Skipping on consumer GPUs.")

    total_vram = torch.cuda.get_device_properties(0).total_memory / 1e9
    if total_vram < 32:
        print(f"⚠ Only {total_vram:.1f}GB VRAM available. Skipping non-quantized test.")
        results['non_quantized_skipped'] = True
        results['reason'] = f"Insufficient VRAM ({total_vram:.1f}GB < 32GB required)"
    else:
        try:
            clear_gpu_memory()

            pipeline = HunyuanVideo15ImageToVideoPipeline.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.bfloat16,
            )
            pipeline.enable_model_cpu_offload()

            mem_non_quantized = get_gpu_memory()
            results['non_quantized_allocated_gb'] = mem_non_quantized['allocated_gb']
            print(f"Non-quantized model: {mem_non_quantized['allocated_gb']} GB allocated")

            # Cleanup
            del pipeline
            clear_gpu_memory()

        except Exception as e:
            print(f"Non-quantized test failed: {e}")
            results['non_quantized_error'] = str(e)

    # Calculate savings if both were tested
    if 'quantized_allocated_gb' in results and 'non_quantized_allocated_gb' in results:
        savings = results['non_quantized_allocated_gb'] - results['quantized_allocated_gb']
        savings_pct = (savings / results['non_quantized_allocated_gb']) * 100
        results['memory_savings_gb'] = round(savings, 2)
        results['memory_savings_pct'] = round(savings_pct, 1)
        print(f"\nMemory savings: {savings:.2f} GB ({savings_pct:.1f}%)")

    return results


def run_all_tests(skip_generation: bool = False, use_quantization: bool = True):
    """Run all Phase 2 validation tests."""
    print("\n" + "#"*60)
    print("# HunyuanVideo-1.5 I2V Quantization Validation")
    print(f"# Date: {datetime.now().isoformat()}")
    print(f"# Quantization: {'enabled' if use_quantization else 'disabled'}")
    print("#"*60)

    results = {
        "timestamp": datetime.now().isoformat(),
        "use_quantization": use_quantization,
        "tests": {}
    }

    # Test 1: Imports
    results["tests"]["imports"] = test_imports()

    # Test 2: Quantization config
    results["tests"]["quant_config"] = test_quantization_config()

    # Test 3: Model loading (with quantization)
    pipeline = None
    if use_quantization:
        pipeline = test_model_load_quantized()
        results["tests"]["model_load"] = pipeline is not None
    else:
        print("\n⚠ Skipping quantized model load (--no-quantization)")
        results["tests"]["model_load"] = "skipped"

    # Test 4: Guider pattern
    results["tests"]["guider_pattern"] = test_guider_pattern(pipeline)

    # Test 5: Generation
    if not skip_generation and pipeline is not None:
        results["tests"]["generation"] = test_generation(pipeline)
    else:
        print("\n⚠ Skipping generation test")
        results["tests"]["generation"] = "skipped"

    # Cleanup
    if pipeline is not None:
        del pipeline
        clear_gpu_memory()

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    passed = 0
    failed = 0
    skipped = 0

    for test_name, result in results["tests"].items():
        if result == "skipped":
            status = "⚠ SKIPPED"
            skipped += 1
        elif result:
            status = "✓ PASSED"
            passed += 1
        else:
            status = "✗ FAILED"
            failed += 1
        print(f"  {test_name}: {status}")

    print(f"\nTotal: {passed} passed, {failed} failed, {skipped} skipped")

    # Final GPU memory
    import torch
    if torch.cuda.is_available():
        mem = get_gpu_memory()
        print(f"Final GPU memory: {mem['allocated_gb']} GB allocated")

    return failed == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test I2V quantization")
    parser.add_argument("--no-quantization", action="store_true",
                       help="Skip quantization tests")
    parser.add_argument("--skip-generation", action="store_true",
                       help="Skip actual video generation test")
    parser.add_argument("--memory-comparison", action="store_true",
                       help="Run memory comparison between quantized and non-quantized")
    args = parser.parse_args()

    success = run_all_tests(
        skip_generation=args.skip_generation,
        use_quantization=not args.no_quantization
    )

    if args.memory_comparison:
        test_memory_comparison()

    sys.exit(0 if success else 1)
