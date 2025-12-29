# GPU Connection & Architecture Guide

**Created**: 2025-12-28
**Status**: Reference Documentation

---

## GPU Connection & Debugging Info

### Current GPU Instance
```
Instance ID:    i-026929c584bc61c87
Instance Type:  g5.12xlarge (4× NVIDIA A10G GPUs)
Private IP:     172.31.76.117
VPC:           vpc-03cd6462b46350c8e
Security Group: sg-0c77e10a20dbb5dac
Region:        us-east-1
Port:          8000
```

### GPU Specs
```
GPUs:          4× NVIDIA A10G (22.5GB each = 92GB total VRAM)
RAM:           192GB
Model:         HunyuanVideo-1.5 GGUF Q8 (14GB transformer)
Memory Mode:   Model CPU offload (GGUF-compatible)
Cost:          $5.67/hour when running
```

### Connection Methods

**1. SSM Session (Primary)**
```bash
# Connect to GPU instance
aws ssm start-session --target i-026929c584bc61c87

# Check GPU status
nvidia-smi

# Check container
docker ps
docker logs video-inference

# Test health endpoint
curl http://localhost:8000/health

# Test direct inference
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with yarn",
    "job_id": "test-123",
    "bucket_name": "aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale",
    "steps": 20,
    "duration": 2,
    "width": 360,
    "height": 640
  }'
```

**2. Management Scripts**
```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Start GPU instance (takes ~3 min to load model)
./scripts/start-gpu.sh

# Check status
./scripts/gpu-status.sh

# Stop GPU (IMPORTANT - saves $5.67/hr!)
./scripts/stop-gpu.sh

# Test end-to-end API
./scripts/test-native-inference.sh
```

**3. API Gateway Endpoint**
```
Base URL: https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/

Endpoints:
  POST /generate    - Submit video generation job
  GET  /status/{id} - Check job status
```

### Debugging Commands

**Check Container Status**
```bash
# Via SSM session
docker ps -a
docker logs -f video-inference
docker restart video-inference
```

**Check GPU Memory**
```bash
# Via SSM session
nvidia-smi

# Watch GPU utilization during generation
watch -n 1 nvidia-smi
```

**Check S3 Output**
```bash
# List generated videos
aws s3 ls s3://aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale/generated-videos/

# Generate presigned URL
aws s3 presign s3://aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale/generated-videos/VIDEO_NAME.mp4 --expires-in 3600
```

**Check SSM Parameters**
```bash
# Get GPU endpoint
aws ssm get-parameter --name /video-generation/gpu-endpoint --query Parameter.Value --output text
# Current: http://172.31.76.117:8000 (version 14)
```

### Known Issues

**🔴 BLOCKER: CUDA Out of Memory**
- Error: "CUDA out of memory. Tried to allocate 2.00 MiB. GPU 0 has a total capacity of 21.98 GiB of which 2.44 MiB is free"
- Process 18334 has 21.96 GiB memory in use
- 21.59 GiB allocated by PyTorch, 71.83 MiB reserved but unallocated
- **GPU connection works** - Lambda can reach GPU, but generation fails
- Suggested fix: Set `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`
- Root cause: Memory fragmentation or insufficient memory for generation step
- Current resolution: 360×640 may be too large for available memory

**Resolution: 360×640 (9:16)**
- Hardcoded in Lambda due to GPU memory constraints
- Located in: `infra/lambda/process-job/index.ts`
- **May need to be reduced further** to avoid CUDA OOM errors

