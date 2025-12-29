# Native GPU Inference Fix Implementation Plan

## Overview

Fix the non-functional native GPU inference system by resolving PyTorch/Diffusers dependency conflicts, enabling container auto-start on GPU boot, and implementing model pre-caching to eliminate cold-start delays.

## Current State Analysis

The codebase has a complete native GPU inference implementation using HuggingFace Diffusers with the `Lightricks/LTX-Video` model designed for AWS g5.xlarge instances (NVIDIA A10G, 24GB VRAM). However, this system is non-functional due to:

1. **Dependency Conflicts**: Flexible version specifiers (`>=`) in `requirements.txt` allow pip to resolve incompatible version combinations
2. **No Container Auto-Start**: GPU instance user data only verifies GPU exists, doesn't start inference container
3. **No Model Pre-Caching**: ~10GB model downloads on first request, causing significant cold-start delays
4. **Replicate Workaround**: `setup-gpu-container.sh` deploys a lightweight Replicate proxy instead of native inference

### Key Discoveries:
- `infra/container/requirements.txt:8-18` - Current flexible version specs causing conflicts
- `infra/GPU-STATUS.md:60-66` - Documented fix versions (not applied)
- `infra/lib/gpu-inference-stack.ts:75-89` - User data missing container startup
- `infra/scripts/setup-gpu-container.sh` - Deploys Replicate proxy, not native inference
- `infra/container/app/inference.py:46-81` - DiffusionPipeline model loading code

## Desired End State

After implementation:
1. `infra/container/requirements.txt` has pinned, tested, compatible versions
2. Docker container builds successfully and runs inference locally (CPU mode for testing)
3. GPU instance automatically pulls and starts native inference container on boot
4. Model is pre-cached on EFS, eliminating first-request download delay
5. End-to-end video generation works via native GPU inference (no Replicate dependency)

### Verification:
- Local: `docker build` succeeds, container starts, imports work
- AWS: GPU instance boots, container auto-starts, `/health` returns `cuda_available: true`
- E2E: POST to `/generate` endpoint produces video in S3 using local GPU (not Replicate)

## What We're NOT Doing

- Migrating to ECS for container orchestration (future work)
- Implementing scale-to-zero based on queue depth (separate optimization)
- Adding CloudWatch dashboards or monitoring (low priority)
- Changing the video generation model (Lightricks/LTX-Video stays)
- Modifying the Lambda or API Gateway infrastructure

---

## Phase 1: Local Dependency Resolution & Testing

### Overview
Pin compatible dependency versions and verify they install correctly in a local environment without GPU.

### Changes Required:

#### 1. Update requirements.txt
**File**: `infra/container/requirements.txt`
**Changes**: Replace flexible version specifiers with pinned, tested versions

```txt
# Core dependencies
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
pydantic-settings==2.1.0

# ML/AI dependencies - PINNED VERSIONS for CUDA 12.1 compatibility
torch==2.4.0+cu121
torchvision==0.19.0+cu121
torchaudio==2.4.0+cu121
--extra-index-url https://download.pytorch.org/whl/cu121

# Diffusion models - PINNED VERSIONS tested with torch 2.4.0
diffusers==0.30.0
transformers==4.44.0
accelerate==0.33.0
safetensors>=0.4.2
huggingface-hub>=0.22.0

# Video processing
imageio==2.34.0
imageio-ffmpeg==0.4.9
av==11.0.0
numpy==1.26.3
pillow==10.2.0

# AWS/Cloud
boto3==1.34.34
botocore==1.34.34

# Utilities
python-multipart==0.0.6
aiofiles==23.2.1
python-dotenv==1.0.1
requests==2.31.0

# Logging and monitoring
loguru==0.7.2
```

#### 2. Create local test script
**File**: `infra/container/test_deps.py`
**Purpose**: Verify all imports work correctly

```python
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
```

### Success Criteria:

#### Automated Verification:
- [x] Create Python virtual environment: `python -m venv test_venv`
- [x] Install dependencies: `pip install -r infra/container/requirements.txt`
- [x] Run import test: `python infra/container/test_deps.py`
- [x] All imports succeed (exit code 0)

