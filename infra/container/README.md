# Wan2.2-T2V-A14B Video Generation Inference Server

Production-ready Docker container and FastAPI server for text-to-video generation using the Wan2.2-T2V-A14B model (via Lightricks/LTX-Video).

## Features

- **FastAPI REST API** with automatic documentation
- **GPU-accelerated inference** with CUDA 12.1 support
- **Automatic S3 upload** of generated videos
- **Health checks** and monitoring
- **Production-ready logging** with rotation
- **Memory optimizations** (attention slicing, VAE tiling)
- **Error handling** and graceful degradation
- **Docker Compose** support for easy deployment

## Requirements

- NVIDIA GPU with CUDA support (12.1+)
- Docker with NVIDIA Container Toolkit
- At least 16GB GPU VRAM (A100 or equivalent recommended)
- AWS credentials for S3 upload

## Quick Start

### 1. Build the Docker Image

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra/container
docker build -t wan2-video-generator:latest .
```

### 2. Run with Docker Compose

Create a `.env` file:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

Start the service:

```bash
docker-compose up -d
```

### 3. Run with Docker

```bash
docker run -d \
  --name wan2-video-generator \
  --gpus all \
  -p 8000:8000 \
  -e AWS_ACCESS_KEY_ID=your_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret \
  -e AWS_REGION=us-east-1 \
  --shm-size=8g \
  wan2-video-generator:latest
```

## API Endpoints

### Health Check

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "cuda_available": true,
  "gpu_name": "NVIDIA A100-SXM4-40GB",
  "timestamp": "2025-12-23T12:00:00"
}
```

### Generate Video

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball of yarn",
    "job_id": "job-12345",
    "bucket_name": "my-video-bucket",
    "steps": 50,
    "duration": 4,
    "fps": 8,
    "seed": 42
  }'
```

Response:
```json
{
  "status": "completed",
  "video_key": "generated-videos/job-12345.mp4",
  "job_id": "job-12345",
  "message": "Video generated and uploaded successfully",
  "generation_time_seconds": 45.32
}
```

### API Documentation

Interactive API documentation available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| prompt | string | Yes | - | Text description of the video |
| job_id | string | Yes | - | Unique job identifier |
| bucket_name | string | Yes | - | S3 bucket name for output |
| seed | integer | No | random | Random seed for reproducibility |
| steps | integer | No | 50 | Number of inference steps (1-100) |
| duration | integer | No | 4 | Video duration in seconds (1-10) |
| fps | integer | No | 8 | Frames per second (4-30) |
| guidance_scale | float | No | 7.5 | Guidance scale (1.0-20.0) |
| width | integer | No | 512 | Video width in pixels (256-1024) |
| height | integer | No | 512 | Video height in pixels (256-1024) |

## Architecture

```
infra/container/
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Docker Compose configuration
├── requirements.txt        # Python dependencies
├── .dockerignore          # Docker ignore patterns
├── README.md              # This file
└── app/
    ├── __init__.py        # Package init
    ├── main.py            # FastAPI application
    ├── inference.py       # Video generation logic
    └── utils.py           # S3 upload and utilities
```

## Performance Optimization

The container includes several optimizations:

1. **Memory Efficiency**:
   - Attention slicing for reduced VRAM usage
   - VAE tiling for large videos
   - Automatic cleanup after generation

2. **Model Loading**:
   - Model loaded once at startup (warm start)
   - Cached in memory between requests

3. **GPU Utilization**:
   - FP16 precision for faster inference
   - CUDA-optimized PyTorch

## Monitoring

### Logs

Logs are stored in `/app/logs/` with automatic rotation:

```bash
docker exec wan2-video-generator tail -f /app/logs/app_*.log
```

### Health Checks

Docker includes built-in health checks:

```bash
docker ps  # Check STATUS column
```

## Troubleshooting

### GPU Not Detected

Ensure NVIDIA Container Toolkit is installed:

```bash
nvidia-smi  # Should show GPU
docker run --gpus all nvidia/cuda:12.1.0-runtime-ubuntu22.04 nvidia-smi
```

### Out of Memory

Reduce video parameters:
- Lower `width` and `height` (e.g., 256x256)
- Reduce `duration` or `fps`
- Reduce `steps`

### Slow Generation

- Check GPU utilization: `nvidia-smi`
- Ensure FP16 is being used (automatic on CUDA)
- Monitor with: `docker stats wan2-video-generator`

## Development

### Local Testing

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally (requires GPU)
cd app
python main.py
```

### Test Inference

```bash
cd app
python inference.py  # Runs test generation
```

## Production Deployment

### AWS ECS with GPU

1. Push image to ECR:
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker tag wan2-video-generator:latest <account>.dkr.ecr.us-east-1.amazonaws.com/wan2-video-generator:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/wan2-video-generator:latest
```

2. Create ECS task definition with GPU requirements
3. Deploy to ECS cluster with GPU instances (g4dn, p3, etc.)

### Kubernetes

Deploy using GPU node pools and NVIDIA device plugin.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| AWS_REGION | AWS region for S3 | us-east-1 |
| AWS_ACCESS_KEY_ID | AWS access key | - |
| AWS_SECRET_ACCESS_KEY | AWS secret key | - |
| HF_HOME | HuggingFace cache directory | /app/hf_cache |
| TRANSFORMERS_CACHE | Transformers cache | /app/hf_cache |
| TORCH_HOME | PyTorch cache | /app/torch_cache |
| TEMP_VIDEO_DIR | Temporary video directory | /app/tmp_videos |

## License

Proprietary - All rights reserved

## Support

For issues or questions, contact the development team.
