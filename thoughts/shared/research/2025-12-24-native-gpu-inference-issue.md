---
date: 2025-12-24T00:00:00-05:00
researcher: Claude
git_commit: 7b35c08f1502a91b1549d6817fa76d31294d50d1
branch: master
repository: AI-video
topic: "Native GPU Inference Dependency Conflicts - High Priority Issue"
tags: [research, codebase, gpu, inference, diffusers, torch, dependencies, replicate, workaround]
status: complete
last_updated: 2025-12-24
last_updated_by: Claude
---

# Research: Native GPU Inference Not Working - High Priority Issue

**Date**: 2025-12-24
**Researcher**: Claude
**Git Commit**: 7b35c08f1502a91b1549d6817fa76d31294d50d1
**Branch**: master
**Repository**: AI-video

## Research Question

Document the high priority issue described in `infra/GPU-STATUS.md` regarding native GPU inference not working due to dependency conflicts.

## Summary

The codebase has a fully designed native GPU inference system using HuggingFace Diffusers with the `Lightricks/LTX-Video` model running on AWS g5.xlarge instances (NVIDIA A10G, 24GB VRAM). However, this native inference path is currently non-functional due to PyTorch/Diffusers version incompatibilities. The system currently operates using Replicate as an external API backend instead of local GPU inference.

The core conflict: `diffusers>=0.30.0` requires `torch>=2.3` for `torch.xpu` (Intel GPU) support, but the specific version combinations in `requirements.txt` create installation conflicts.

## Detailed Findings

### 1. The Native GPU Inference Container

**Location**: `infra/container/`

The native GPU inference system is a complete, production-ready implementation consisting of:

#### Container Configuration

| File | Purpose |
|------|---------|
| `infra/container/Dockerfile` | CUDA 12.1 runtime container definition |
| `infra/container/requirements.txt` | Python dependencies with version specifications |
| `infra/container/docker-compose.yml` | GPU-enabled container orchestration |
| `infra/container/app/main.py` | FastAPI server with /generate endpoint |
| `infra/container/app/inference.py` | VideoGenerator class using DiffusionPipeline |
| `infra/container/app/utils.py` | S3 upload and file handling utilities |

#### Dockerfile Base Image (`infra/container/Dockerfile:2`)

```dockerfile
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04
```

The container uses CUDA 12.1 runtime, installs Python 3.10, ffmpeg, and video processing libraries.

#### Current Dependency Specifications (`infra/container/requirements.txt:8-18`)

```
# ML/AI
torch>=2.3.0
torchvision>=0.18.0
torchaudio>=2.3.0
--extra-index-url https://download.pytorch.org/whl/cu121

# Diffusion Models
diffusers>=0.30.0
transformers>=4.40.0
accelerate>=0.30.0
safetensors>=0.4.2
huggingface-hub>=0.22.0
```

The issue is the `>=` version specifiers can resolve to incompatible version combinations.

### 2. The Dependency Conflict

**Documented in**: `infra/GPU-STATUS.md:56-67`

The conflict occurs because:

1. `diffusers>=0.30` introduced support for Intel XPU (`torch.xpu`) which requires `torch>=2.3`
2. The flexible version ranges (`>=`) allow pip to resolve combinations that may not work together
3. The GPU-STATUS.md documents a specific fix with pinned versions:

```
torch==2.4.0+cu121
diffusers==0.30.0
transformers==4.44.0
accelerate==0.33.0
```

These pinned versions are documented as the expected resolution but are **not currently applied** to `requirements.txt`.

### 3. Native Inference Implementation Details

#### VideoGenerator Class (`infra/container/app/inference.py:23-294`)

**Model Loading** (`inference.py:46-81`):
```python
self.pipeline = DiffusionPipeline.from_pretrained(
    self.model_id,  # "Lightricks/LTX-Video"
    torch_dtype=self.dtype,
    use_safetensors=True,
)
self.pipeline = self.pipeline.to(self.device)
```

**GPU Optimizations Applied** (`inference.py:62-75`):
- Attention slicing: `pipeline.enable_attention_slicing()`
- VAE tiling: `pipeline.enable_vae_tiling()`

