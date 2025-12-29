# AWS GPU Inference - Quick Start Guide

**Last Updated**: 2025-12-29
**Model**: HunyuanVideo-1.5 (Q4 quantization, ~7GB)
**GPU Instance**: g5.48xlarge (4× NVIDIA A10G, 24GB VRAM each)
**Status**: ✅ Production Ready
**Recent Fixes**:
- ✅ CUDA memory issue resolved (CPU offload enabled)
- ✅ Lambda timeout resolved (async generation + polling)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Quick Start](#quick-start)
3. [GPU Instance Access](#gpu-instance-access)
4. [Docker Commands](#docker-commands)
5. [Deployment & Rebuild](#deployment--rebuild)
6. [Testing](#testing)
7. [Common Operations](#common-operations)
8. [Cost Management](#cost-management)
9. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
User Request
    ↓
API Gateway (REST API)
    ↓
Lambda (submit-job) → SQS Queue
    ↓
Lambda (process-job) → GPU Instance (FastAPI)
    ↓
GPU generates video → Upload to S3
    ↓
Return presigned URL
```

### Components

**Compute**:
- **GPU Instance**: g5.48xlarge (4× NVIDIA A10G, 96GB total VRAM)
- **Container**: Docker with CUDA 12.1, PyTorch 2.4.0, Diffusers 0.36.0
- **Model**: HunyuanVideo-1.5 with GGUF Q8 quantization (13.97GB)

**API Layer**:
- **API Gateway**: REST API with API key authentication
- **Lambdas**:
  - `submit-job`: Accepts requests, queues job
  - `process-job`: Polls queue, calls GPU, updates status
  - `get-status`: Returns job status

**Storage**:
- **S3**: Generated videos stored with presigned URLs
- **DynamoDB**: Job status tracking
- **EFS**: Model cache (shared across GPU instances)

**Networking**:
- GPU instance in private subnet (default VPC)
- API Gateway publicly accessible
- SSM Session Manager for secure access (no SSH needed)

---

## Quick Start

### Prerequisites

```bash
# Ensure you're in the infra directory
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# AWS credentials configured
aws sts get-caller-identity

# Node.js and npm installed
node --version  # v18+
npm --version
```

### 1. Deploy Infrastructure

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy all stacks (first time)
npx cdk deploy --all --require-approval never

# Or deploy individually
npx cdk deploy AiVideo-dev-Storage        # S3 buckets
npx cdk deploy AiVideo-dev-GpuInference   # GPU instance
npx cdk deploy AiVideo-dev-VideoApi       # API Gateway + Lambdas
```

**Deployment time**: ~5-10 minutes

### 2. Start GPU Instance

```bash
# Start the GPU instance (scales from 0 to 1)
./scripts/start-gpu.sh

# Wait for instance to be ready (~5 minutes for model loading)
./scripts/gpu-status.sh
```

**Look for**:
```
Instance ID:    i-0xxxxxxxxx
State:          running
Type:           g5.48xlarge
FastAPI URL:    http://172.31.x.x:8000

Container Status: running
Model Status: ✅ Loaded (13.97GB GGUF Q8)
```

### 3. Test Video Generation

```bash
# Run end-to-end test
./scripts/test-native-inference.sh
```

**Expected output**:
```
=== Testing Native GPU Inference ===
Job ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Status: completed
Video URL: https://...s3.amazonaws.com/...mp4
```

### 4. Stop GPU Instance (Save Cost!)

```bash
# Stop GPU when done
./scripts/stop-gpu.sh
```

**Important**: GPU costs $16.29/hr on-demand or $5.50/hr spot. Always stop when not in use!

---

## GPU Instance Access

### Via SSM Session Manager (Recommended)

```bash
# Get instance ID
INSTANCE_ID=$(./scripts/gpu-status.sh | grep "Instance ID" | awk '{print $3}')

# Start interactive session
aws ssm start-session --target $INSTANCE_ID --region us-east-1

# Inside session, check status
sudo docker ps
sudo docker logs -f video-inference
nvidia-smi
```

### Check Container Status

```bash
# From local machine, get container logs
aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo docker logs --tail 50 video-inference"]' \
  --region us-east-1 \
  --query 'Command.CommandId' \
  --output text

# Wait 3 seconds, then get output
aws ssm get-command-invocation \
  --command-id <COMMAND_ID> \
  --instance-id $INSTANCE_ID \
  --region us-east-1 \
  --query 'StandardOutputContent' \
  --output text
```

### Check GPU Memory

```bash
# Via SSM
aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["nvidia-smi"]' \
  --region us-east-1

# Or in interactive session
sudo watch -n 1 nvidia-smi
```

---

## Docker Commands

### Build Container Locally

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra/container

# Build for local testing (if you have Docker Desktop)
docker build -t video-inference:latest .

# Build for AWS (linux/amd64)
docker build --platform linux/amd64 -t video-inference:latest .

# Test locally (requires NVIDIA GPU)
docker run --gpus all -p 8000:8000 \
  -v $(pwd)/models:/app/models \
  -v $(pwd)/hf_cache:/app/hf_cache \
  video-inference:latest
```

### Push to ECR

```bash
# Get ECR repository URI
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name AiVideo-dev-GpuInference \
  --query 'Stacks[0].Outputs[?OutputKey==`EcrRepoUri`].OutputValue' \
  --output text)

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URI

# Tag and push
docker tag video-inference:latest $ECR_URI:latest
docker push $ECR_URI:latest
```

### Build on GPU Instance (Recommended)

If local Docker build fails due to disk space or platform issues:

```bash
# Use the rebuild script (builds directly on GPU)
./scripts/rebuild-container-on-gpu.sh
```

This script:
1. Connects to GPU instance via SSM
2. Clones repository
3. Builds container natively on GPU
4. Restarts container with new image

---

## Deployment & Rebuild

This section covers all methods to deploy code updates to the GPU instance, including automated scripts and manual methods.

### Method 1: Automated Git-Based Rebuild (Recommended)

**Best for**: Regular updates when you've pushed code to GitHub

```bash
# From your local machine
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Run the automated rebuild script
./scripts/rebuild-container-on-gpu.sh

# Optional: Specify instance ID if different
./scripts/rebuild-container-on-gpu.sh i-0xxxxxxxxxx
```

**What this does**:
1. Connects to GPU instance via SSM
2. Installs git (if not present)
3. Clones/pulls latest code from GitHub (`master` branch)
4. Stops current container
5. Builds new container image from `infra/container/`
6. Starts container with new image
7. Shows container logs

**Prerequisites**:
- Code must be pushed to GitHub repository
- GPU instance must have internet access
- SSM Session Manager working

**Time**: ~5-10 minutes (includes Docker build)

### Method 2: Manual S3-Based Deployment

**Best for**: Testing local changes before committing to Git, or when git clone fails

**Step 1: Package local code**
```bash
# From your local machine
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Create tarball of container directory
tar -czf container-build.tar.gz container/

# Upload to S3 (use your actual bucket name)
BUCKET_NAME="aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale"
aws s3 cp container-build.tar.gz s3://$BUCKET_NAME/tmp/container-build.tar.gz

echo "✅ Code uploaded to S3"
```

**Step 2: Deploy on GPU instance**
```bash
# Get your instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=*GpuInstance*" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

# Create deployment script
cat > /tmp/deploy-from-s3.sh << 'EOF'
#!/bin/bash
set -e

BUCKET_NAME="aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale"

echo "=== Downloading code from S3 ==="
aws s3 cp s3://$BUCKET_NAME/tmp/container-build.tar.gz /tmp/container-build.tar.gz

echo "=== Extracting files ==="
mkdir -p /tmp/container-build
cd /tmp/container-build
tar -xzf /tmp/container-build.tar.gz

echo "=== Stopping old container ==="
sudo docker stop video-inference 2>/dev/null || true
sudo docker rm video-inference 2>/dev/null || true

echo "=== Building new image ==="
cd /tmp/container-build/container
sudo docker build -t video-inference:latest .

echo "=== Starting new container ==="
sudo docker run -d \
  --name video-inference \
  --gpus all \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /opt/ml/models:/app/models \
  -v /opt/ml/hf_cache:/app/hf_cache \
  -e AWS_DEFAULT_REGION=us-east-1 \
  video-inference:latest

echo "=== Cleanup ==="
rm -rf /tmp/container-build /tmp/container-build.tar.gz

echo "=== Waiting for startup ==="
sleep 10

echo "=== Container logs ==="
sudo docker logs video-inference --tail 50

echo ""
echo "✅ Deployment complete!"
EOF

# Send command to GPU instance
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters file:///tmp/deploy-from-s3.sh \
  --output text \
  --query 'Command.CommandId')

echo "Command ID: $COMMAND_ID"
echo "Waiting for deployment (5-10 minutes)..."

# Monitor progress
aws ssm wait command-executed \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID"

# Show results
aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query 'StandardOutputContent' \
  --output text

echo "✅ Deployment complete!"
```

**Step 3: Verify deployment**
```bash
# Test health endpoint
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["curl -s http://localhost:8000/health | jq ."]' \
  --output text

# Or run full test
./scripts/test-native-inference.sh
```

### Method 3: Direct File Copy (Quick Edits)

**Best for**: Single file hotfixes without full rebuild

```bash
# Upload specific file to S3
aws s3 cp infra/container/app/main.py s3://$BUCKET_NAME/tmp/main.py

# Copy into running container
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "aws s3 cp s3://'"$BUCKET_NAME"'/tmp/main.py /tmp/main.py",
    "sudo docker cp /tmp/main.py video-inference:/app/app/main.py",
    "sudo docker restart video-inference"
  ]' \
  --output text
```

**Warning**: Changes are lost on container restart. Use for emergency hotfixes only.

### Method 4: ECR-Based Deployment (Production)

**Best for**: Production deployments with versioned images

```bash
# 1. Build locally with correct platform
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra/container
docker build --platform linux/amd64 -t video-inference:latest .

# 2. Get ECR repository URI
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name AiVideo-dev-GpuInference \
  --query 'Stacks[0].Outputs[?OutputKey==`EcrRepoUri`].OutputValue' \
  --output text)

# 3. Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URI

# 4. Tag and push
docker tag video-inference:latest $ECR_URI:latest
docker tag video-inference:latest $ECR_URI:v1.0.0  # Version tag
docker push $ECR_URI:latest
docker push $ECR_URI:v1.0.0

# 5. Pull and restart on GPU
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "sudo docker pull '"$ECR_URI"':latest",
    "sudo docker stop video-inference",
    "sudo docker rm video-inference",
    "sudo docker run -d --name video-inference --gpus all -p 8000:8000 \
      -v /opt/ml/models:/app/models \
      -v /opt/ml/hf_cache:/app/hf_cache \
      -e AWS_DEFAULT_REGION=us-east-1 \
      '"$ECR_URI"':latest"
  ]' \
  --output text
```

### Getting Source Files to GPU: Summary

| Method | Use Case | Time | Requires Commit |
|--------|----------|------|-----------------|
| **Git-based rebuild** | Regular updates | 5-10 min | Yes |
| **S3 tarball** | Local testing | 5-10 min | No |
| **Direct file copy** | Emergency hotfix | 1-2 min | No |
| **ECR deployment** | Production releases | 10-15 min | No |

### Deployment Checklist

Before deploying:
- [ ] Test changes locally if possible
- [ ] Review logs for any errors: `sudo docker logs video-inference`
- [ ] Check GPU memory: `nvidia-smi`
- [ ] Verify health endpoint: `curl localhost:8000/health`
- [ ] Run test generation: `./scripts/test-native-inference.sh`
- [ ] Update documentation if API changed

After deploying:
- [ ] Monitor container logs for 2-3 minutes
- [ ] Test health endpoint
- [ ] Run full end-to-end test
- [ ] Check GPU memory usage
- [ ] Verify Lambda can reach GPU endpoint

### Rollback Procedure

If deployment fails:

```bash
# Method 1: Restart with last known good image
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "sudo docker stop video-inference",
    "sudo docker run -d --name video-inference --gpus all -p 8000:8000 \
      -v /opt/ml/models:/app/models \
      -v /opt/ml/hf_cache:/app/hf_cache \
      video-inference:previous"
  ]'

# Method 2: Pull from ECR with version tag
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "sudo docker pull '"$ECR_URI"':v1.0.0",
    "sudo docker tag '"$ECR_URI"':v1.0.0 video-inference:latest",
    "sudo docker restart video-inference"
  ]'

