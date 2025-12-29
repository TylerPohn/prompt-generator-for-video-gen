# GPU Inference Status

**Last Updated:** 2024-12-24

## Current Infrastructure Status

### Deployed AWS Resources

| Resource | Status | Details |
|----------|--------|---------|
| API Gateway | ✅ Live | `https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/` |
| Lambda (SubmitJob) | ✅ Deployed | Accepts POST /generate requests |
| Lambda (GetStatus) | ✅ Deployed | Accepts GET /status/{jobId} |
| Lambda (ProcessJob) | ✅ Deployed | VPC-connected, reads GPU endpoint from SSM |
| SQS Queue | ✅ Active | `video-generation-queue` |
| DynamoDB | ✅ Active | `video-jobs` table |
| S3 Bucket | ✅ Active | `aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale` |
| GPU ASG | ✅ Deployed | g5.xlarge, currently scaled to 0 |
| SSM Parameter | ✅ Configured | `/video-generation/gpu-endpoint` |

### GPU Instance

| Property | Value |
|----------|-------|
| Instance Type | g5.xlarge (NVIDIA A10G, 24GB VRAM) |
| AMI | ECS-optimized GPU AMI |
| ASG Name | `AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2` |
| Current State | **STOPPED** (scaled to 0) |

## Architecture Flow

```
Frontend → API Gateway → SubmitJob Lambda → DynamoDB + SQS
                                                    ↓
                                            ProcessJob Lambda (VPC)
                                                    ↓
                                            GPU FastAPI Server
                                                    ↓
                                            S3 (video storage)
```

## Scripts

Located in `infra/scripts/`:

| Script | Description |
|--------|-------------|
| `start-gpu.sh` | Scale ASG to 1, wait for instance, update SSM parameter |
| `stop-gpu.sh` | Scale ASG to 0, terminate instance |
| `gpu-status.sh` | Check current GPU instance status |

## Known Issues / TODOs

### High Priority

- [ ] **Native GPU Inference Not Working**
  - The `diffusers`-based inference container has dependency conflicts
  - `diffusers>=0.30` requires `torch>=2.3` for `torch.xpu` support
  - Current workaround: API server uses Replicate as backend
  - **Fix:** Update `infra/container/requirements.txt` with compatible versions:
    ```
    torch==2.4.0+cu121
    diffusers==0.30.0
    transformers==4.44.0
    accelerate==0.33.0
    ```

- [ ] **Container Auto-Start on GPU Boot**
  - GPU instance user data only verifies GPU, doesn't start inference container
  - Need to add container pull/run to user data or use ECS

### Medium Priority

- [ ] **Model Pre-Download**
  - `Lightricks/LTX-Video` model is ~10GB, downloads on first request
  - Consider baking model into AMI or using EFS

- [ ] **Health Check Integration**
  - Lambda should verify GPU health before sending jobs
  - Add retry logic if GPU endpoint is unreachable

- [ ] **Cost Optimization**
  - Implement scale-to-zero based on queue depth
  - Add CloudWatch alarms for idle GPU detection

### Low Priority

- [ ] **ECR Integration**
  - Push inference container to ECR for easier deployment
  - ECR repo exists: `971422717446.dkr.ecr.us-east-1.amazonaws.com/video-inference`

- [ ] **Monitoring**
  - Add CloudWatch dashboards for GPU utilization
  - Set up alerts for failed jobs

## Quick Start

### Start GPU and Generate Video

```bash
cd infra

# Start GPU instance
./scripts/start-gpu.sh

# Wait for container to be ready (check logs)
./scripts/gpu-status.sh

# Test API
curl -X POST https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A cat playing with yarn"}'

# Check status
curl https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/status/{jobId}

# Stop GPU when done
./scripts/stop-gpu.sh
```

### Deploy Container Manually (on GPU instance via SSM)

```bash
# After GPU starts, SSH/SSM into instance and run:
cd /home/ec2-user/api-server
docker-compose up -d
```

## Cost Estimate

| Resource | Hourly Cost | Notes |
|----------|-------------|-------|
| g5.xlarge | ~$1.00/hr | Only when running |
| Lambda | ~$0.00 | Pay per invocation |
| API Gateway | ~$0.00 | Pay per request |
| DynamoDB | ~$0.00 | On-demand pricing |
| S3 | ~$0.02/GB | Storage only |

**Recommendation:** Always run `./scripts/stop-gpu.sh` when not actively generating videos.

## Files Modified

- `infra/lib/video-api-stack.ts` - Added VPC config, SSM parameter
- `infra/lambda/process-job/index.ts` - Calls GPU endpoint via SSM
- `infra/container/Dockerfile` - Added pkg-config and ffmpeg deps
- `infra/container/requirements.txt` - Version updates needed
- `infra/scripts/*.sh` - GPU management scripts