### Performance Metrics
```
Test video (2025-12-28):
  - Resolution: 544×320
  - Duration: 2 seconds
  - Steps: 15
  - Generation time: 60 seconds ✅
```

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AI VIDEO GENERATION SYSTEM                      │
│                      (AWS Infrastructure - us-east-1)                    │
└─────────────────────────────────────────────────────────────────────────┘

                              PUBLIC INTERNET
                                    │
                                    │ HTTPS
                                    ▼
                    ┌───────────────────────────────┐
                    │      API Gateway (REST)       │
                    │  0woorvfufb.execute-api...    │
                    │   POST /generate              │
                    │   GET  /status/{jobId}        │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌─────────────────────┐       ┌─────────────────────┐
        │  SubmitJob Lambda   │       │  GetStatus Lambda   │
        │  (No VPC)            │       │  (No VPC)           │
        │  - Validates input  │       │  - Queries DynamoDB │
        │  - Writes to DB+SQS │       │  - Returns status   │
        └──────┬──────────────┘       └─────────────────────┘
               │                                    │
               │ Write                              │ Read
               ▼                                    ▼
    ┌─────────────────────┐              ┌─────────────────────┐
    │    DynamoDB Table   │              │    DynamoDB Table   │
    │    "video-jobs"     │◄─────────────│    "video-jobs"     │
    │  {jobId, status...} │   Update     │                     │
    └─────────────────────┘              └─────────────────────┘
               │
               │ Enqueue
               ▼
    ┌─────────────────────┐
    │     SQS Queue       │
    │ "video-generation-  │
    │       queue"        │
    └──────┬──────────────┘
           │ Poll (Event Source)
           │
           ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                  VPC (vpc-03cd6462b46350c8e)                 │
    │                    CIDR: 172.31.0.0/16                       │
    │                                                               │
    │  ┌────────────────────────────────────────────────────────┐ │
    │  │         ProcessJob Lambda (VPC-enabled)                │ │
    │  │         Security Group: sg-023b8937f41c20533           │ │
    │  │  ┌──────────────────────────────────────────────┐     │ │
    │  │  │ 1. Read jobId from SQS                       │     │ │
    │  │  │ 2. Get GPU endpoint from SSM ✅               │     │ │
    │  │  │ 3. POST to GPU FastAPI ✅ → ❌ CUDA OOM       │     │ │
    │  │  │ 4. Update DynamoDB with error                │     │ │
    │  │  └──────────────────────────────────────────────┘     │ │
    │  └────────────────┬───────────────────────────────────────┘ │
    │                   │                                          │
    │                   │ ✅ Connection successful                 │
    │                   │ ❌ CUDA out of memory during generation  │
    │                   │                                          │
    │                   ▼ Should connect to:                       │
    │  ┌─────────────────────────────────────────────────────┐   │
    │  │     GPU Instance (g5.12xlarge)                      │   │
    │  │     Instance: i-026929c584bc61c87                   │   │
    │  │     Private IP: 172.31.76.117:8000                  │   │
    │  │     Security Group: sg-0c77e10a20dbb5dac            │   │
    │  │  ┌──────────────────────────────────────────────┐  │   │
    │  │  │  Docker Container: video-inference           │  │   │
    │  │  │  ┌────────────────────────────────────────┐  │  │   │
    │  │  │  │  FastAPI Server (Port 8000)            │  │  │   │
    │  │  │  │  Endpoints:                             │  │  │   │
    │  │  │  │    GET  /health                         │  │  │   │
    │  │  │  │    POST /generate                       │  │  │   │
    │  │  │  └────────────┬───────────────────────────┘  │  │   │
    │  │  │               │                               │  │   │
    │  │  │  ┌────────────▼───────────────────────────┐  │  │   │
    │  │  │  │  HunyuanVideo Inference Engine         │  │  │   │
    │  │  │  │  - Model: HunyuanVideo-1.5 GGUF Q8     │  │  │   │
    │  │  │  │  - Memory: Model CPU offload           │  │  │   │
    │  │  │  │  - Resolution: 360×640 (9:16)          │  │  │   │
    │  │  │  │  - ~60s generation time                │  │  │   │
    │  │  │  └────────────┬───────────────────────────┘  │  │   │
    │  │  │               │                               │  │   │
    │  │  │  ┌────────────▼───────────────────────────┐  │  │   │
    │  │  │  │  4× NVIDIA A10G GPUs                   │  │  │   │
    │  │  │  │  - 22.5GB VRAM each (92GB total)       │  │  │   │
    │  │  │  │  - Currently uses GPU 0 only           │  │  │   │
    │  │  │  └────────────────────────────────────────┘  │  │   │
    │  │  └───────────────────────────────────────────────┘  │   │
    │  └─────────────────────────────────────────────────────┘   │
    │                           │                                 │
    │                           │ Upload MP4                      │
    │                           ▼                                 │
    └───────────────────────────────────────────────────────────┘
                                │
                                │
                                ▼
                 ┌──────────────────────────────┐
                 │        S3 Bucket             │
                 │  aivideo-dev-storage-...     │
                 │  /generated-videos/          │
                 │    └─ {job_id}.mp4           │
                 └──────────────────────────────┘
                                │
                                │ Presigned URL
                                ▼
                 ┌──────────────────────────────┐
                 │      Frontend UI             │
                 │  (React Application)         │
                 │  - Polls for job status      │
                 │  - Downloads video URL       │
                 └──────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════