#### Manual Verification:
- [x] Review pip install output for any version conflict warnings
- [x] Confirm no deprecation warnings related to torch/diffusers compatibility

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Local Container Build & Verification

### Overview
Build the Docker container locally and verify all dependencies work correctly inside the container environment.

### Changes Required:

#### 1. Create container test script
**File**: `infra/container/test_container.sh`
**Purpose**: Build and test container locally

```bash
#!/bin/bash
# Test container build and dependency imports locally
set -e

cd "$(dirname "$0")"

echo "=== Building container ==="
docker build -t video-inference:test .

echo ""
echo "=== Testing dependency imports ==="
docker run --rm video-inference:test python /app/test_deps.py

echo ""
echo "=== Testing inference module import ==="
docker run --rm video-inference:test python -c "
from app.inference import VideoGenerator
print('✓ VideoGenerator class importable')
print('  (Model not loaded - would require GPU)')
"

echo ""
echo "=== Testing FastAPI app startup ==="
# Start container in background, test health endpoint, then stop
docker run -d --name video-test -p 8001:8000 video-inference:test
sleep 5

if curl -s http://localhost:8001/health | grep -q "healthy"; then
    echo "✓ Health endpoint responding"
else
    echo "❌ Health endpoint failed"
    docker logs video-test
    docker stop video-test && docker rm video-test
    exit 1
fi

docker stop video-test && docker rm video-test

echo ""
echo "✅ Container build and tests passed!"
```

#### 2. Update Dockerfile to copy test script
**File**: `infra/container/Dockerfile`
**Changes**: Add test_deps.py to container

Add after line 56 (`COPY app/ ./app/`):
```dockerfile
# Copy test script for dependency verification
COPY test_deps.py .
```

#### 3. Update .dockerignore if needed
**File**: `infra/container/.dockerignore`
**Changes**: Ensure test files are not ignored (if .dockerignore exists and is restrictive)

### Success Criteria:

#### Automated Verification:
- [x] Container builds successfully: `docker build -t video-inference:test infra/container/`
- [x] Dependency test passes in container: `docker run --rm video-inference:test python /app/test_deps.py`
- [x] Inference module imports: `docker run --rm video-inference:test python -c "from app.inference import VideoGenerator"`
- [x] Health endpoint responds: `curl http://localhost:8001/health` returns healthy status

#### Manual Verification:
- [ ] Review docker build output for any warnings
- [ ] Container logs show no import errors on startup
- [ ] Container size is reasonable (should be ~5-8GB due to PyTorch/CUDA)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: GPU Instance Container Auto-Start

### Overview
Update infrastructure to automatically pull and run the native inference container when GPU instance boots, replacing the Replicate proxy workaround.

### Changes Required:

#### 1. Push container to ECR
**File**: `infra/scripts/push-container.sh` (new file)
**Purpose**: Build and push container to existing ECR repository

```bash
#!/bin/bash
# Build and push inference container to ECR
set -e

REGION="us-east-1"
ACCOUNT_ID="971422717446"
ECR_REPO="video-inference"
IMAGE_TAG="${1:-latest}"

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

cd "$(dirname "$0")/../container"

echo "=== Logging into ECR ==="
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

echo "=== Building container ==="
docker build -t ${ECR_REPO}:${IMAGE_TAG} .

echo "=== Tagging for ECR ==="
docker tag ${ECR_REPO}:${IMAGE_TAG} ${ECR_URI}:${IMAGE_TAG}

echo "=== Pushing to ECR ==="
docker push ${ECR_URI}:${IMAGE_TAG}

echo ""
echo "✅ Container pushed to: ${ECR_URI}:${IMAGE_TAG}"
```

#### 2. Update GPU instance user data
**File**: `infra/lib/gpu-inference-stack.ts`
**Changes**: Replace minimal user data with full container startup

Replace lines 75-89 with:

```typescript
    // User data to start Docker container with native inference
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      'exec > >(tee /var/log/user-data.log) 2>&1',
      '',
      '# Docker should be pre-installed on ECS-optimized AMI',
      'systemctl start docker || true',
      'systemctl enable docker || true',
      '',
      '# Verify GPU is available',
      'echo "Checking GPU..."',
      'nvidia-smi',
      '',
      '# ECR login',
      'REGION="us-east-1"',
      'ACCOUNT_ID="971422717446"',
      'aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com',
      '',
      '# Pull and run inference container',
      'ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/video-inference:latest"',
      'echo "Pulling container: $ECR_URI"',
      'docker pull $ECR_URI',
      '',
      '# Get Replicate token from SSM (fallback for hybrid mode)',
      'REPLICATE_TOKEN=$(aws ssm get-parameter --name /video-generation/replicate-token --query Parameter.Value --output text --region $REGION 2>/dev/null || echo "")',
      '',
      '# Create EFS mount point for model cache (if EFS is configured)',
      'mkdir -p /mnt/efs/hf_cache',
      '',
      '# Run the container with GPU support',
      'docker run -d \\',
      '  --name video-inference \\',
      '  --gpus all \\',
      '  --restart unless-stopped \\',
      '  -p 8000:8000 \\',
      '  -e HF_HOME=/app/hf_cache \\',
      '  -e TRANSFORMERS_CACHE=/app/hf_cache \\',
      '  -v /mnt/efs/hf_cache:/app/hf_cache:rw \\',
      '  -e AWS_DEFAULT_REGION=$REGION \\',
      '  $ECR_URI',
      '',
      '# Wait for container to be ready',
      'echo "Waiting for container to start..."',
      'for i in {1..60}; do',
      '  if curl -s http://localhost:8000/health | grep -q "healthy"; then',
      '    echo "Container is ready!"',
      '    break',
      '  fi',
      '  sleep 5',
      'done',
      '',
      'echo "GPU inference instance ready with native container"'
    );
```

#### 3. Add SSM permissions for ECR login
**File**: `infra/lib/gpu-inference-stack.ts`
**Changes**: Add SSM parameter read permission to instance role

Add after line 72 (after ECR permissions):

```typescript
    // SSM parameter access for configuration
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/video-generation/*`,
        ],
      })
    );
```

#### 4. Update setup-gpu-container.sh to use native container
**File**: `infra/scripts/setup-gpu-container.sh`
**Changes**: Replace Replicate proxy deployment with native container pull

Replace the entire SSM command (lines 20-156) with:

```bash
# Send setup commands via SSM to pull and run native container
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --timeout-seconds 600 \
  --parameters commands='[
    "set -e",
    "echo \"=== Setting up native GPU inference container ===\"",
    "",
    "# ECR login",
    "REGION=us-east-1",
    "ACCOUNT_ID=971422717446",
    "aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com",
    "",
    "# Pull latest container",
    "ECR_URI=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/video-inference:latest",
    "echo \"Pulling: $ECR_URI\"",
    "docker pull $ECR_URI",
    "",
    "# Stop existing container",
    "docker stop video-inference 2>/dev/null || true",
    "docker rm video-inference 2>/dev/null || true",
    "",
    "# Create cache directory",
    "mkdir -p /mnt/efs/hf_cache",
    "",
    "# Run with GPU support",
    "docker run -d \\",
    "  --name video-inference \\",
    "  --gpus all \\",
    "  --restart unless-stopped \\",
    "  -p 8000:8000 \\",
    "  -e HF_HOME=/app/hf_cache \\",
    "  -v /mnt/efs/hf_cache:/app/hf_cache:rw \\",
    "  -e AWS_DEFAULT_REGION=$REGION \\",
    "  $ECR_URI",
    "",
    "# Wait for container",
    "sleep 10",
    "docker ps",
    "curl -s http://localhost:8000/health || echo \"Health check pending...\"",
    "echo \"=== Setup complete ===\""
  ]' \
  --output text --query 'Command.CommandId')
