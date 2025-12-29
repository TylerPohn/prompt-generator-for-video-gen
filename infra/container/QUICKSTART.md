# Quick Start Guide

## Prerequisites

1. **NVIDIA GPU** with CUDA support
2. **Docker** with NVIDIA Container Toolkit
3. **AWS credentials** with S3 access

## Setup (2 minutes)

### 1. Configure AWS Credentials

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra/container
cp .env.example .env
```

Edit `.env` and add your AWS credentials:
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
```

### 2. Build the Container

```bash
./build.sh
```

This will take 10-15 minutes (downloads models and dependencies).

### 3. Start the Server

```bash
docker-compose up -d
```

### 4. Verify It's Running

```bash
./test_api.sh
```

You should see:
```
✓ Health check passed
✓ Root endpoint passed
```

## Generate Your First Video

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over the ocean with waves",
    "job_id": "my-first-video",
    "bucket_name": "your-s3-bucket-name",
    "steps": 30,
    "duration": 3,
    "fps": 8,
    "seed": 42
  }'
```

Response:
```json
{
  "status": "completed",
  "video_key": "generated-videos/my-first-video.mp4",
  "job_id": "my-first-video",
  "message": "Video generated and uploaded successfully",
  "generation_time_seconds": 45.32
}
```

## View Logs

```bash
docker-compose logs -f
```

## Stop the Server

```bash
docker-compose down
```

## Troubleshooting

### Port Already in Use
```bash
# Change port in docker-compose.yml
ports:
  - "8001:8000"  # Use 8001 instead
```

### GPU Not Found
```bash
# Verify NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:12.1.0-runtime-ubuntu22.04 nvidia-smi
```

### Out of Memory
Reduce video parameters:
- Set `width: 256, height: 256`
- Set `duration: 2`
- Set `steps: 20`

## Next Steps

- See [README.md](README.md) for full documentation
- Check API docs at http://localhost:8000/docs
- Monitor with `docker stats wan2-video-generator`