LEGEND:
  ✅ = Working correctly
  ❌ = Currently broken
  ──► = Data flow (working)
  ──▶ = Data flow (broken)

KEY ISSUE:
  GPU runs out of CUDA memory during video generation. The GPU has 21.98 GiB
  total capacity but 21.96 GiB is already in use by PyTorch (likely model
  weights), leaving only ~2.44 MiB free. This is insufficient for generation.

  Error: "CUDA out of memory. Tried to allocate 2.00 MiB"

  This is blocking end-to-end video generation from the UI.

POTENTIAL FIXES:
  1. Set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True (reduce fragmentation)
  2. Reduce video resolution below 360×640
  3. Reduce video duration or steps
  4. Enable gradient checkpointing or other memory optimization
  5. Use a smaller/more efficient model quantization

═══════════════════════════════════════════════════════════════════════════

DEBUGGING ACCESS:

  AWS CLI Setup:
    cd /Users/tyler/Desktop/Gauntlet/AI-video
    set -a; source infra/.env; set +a
    aws sts get-caller-identity

  Connect to GPU:
    aws ssm start-session --target i-026929c584bc61c87

  Management:
    ./infra/scripts/gpu-status.sh    # Check instance status
    ./infra/scripts/start-gpu.sh     # Start GPU (costs $5.67/hr)
    ./infra/scripts/stop-gpu.sh      # Stop GPU (IMPORTANT!)

  Logs:
    Lambda:     CloudWatch → /aws/lambda/ProcessJobFunction
    Container:  docker logs -f video-inference (via SSM)
    GPU:        nvidia-smi (via SSM)

═══════════════════════════════════════════════════════════════════════════
```

---

## Related Documentation

- [GPU Status](../infra/GPU-STATUS.md) - Current GPU instance status
- [API Gateway Networking Issue](API-GATEWAY-NETWORKING-ISSUE.md) - Detailed Lambda VPC problem
- [GPU Upgrade Plan](GPU-UPGRADE-G5-12XLARGE.md) - g5.2xlarge → g5.12xlarge upgrade
- [UI Blocker](UI-BLOCKER-LAMBDA-VPC.md) - Lambda VPC configuration blocker
- [Video Resolution](VIDEO-RESOLUTION-9-16.md) - 9:16 aspect ratio configuration
- [IAC Updates Required](../infra/IAC-UPDATES-REQUIRED.md) - Manual fixes to codify

---

## Quick Reference Commands

### Start Working Session
```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video
set -a; source infra/.env; set +a
./infra/scripts/start-gpu.sh
```

### Connect and Test
```bash
aws ssm start-session --target i-026929c584bc61c87
# Inside SSM:
curl http://localhost:8000/health
```

### End Working Session
```bash
./infra/scripts/stop-gpu.sh
```

---

**Last Updated**: 2025-12-28