```

### Success Criteria:

#### Automated Verification:
- [x] ECR push succeeds: `./infra/scripts/push-container.sh`
- [x] CDK diff shows user data changes: `cd infra && cdk diff`
- [x] CDK deploy succeeds: `cd infra && cdk deploy --all`

#### Manual Verification:
- [ ] Start GPU instance: `./infra/scripts/start-gpu.sh`
- [ ] Check user-data log: `aws ssm send-command ... "cat /var/log/user-data.log"`
- [ ] Container is running: `docker ps` shows video-inference
- [ ] Health check passes: `curl http://<instance-ip>:8000/health` shows cuda_available: true

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Model Pre-Caching with EFS

### Overview
Implement EFS storage for model caching to eliminate the ~10GB download on first request. The model will be pre-downloaded and persist across instance restarts.

### Changes Required:

#### 1. Add EFS filesystem to GPU stack
**File**: `infra/lib/gpu-inference-stack.ts`
**Changes**: Add EFS filesystem and mount target

Add imports at top of file:
```typescript
import * as efs from 'aws-cdk-lib/aws-efs';
```

Add after security group creation (after line 37):

```typescript
    // EFS Filesystem for model cache
    const modelCacheFs = new efs.FileSystem(this, 'ModelCacheEfs', {
      vpc: this.vpc,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.BURSTING,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep models on stack deletion
      encrypted: true,
    });

    // Allow GPU instances to mount EFS
    modelCacheFs.connections.allowDefaultPortFrom(this.securityGroup);

    // Create access point for the model cache
    const accessPoint = modelCacheFs.addAccessPoint('ModelCacheAccessPoint', {
      path: '/hf_cache',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755',
      },
      posixUser: {
        gid: '1000',
        uid: '1000',
      },
    });
```

Add EFS mount to user data (update the user data section):

```typescript
    // Add EFS mount commands before docker run
    userData.addCommands(
      // ... existing commands ...
      '',
      '# Install EFS utils and mount',
      'yum install -y amazon-efs-utils || apt-get install -y amazon-efs-utils',
      `EFS_ID="${modelCacheFs.fileSystemId}"`,
      'mkdir -p /mnt/efs',
      'mount -t efs -o tls $EFS_ID:/ /mnt/efs',
      'mkdir -p /mnt/efs/hf_cache',
      'chown -R 1000:1000 /mnt/efs/hf_cache',
      '',
      // ... rest of docker run commands ...
    );
```

Add output for EFS ID:

```typescript
    new cdk.CfnOutput(this, 'EfsFileSystemId', {
      value: modelCacheFs.fileSystemId,
      description: 'EFS Filesystem ID for model cache',
    });
```

#### 2. Create model pre-download script
**File**: `infra/scripts/preload-model.sh`
**Purpose**: Download model to EFS before first inference request

```bash
#!/bin/bash
# Pre-download the LTX-Video model to EFS cache
set -e

INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

if [ "$INSTANCE_ID" == "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "❌ No GPU instance running. Start with: ./scripts/start-gpu.sh"
  exit 1
fi

echo "Pre-loading model on instance: $INSTANCE_ID"
echo "This will download ~10GB and may take 10-15 minutes..."

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --timeout-seconds 1800 \
  --parameters commands='[
    "set -e",
    "echo \"=== Pre-downloading LTX-Video model ===\"",
    "",
    "# Run Python in the container to download model",
    "docker exec video-inference python -c \"",
    "from huggingface_hub import snapshot_download",
    "import os",
    "print(f'Downloading to: {os.environ.get(\"HF_HOME\", \"/app/hf_cache\")}')",
    "snapshot_download(",
    "    repo_id='Lightricks/LTX-Video',",
    "    local_dir_use_symlinks=False,",
    "    resume_download=True",
    ")",
    "print('Download complete!')",
    "\"",
    "",
    "# Verify model files exist",
    "ls -la /mnt/efs/hf_cache/",
    "echo \"=== Model pre-load complete ===\""
  ]' \
  --output text --query 'Command.CommandId')

echo "Command ID: $COMMAND_ID"
echo "Waiting for download to complete..."

# Poll for completion
for i in {1..180}; do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' \
    --output text 2>/dev/null || echo "Pending")

  if [ "$STATUS" == "Success" ]; then
    echo ""
    echo "✅ Model pre-loaded successfully!"
    break
  elif [ "$STATUS" == "Failed" ]; then
    echo ""
    echo "❌ Pre-load failed!"
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$INSTANCE_ID" \
      --query 'StandardErrorContent' \
      --output text
    exit 1
  else
    echo -n "."
    sleep 10
  fi
done
```