**Video Generation** (`inference.py:130-138`):
```python
output = self.pipeline(
    prompt=prompt,
    num_inference_steps=num_inference_steps,
    num_frames=num_frames,
    guidance_scale=guidance_scale,
    width=width,
    height=height,
    generator=generator,
)
```

**Video Encoding** (`inference.py:250-257`):
- Uses imageio with libx264 codec
- Quality setting: 8
- Pixel format: yuv420p

#### FastAPI Server (`infra/container/app/main.py:144-243`)

**POST /generate endpoint**:
- Accepts: prompt, job_id, bucket_name, seed, steps, duration, fps, guidance_scale, width, height
- Runs inference via `asyncio.to_thread()` for non-blocking operation
- Uploads result to S3 at `generated-videos/{job_id}.mp4`
- Returns: status, video_key, generation_time_seconds

### 4. Current Workaround: Replicate API

Because native GPU inference is non-functional, the system uses Replicate as an external API backend.

#### Backend Server (`frontend/backend-server.js`)

**Video Generation via Replicate** (`backend-server.js:38-59`):
```javascript
const cmd = `curl -s -X POST "https://api.replicate.com/v1/models/${model}/predictions" \
  -H "Authorization: Bearer ${REPLICATE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"input": {"prompt": "${escapedPrompt}", "duration": ${duration}}}'`;
