#!/usr/bin/env python3
"""Test that all dependencies import correctly."""
import sys

def test_imports():
    errors = []

    # Core
    try:
        import fastapi
        import uvicorn
        import pydantic
        print(f"✓ FastAPI {fastapi.__version__}")
    except ImportError as e:
        errors.append(f"FastAPI: {e}")

    # PyTorch
    try:
        import torch
        print(f"✓ PyTorch {torch.__version__}")
        print(f"  CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"  CUDA version: {torch.version.cuda}")
            print(f"  GPU: {torch.cuda.get_device_name(0)}")
    except ImportError as e:
        errors.append(f"PyTorch: {e}")

    # Diffusers
    try:
        import diffusers
        print(f"✓ Diffusers {diffusers.__version__}")
    except ImportError as e:
        errors.append(f"Diffusers: {e}")

    # Transformers
    try:
        import transformers
        print(f"✓ Transformers {transformers.__version__}")
    except ImportError as e:
        errors.append(f"Transformers: {e}")

    # Accelerate
    try:
        import accelerate
        print(f"✓ Accelerate {accelerate.__version__}")
    except ImportError as e:
        errors.append(f"Accelerate: {e}")

    # Video processing
    try:
        import imageio
        import av
        import numpy
        import PIL
        print(f"✓ Video processing (imageio, av, numpy, PIL)")
    except ImportError as e:
        errors.append(f"Video processing: {e}")

    # AWS
    try:
        import boto3
        print(f"✓ Boto3 {boto3.__version__}")
    except ImportError as e:
        errors.append(f"Boto3: {e}")

    # Test DiffusionPipeline import (without loading model)
    try:
        from diffusers import DiffusionPipeline
        print(f"✓ DiffusionPipeline importable")
    except ImportError as e:
        errors.append(f"DiffusionPipeline: {e}")

    if errors:
        print("\n❌ ERRORS:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print("\n✅ All dependencies imported successfully!")
    return 0

if __name__ == "__main__":
    sys.exit(test_imports())