# Method 3: Rebuild from last commit
cd /Users/tyler/Desktop/Gauntlet/AI-video
git log --oneline -5  # Find last good commit
git checkout <commit-hash>
./scripts/rebuild-container-on-gpu.sh
git checkout master  # Return to current
```

---

## Testing

### 1. Health Check

```bash
# Get GPU private IP
GPU_IP=$(./scripts/gpu-status.sh | grep "Private IP" | awk '{print $3}')

# Health check (from within VPC or via SSM)
curl http://$GPU_IP:8000/health
```

**Expected**: `{"status":"healthy","model_loaded":true}`

### 2. Direct GPU Test

```bash
# Via SSM session on GPU instance
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with yarn",
    "job_id": "test-123",
    "bucket_name": "your-bucket-name",
    "steps": 30,
    "duration": 3,
    "width": 288,
    "height": 512
  }'
```

### 3. Full API Test

```bash
# Get API endpoint
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name AiVideo-dev-VideoApi \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

# Get API key
API_KEY=$(aws apigateway get-api-key \
  --api-key $(aws cloudformation describe-stacks \
    --stack-name AiVideo-dev-VideoApi \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiKeyId`].OutputValue' \
    --output text) \
  --include-value \
  --query 'value' \
  --output text)

# Submit job
JOB_ID=$(curl -s -X POST "${API_ENDPOINT}jobs" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "prompt": "A golden retriever playing fetch in a sunny park",
    "model": "hunyuan-video",
    "steps": 30,
    "duration": 3
  }' | jq -r '.jobId')

echo "Job ID: $JOB_ID"

# Poll status
while true; do
  STATUS=$(curl -s "${API_ENDPOINT}jobs/$JOB_ID" \
    -H "x-api-key: $API_KEY" | jq -r '.status')
  echo "Status: $STATUS"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi

  sleep 10
done

# Get video URL
curl -s "${API_ENDPOINT}jobs/$JOB_ID" -H "x-api-key: $API_KEY" | jq '.'
```

---

## Common Operations

### Update Container Code

See the [Deployment & Rebuild](#deployment--rebuild) section for complete instructions.

**Quick reference**:
```bash
# Automated method (code in GitHub)
./scripts/rebuild-container-on-gpu.sh

# Manual method (local changes)
# See "Method 2: Manual S3-Based Deployment" in Deployment section
```

### Update Lambda Code

```bash
cd infra/lambda

# Build TypeScript
npm run build

# Deploy just the Lambda stack
cd ..
npx cdk deploy AiVideo-dev-VideoApi --require-approval never
```

### Update Infrastructure

```bash
cd infra

# Edit lib/*.ts files

# Build and deploy
npm run build
npx cdk deploy AiVideo-dev-GpuInference --require-approval never
```

### Check Logs

```bash
# Container logs
aws ssm send-command --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["sudo docker logs --tail 100 video-inference"]'

# Lambda logs (submit job)
aws logs tail /aws/lambda/AiVideo-dev-VideoApi-SubmitJobFunction* \
  --since 1h --follow

# Lambda logs (process job)
aws logs tail /aws/lambda/AiVideo-dev-VideoApi-ProcessJobFunction* \
  --since 1h --follow

# Lambda logs (get status)
aws logs tail /aws/lambda/AiVideo-dev-VideoApi-GetStatusFunction* \
  --since 1h --follow
```

### Monitor GPU Usage

```bash
# Real-time GPU monitoring
aws ssm start-session --target $INSTANCE_ID --region us-east-1

# Inside session
watch -n 1 nvidia-smi
```

---

## Cost Management

### Current Costs

**g5.48xlarge**:
- **On-Demand**: $16.29/hour
- **Spot**: ~$5.50/hour (66% savings)
- **Monthly** (8 hrs/day): $528/month on-demand, $178/month spot

**Other Resources** (minimal):
- S3: ~$0.023/GB/month storage, $0.09/GB transfer
- Lambda: First 1M requests free, then $0.20/1M
- API Gateway: $3.50/million requests
- DynamoDB: On-demand pricing, ~$1.25/million writes
- EFS: $0.30/GB/month (model cache)

### Cost Optimization

```bash
# 1. ALWAYS stop GPU when not in use
./scripts/stop-gpu.sh

# 2. Check current status
./scripts/gpu-status.sh

# 3. Enable spot instances (edit gpu-inference-stack.ts)
# Add to AutoScalingGroup:
spotPrice: "5.50"

# 4. Set up billing alerts
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget '{
    "BudgetName": "GPU-Monthly-Budget",
    "BudgetLimit": {"Amount": "200", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }'
```

### Auto-Shutdown

The GPU Auto Scaling Group is configured to scale to 0 by default:
- **Desired Capacity**: 0
- **Min Capacity**: 0
- **Max Capacity**: 1

Use `start-gpu.sh` and `stop-gpu.sh` to control:

```bash
# Start when needed
./scripts/start-gpu.sh

# Check if running
./scripts/gpu-status.sh

# Stop when done (IMPORTANT!)
./scripts/stop-gpu.sh
```

---

## Troubleshooting

### GPU Won't Start

```bash
# Check ASG status
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names $(aws cloudformation describe-stacks \
    --stack-name AiVideo-dev-GpuInference \
    --query 'Stacks[0].Outputs[?OutputKey==`AsgName`].OutputValue' \
    --output text)

# Check recent EC2 launch failures
aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=*GpuAsg*" \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name,StateTransitionReason]'
```

### Container Won't Start

```bash
# Connect to instance
aws ssm start-session --target $INSTANCE_ID

# Check Docker status
sudo systemctl status docker

# Check container logs
sudo docker logs video-inference

# Check if model is downloading
sudo docker exec video-inference ls -lh /app/models/

# Check disk space
df -h
```

### CUDA Out of Memory

**Status**: ✅ RESOLVED

**Solution**:
- Upgraded to g5.48xlarge (96GB total VRAM)
- Using Q4 quantization (~7GB) instead of Q8 (~14GB)
- Enabled CPU offload to keep components on CPU when not in use

If you still see OOM:

```bash
# Check GPU memory
nvidia-smi

# Check if model loaded successfully
sudo docker logs video-inference | grep "Pipeline loaded successfully"

# Verify Q4 model is being used
sudo docker logs video-inference | grep "GGUF model file size"
# Should show: ~7GB for Q4_0

# Check if CPU offload is enabled
sudo docker logs video-inference | grep "model CPU offload"
# Should see: "Enabling model CPU offload for memory management..."

# If OOM persists, try restarting container
sudo docker restart video-inference
```

### Lambda Timeout Issue

**Status**: ✅ RESOLVED (2025-12-28)

**Previous Issue**: Lambda timed out after 5 minutes waiting for synchronous HTTP response from GPU. Video generated successfully but DynamoDB showed "failed" status.

**Solution Implemented**:
- GPU `/generate` endpoint now returns immediately with "accepted" status
- Video generation runs in background task
- Lambda polls `/status/{job_id}` every 15 seconds until completion
- Lambda timeout increased to 15 minutes
- SQS visibility timeout increased to 900 seconds (15 minutes)

**Files Modified**:
- `infra/container/app/main.py`: Added async generation with background tasks
- `infra/lambda/process-job/index.ts`: Added polling loop
- `infra/lib/video-api-stack.ts`: Increased timeouts

**Testing**: Successfully tested with 6+ minute video generation. DynamoDB correctly shows "completed" status.

See `docs/LAMBDA-TIMEOUT-ISSUE.md` for full details of the issue and solution.

### Model Download Failed

```bash
# Container tries to download Q4 model (~7GB) on first startup
# Check download progress
sudo docker logs video-inference | grep -E "Downloading|model"

# If download hangs, restart container
sudo docker restart video-inference

# Or manually download
sudo docker exec -it video-inference bash
cd /app/models
huggingface-cli download city96/HunyuanVideo-gguf hunyuan-video-t2v-720p-Q4_0.gguf
```

---

## Model Details

### HunyuanVideo-1.5

**Repository**: https://huggingface.co/hunyuanvideo-community/HunyuanVideo
**GGUF Quantized**: https://huggingface.co/city96/HunyuanVideo-gguf

**Architecture**:
- **Transformer**: 8.3B parameters, GGUF Q4 quantized to ~7GB
- **VAE**: 3-4 GB
- **Text Encoders**: CLIP + T5, 4-5 GB
- **Total VRAM Usage**: ~14-16 GB peak during inference

**Configuration** (infra/container/app/inference.py):
```python
model_id = "hunyuanvideo-community/HunyuanVideo"
gguf_path = "/app/models/hunyuan-video-t2v-720p-Q4_0.gguf"
quantization = "Q4_0"  # Good quality with memory efficiency
# Note: Q8_0 (~14GB) doesn't fit in 24GB GPU with all components
```

**Optimizations Enabled**:
- Model CPU offload (keeps components on CPU, moves to GPU as needed)
- Gradient checkpointing (reduces memory during forward pass)
- VAE tiling (processes in chunks)
- VAE slicing (reduces decode memory)
- GGUF CUDA kernels (~10% speedup)
- BF16 precision (torch.bfloat16)

**Performance**:
- Resolution: 288×512 (9:16 aspect ratio) - 720p available at 1280×720
- FPS: 15 (adjustable, HunyuanVideo native is 24)
- Steps: 30 (default, adjustable 1-100)
- Time per step: ~9-10 seconds
- Total generation: ~5-6 minutes for 3-4 second video
- Async generation: No timeout, polls every 15s

---

## File Structure

```
infra/
├── bin/
│   └── app.ts                  # CDK app entry point
├── lib/
│   ├── storage-stack.ts        # S3 buckets
│   ├── gpu-inference-stack.ts  # GPU instance + ASG
│   └── video-api-stack.ts      # API Gateway + Lambdas
├── lambda/
│   ├── submit-job/             # POST /jobs
│   ├── process-job/            # SQS consumer → GPU
│   └── get-status/             # GET /jobs/:id
├── container/
│   ├── Dockerfile              # GPU container image
│   ├── requirements.txt        # Python dependencies
│   └── app/
│       ├── main.py             # FastAPI server
│       ├── inference.py        # HunyuanVideo wrapper
│       └── utils.py            # S3 upload helpers
├── scripts/
│   ├── start-gpu.sh            # Scale ASG to 1
│   ├── stop-gpu.sh             # Scale ASG to 0
│   ├── gpu-status.sh           # Check GPU status
│   ├── test-native-inference.sh # End-to-end test
│   └── rebuild-container-on-gpu.sh # Build on GPU directly
└── docs/
    ├── AWS-INFERENCE.md        # This file
    ├── GPU-UPGRADE-SUCCESS.md  # g5.48xlarge upgrade report
    ├── LAMBDA-TIMEOUT-ISSUE.md # Known issue + fix
    └── VIDEO_API_DOCUMENTATION.md # API reference
```

---

## Next Steps

1. ~~**Fix Lambda Timeout**~~: ✅ RESOLVED - Async endpoint implemented (2025-12-28)
2. **Enable Spot Instances**: Edit gpu-inference-stack.ts to add spot pricing (~66% cost savings)
3. **Performance Testing**: Test longer videos (5-10s), higher resolutions (720p)
4. **Quality Comparison**: Compare Q8 vs Q4 vs Q6 output quality
5. **Cost Monitoring**: Set up CloudWatch dashboards and billing alerts
6. **LTX-Video Integration**: Add support for LTX-Video model as alternative
7. **Auto-scaling**: Implement auto-stop after idle period to reduce costs

---

## Support & Documentation

- **Architecture**: docs/GPU-CONNECTION-AND-ARCHITECTURE.md
- **Cost Analysis**: docs/COST-NOTES.md
- **API Reference**: docs/VIDEO_API_DOCUMENTATION.md
- **Troubleshooting**: docs/LAMBDA-TIMEOUT-ISSUE.md
- **Success Report**: docs/GPU-UPGRADE-SUCCESS.md

---

**Last Verified**: 2025-12-29
**Status**: ✅ Production Ready
**GPU**: g5.48xlarge running HunyuanVideo Q4 with async generation
**Recent Resolutions**:
- CUDA memory issue (CPU offload enabled)
- Lambda timeout issue (async + polling pattern)