```

Uses child_process.exec to run curl commands to Replicate API.

**Models Used**:
- Video generation: `google/veo-3.1`, `bytedance/seedance-1-pro-fast`, `bytedance/seedance-1-lite`, `openai/sora-2`
- LLM prompts: `meta/meta-llama-3.1-405b-instruct`

#### Polling Service (`frontend/src/services/polling.ts:18-56`)

Polls Replicate API for job completion with exponential backoff (1s to 5s intervals, 10 minute max).

#### Environment Configuration (`frontend/.env.local`)

```
VITE_REPLICATE_API_KEY=r8_VPiE9YSpQn...
VITE_AWS_VIDEO_API_ENDPOINT=https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod
```

### 5. GPU Instance Infrastructure

**Location**: `infra/lib/gpu-inference-stack.ts`

#### Instance Configuration (`gpu-inference-stack.ts:116-123`)

| Property | Value |
|----------|-------|
| Instance Type | g5.xlarge (NVIDIA A10G, 24GB VRAM) |
| AMI | ECS-optimized Amazon Linux 2 GPU |
| Min Capacity | 0 |
| Max Capacity | 1 |
| Desired Capacity | 0 (cost-optimized, scaled manually) |

#### Security Group (`gpu-inference-stack.ts:33-37`)

Allows TCP port 8000 from VPC CIDR block for Lambda-to-GPU communication.

#### User Data (`gpu-inference-stack.ts:75-89`)

Current user data only:
1. Starts Docker service
2. Runs `nvidia-smi` to verify GPU
3. Prints "GPU inference instance ready"

**Does NOT automatically start the inference container**.

### 6. Container Auto-Start Issue

**Documented in**: `infra/GPU-STATUS.md:68-70`

The GPU instance user data script verifies the GPU is accessible but does not:
- Pull the inference container image
- Start the inference container
- Configure the container to run on boot

Currently, the container must be deployed manually via SSM after the instance starts:
- Script: `infra/scripts/setup-gpu-container.sh`
- Deploys a lightweight FastAPI container that proxies to Replicate (not native inference)

### 7. AWS Infrastructure Connection

#### Process-Job Lambda (`infra/lambda/process-job/index.ts`)

**GPU Endpoint Discovery** (`process-job/index.ts:18-36`):
```typescript
async function getGpuEndpoint(): Promise<string> {
  // Reads from SSM parameter: /video-generation/gpu-endpoint
  const response = await ssmClient.send(new GetParameterCommand({
    Name: process.env.GPU_ENDPOINT_PARAM,
  }));
  return response.Parameter.Value;  // e.g., "http://10.x.x.x:8000"
}
```

**GPU API Call** (`process-job/index.ts:119-125`):
```typescript
const response = await fetch(`${gpuEndpoint}/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody),
});
```

Lambda runs in VPC (`video-api-stack.ts:131`) for private network access to GPU instance.

### 8. GPU Management Scripts

| Script | Purpose |
|--------|---------|
| `infra/scripts/start-gpu.sh` | Scale ASG to 1, wait for instance, update SSM parameter with private IP |
| `infra/scripts/stop-gpu.sh` | Scale ASG to 0, terminate instance |
| `infra/scripts/gpu-status.sh` | Check ASG and instance status |
| `infra/scripts/setup-gpu-container.sh` | Deploy container via SSM (uses Replicate, not native inference) |

**SSM Parameter Update** (`start-gpu.sh:40-44`):
```bash
aws ssm put-parameter \
  --name "/video-generation/gpu-endpoint" \
  --value "$GPU_ENDPOINT" \
  --type String \
  --overwrite
```

## Code References

### Core Dependency Issue
- `infra/container/requirements.txt:8-18` - Current flexible version specifications
- `infra/GPU-STATUS.md:56-67` - Documented issue and expected fix versions

### Native Inference Implementation
- `infra/container/app/inference.py:46-81` - DiffusionPipeline model loading
- `infra/container/app/inference.py:130-138` - Video generation with diffusers
- `infra/container/app/main.py:144-243` - FastAPI /generate endpoint
- `infra/container/Dockerfile:2` - CUDA 12.1 base image

### Replicate Workaround
- `frontend/backend-server.js:38-59` - Replicate API video generation
- `frontend/backend-server.js:168-261` - LLM prompt generation via Replicate
- `frontend/src/services/replicateClient.ts:5-56` - Frontend Replicate client
- `frontend/src/hooks/useVideoGeneration.ts:59-87` - generateWithReplicate function

### Infrastructure
- `infra/lib/gpu-inference-stack.ts:116-123` - Auto Scaling Group configuration
- `infra/lib/gpu-inference-stack.ts:75-89` - Instance user data (no container start)
- `infra/lib/video-api-stack.ts:125-142` - Process-Job Lambda VPC configuration
- `infra/lambda/process-job/index.ts:98-141` - GPU endpoint caller

### GPU Management
- `infra/scripts/start-gpu.sh` - Scales up ASG and updates SSM
- `infra/scripts/stop-gpu.sh` - Scales down ASG
- `infra/scripts/setup-gpu-container.sh` - Deploys Replicate proxy container

## Architecture Documentation

### Current System Architecture (with Replicate)

```
Frontend → API Gateway → SubmitJob Lambda → DynamoDB + SQS
                                                  ↓
                                          ProcessJob Lambda (VPC)
                                                  ↓
                                          GPU FastAPI Server
                                                  ↓
                                          Replicate API (external)
                                                  ↓
                                          S3 (video storage)
```

### Intended System Architecture (with Native Inference)

```
Frontend → API Gateway → SubmitJob Lambda → DynamoDB + SQS
                                                  ↓
                                          ProcessJob Lambda (VPC)
                                                  ↓
                                          GPU FastAPI Server
                                                  ↓
                                          Local DiffusionPipeline
                                          (Lightricks/LTX-Video)
                                                  ↓
                                          S3 (video storage)
```

### Model Information

| Property | Value |
|----------|-------|
| Model | Lightricks/LTX-Video |
| Size | ~10GB (downloads on first request) |
| Generation Parameters | steps (1-100), duration (1-10s), fps (4-30), guidance_scale (1-20) |
| Output | MP4 video with libx264 codec |

## Related Research

No existing research documents found in `thoughts/shared/research/`.

## Open Questions

1. The pinned versions documented in GPU-STATUS.md (`torch==2.4.0+cu121`, `diffusers==0.30.0`, `transformers==4.44.0`, `accelerate==0.33.0`) - have these been tested together in the CUDA 12.1 runtime environment?

2. The ~10GB `Lightricks/LTX-Video` model downloads on first request - is there existing infrastructure for model pre-caching (EFS, baked AMI)?

3. The `setup-gpu-container.sh` script deploys a lightweight Replicate proxy container, not the full native inference container - is this intentional as a temporary measure?

4. The GPU instance uses the ECS-optimized AMI but does not appear to use ECS for container orchestration - is there a plan to migrate to ECS for container management?