#### 3. Update inference.py to use cache efficiently
**File**: `infra/container/app/inference.py`
**Changes**: Add cache verification logging

Add after line 42 (after device/dtype logging):

```python
        # Log cache location
        hf_home = os.environ.get('HF_HOME', '/app/hf_cache')
        logger.info(f"HuggingFace cache: {hf_home}")
        if os.path.exists(hf_home):
            cache_contents = os.listdir(hf_home)
            logger.info(f"Cache contents: {len(cache_contents)} items")
        else:
            logger.warning(f"Cache directory does not exist: {hf_home}")
```

### Success Criteria:

#### Automated Verification:
- [x] CDK diff shows EFS resources: `cd infra && cdk diff`
- [x] CDK deploy succeeds with EFS: `cd infra && cdk deploy --all`
- [x] EFS filesystem created: `aws efs describe-file-systems`

#### Manual Verification:
- [ ] Start GPU instance: `./infra/scripts/start-gpu.sh`
- [ ] EFS mounted: `ssh/ssm to instance, df -h shows /mnt/efs`
- [ ] Pre-load model: `./infra/scripts/preload-model.sh`
- [ ] Model files on EFS: `ls /mnt/efs/hf_cache` shows model files
- [ ] Second inference request uses cache (no download in logs)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: AWS GPU Testing & Validation

### Overview
Perform end-to-end testing of native GPU inference on AWS, verifying the complete flow from API request to video output.

### Changes Required:

#### 1. Create end-to-end test script
**File**: `infra/scripts/test-native-inference.sh`
**Purpose**: Test the complete inference pipeline

```bash
#!/bin/bash
# End-to-end test of native GPU inference
set -e

API_ENDPOINT="https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod"

echo "=== Testing Native GPU Inference ==="
echo ""

# 1. Check GPU instance status
echo "1. Checking GPU instance..."
./scripts/gpu-status.sh

# 2. Submit a test job
echo ""
echo "2. Submitting test video generation..."
RESPONSE=$(curl -s -X POST "${API_ENDPOINT}/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A golden retriever playing fetch in a sunny park",
    "duration": 3,
    "steps": 30
  }')

JOB_ID=$(echo $RESPONSE | jq -r '.jobId')
echo "Job ID: $JOB_ID"

if [ "$JOB_ID" == "null" ] || [ -z "$JOB_ID" ]; then
  echo "❌ Failed to submit job"
  echo "Response: $RESPONSE"
  exit 1
fi

# 3. Poll for completion
echo ""
echo "3. Waiting for video generation..."
for i in {1..60}; do
  STATUS_RESPONSE=$(curl -s "${API_ENDPOINT}/status/${JOB_ID}")
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')

  echo "   Status: $STATUS"

  if [ "$STATUS" == "completed" ]; then
    VIDEO_URL=$(echo $STATUS_RESPONSE | jq -r '.videoUrl')
    echo ""
    echo "✅ Video generated successfully!"
    echo "   Video URL: $VIDEO_URL"
    break
  elif [ "$STATUS" == "failed" ]; then
    ERROR=$(echo $STATUS_RESPONSE | jq -r '.error')
    echo ""
    echo "❌ Generation failed: $ERROR"
    exit 1
  fi

  sleep 10
done

# 4. Verify video is accessible
echo ""
echo "4. Verifying video accessibility..."
if curl -s -I "$VIDEO_URL" | grep -q "200 OK"; then
  echo "✅ Video is accessible"
else
  echo "⚠️  Video URL returned non-200 status"
fi

# 5. Check GPU container logs for native inference
echo ""
echo "5. Checking inference logs..."
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands='["docker logs video-inference --tail 50"]' \
  --output text > /dev/null

echo "Run 'docker logs video-inference' on instance to see full inference logs"
echo ""
echo "=== Test Complete ==="
```

#### 2. Update health endpoint for detailed status
**File**: `infra/container/app/main.py`
**Changes**: Add more diagnostic info to health check

Find the health endpoint and update to include:

```python
@app.get("/health")
async def health():
    """Health check with GPU and model status."""
    import torch

    cuda_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda_available else None
    gpu_memory = None

    if cuda_available:
        gpu_memory = {
            "total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1e9, 2),
            "allocated_gb": round(torch.cuda.memory_allocated(0) / 1e9, 2),
            "cached_gb": round(torch.cuda.memory_reserved(0) / 1e9, 2),
        }

    model_loaded = video_generator is not None and video_generator.pipeline is not None

    return {
        "status": "healthy",
        "cuda_available": cuda_available,
        "gpu_name": gpu_name,
        "gpu_memory": gpu_memory,
        "model_loaded": model_loaded,
        "inference_mode": "native" if model_loaded else "initializing",
    }
```

### Success Criteria:

#### Automated Verification:
- [x] Test script created: `./infra/scripts/test-native-inference.sh`
- [ ] Test script runs without errors: `./infra/scripts/test-native-inference.sh`
- [ ] Job completes with status "completed"
- [ ] Video URL is accessible (returns 200)

#### Manual Verification:
- [ ] Health endpoint shows `cuda_available: true`
- [ ] Health endpoint shows `model_loaded: true`
- [ ] Health endpoint shows `inference_mode: native`
- [ ] Container logs show DiffusionPipeline being used (not Replicate)
- [ ] Container logs show reasonable generation time (2-5 minutes for 3s video)
- [ ] Generated video plays correctly and matches prompt
- [ ] No Replicate API calls in container logs

**Implementation Note**: This is the final phase. After all verification passes, the native GPU inference system is fully operational.

---

## Testing Strategy

### Unit Tests:
- `test_deps.py` - Verify all imports work
- Import test for `VideoGenerator` class
- Health endpoint returns correct schema

### Integration Tests:
- Container builds successfully
- Container starts and health check passes
- Model can be loaded (requires GPU)
- End-to-end video generation

### Manual Testing Steps:
1. Build container locally and verify imports
2. Push to ECR and deploy infrastructure
3. Start GPU instance and verify container auto-starts
4. Pre-load model to EFS
5. Submit test video generation request
6. Verify video is generated using native GPU (check logs)
7. Verify video quality and correctness

## Performance Considerations

- **Cold Start**: First request after model pre-load should be ~30 seconds (loading model into GPU memory)
- **Warm Inference**: Subsequent requests should take 2-5 minutes for a 3-second video at 512x512
- **Memory**: A10G has 24GB VRAM; LTX-Video uses ~10-15GB depending on resolution
- **EFS Throughput**: Initial model load from EFS takes ~2-3 minutes; subsequent loads use OS cache

## Cost Considerations

| Resource | Hourly Cost | Notes |
|----------|-------------|-------|
| g5.xlarge | ~$1.00/hr | Only when running |
| EFS | ~$0.30/GB/month | ~10GB for model = ~$3/month |
| ECR | ~$0.10/GB/month | ~5GB container = ~$0.50/month |

**Total additional monthly cost**: ~$3.50 (EFS + ECR storage)

## Rollback Plan

If native inference fails after deployment:
1. Update `setup-gpu-container.sh` to deploy Replicate proxy (revert changes)
2. Or scale down GPU ASG to 0 and continue using frontend's direct Replicate integration

## References

- Research document: `thoughts/shared/research/2025-12-24-native-gpu-inference-issue.md`
- GPU status tracking: `infra/GPU-STATUS.md`
- Native inference code: `infra/container/app/inference.py`
- Current workaround: `infra/scripts/setup-gpu-container.sh` (Replicate proxy)
- HuggingFace model: https://huggingface.co/Lightricks/LTX-Video
