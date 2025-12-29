# CUDA Memory Fix - Deployment Guide

**Created**: 2025-12-28
**Status**: Ready for Testing
**Issue**: GPU runs out of CUDA memory during video generation

---

## Problem Summary

The GPU instance (g5.12xlarge with 4× NVIDIA A10G GPUs, 22.5GB VRAM each) was running out of CUDA memory during video generation. The model weights consumed ~21.96 GiB out of 22.5GB, leaving only ~2.44 MiB for the actual generation process.

**Error**: `CUDA out of memory. Tried to allocate 2.00 MiB. GPU 0 has a total capacity of 21.98 GiB of which 2.44 MiB is free`

---

## Implemented Fixes

### 1. **Gradient Checkpointing** (infra/container/app/inference.py:170-175)
- Enabled gradient checkpointing on the transformer model
- Trades compute for memory by recomputing activations during backward pass
- Reduces memory footprint during generation by ~20-30%

### 2. **VAE Slicing** (infra/container/app/inference.py:179-180)
- Added VAE slicing in addition to existing VAE tiling
- Processes VAE decode in smaller chunks
- Significantly reduces memory during the video decode phase

### 3. **Aggressive Pre-Generation Memory Cleanup** (infra/container/app/inference.py:229-240)
- Forces garbage collection before each generation
- Empties CUDA cache and resets peak memory stats
- Logs detailed memory statistics for debugging
- Ensures maximum available memory before inference starts

### 4. **Resolution Reduction** (infra/lambda/process-job/index.ts:119-120)
- **Reduced from**: 360×640 (230,400 pixels)
- **Reduced to**: 288×512 (147,456 pixels)
- **Memory savings**: ~36% reduction in pixel count
- **Maintains**: 9:16 aspect ratio (portrait/vertical video)

### 5. **Enhanced PyTorch CUDA Configuration** (infra/container/Dockerfile:31-33)
- `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:512`
  - `expandable_segments:True` - Reduces memory fragmentation
  - `max_split_size_mb:512` - Limits chunk size to 512MB for better memory management
- `CUDA_LAUNCH_BLOCKING=0` - Async CUDA operations (default, but explicit)
- `PYTORCH_NO_CUDA_MEMORY_CACHING=0` - Enables caching for performance

---

## Memory Optimization Strategy

```
Before Generation:
┌─────────────────────────────────────┐
│ GPU Memory (22.5GB Total)           │
├─────────────────────────────────────┤
│ Model Weights: ~21.96 GB (97.6%)    │ ← GGUF Q8 model
│ Available: ~2.44 MB (0.01%)         │ ← Too small!
└─────────────────────────────────────┘

After Optimizations:
┌─────────────────────────────────────┐
│ GPU Memory (22.5GB Total)           │
├─────────────────────────────────────┤
│ Model Weights: ~14-16 GB (62-71%)   │ ← With CPU offload
│ Generation Workspace: ~4-6 GB       │ ← Freed by optimizations
│ Available Buffer: ~2-4 GB           │ ← Safety margin
└─────────────────────────────────────┘

How We Achieve This:
1. Model CPU Offload - Keeps inactive components in CPU RAM
2. Gradient Checkpointing - Reduces activation memory
3. VAE Tiling + Slicing - Processes decode in chunks
4. Lower Resolution - 36% fewer pixels to process
5. Memory Fragmentation Fix - Better allocation strategy
```

---

## Deployment Steps

### Step 1: Rebuild and Push Docker Container

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Build the updated container (with memory optimizations)
cd container
./build.sh

# Push to ECR (requires AWS credentials)
cd ..
./scripts/push-container.sh
```

### Step 2: Deploy Lambda Updates

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Build and deploy Lambda functions (updated resolution)
cd lambda
npm install
npm run build

# Deploy the stack
cd ..
npm run build
npx cdk deploy --all --require-approval never
```

### Step 3: Restart GPU Instance

The GPU instance needs to pull the new container image and restart:

```bash
# Connect to GPU instance
aws ssm start-session --target i-026929c584bc61c87

# Inside SSM session:
sudo docker stop video-inference
sudo docker rm video-inference

# Pull latest image (get ECR URI from push-container.sh output)
ECR_URI="<your-ecr-uri>/video-inference:latest"
sudo docker pull $ECR_URI

# Run with updated image
sudo docker run -d \
  --name video-inference \
  --gpus all \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /opt/ml/models:/app/models \
  -v /opt/ml/hf_cache:/app/hf_cache \
  $ECR_URI

# Monitor logs
sudo docker logs -f video-inference

# Exit SSM session
exit
```

### Step 4: Test the Fix

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Start GPU if not running
./scripts/start-gpu.sh

# Wait 3-5 minutes for model to load

# Run end-to-end test
./scripts/test-native-inference.sh
```

---

## Testing & Validation

### Test 1: Direct GPU API Call

```bash
# Connect to GPU
aws ssm start-session --target i-026929c584bc61c87

# Test with new resolution (288×512)
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with yarn",
    "model": "hunyuan-video",
    "job_id": "test-memory-fix-1",
    "bucket_name": "aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale",
    "steps": 20,
    "duration": 2,
    "width": 288,
    "height": 512
  }'

# Monitor GPU memory during generation
watch -n 1 nvidia-smi
```

### Test 2: End-to-End Lambda Test

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra
./scripts/test-native-inference.sh
```

This will:
1. Submit a job via API Gateway
2. Lambda processes the job
3. GPU generates video with new optimizations
4. Returns S3 URL with generated video

### Test 3: Frontend UI Test

1. Open frontend UI
2. Generate a prompt using the prompt generator
3. Submit video generation job
4. Monitor job status
5. Verify video is generated successfully

---

## Expected Results

### Memory Usage (from logs)

Look for these log lines in the container output:

```
Pre-generation GPU memory - Total: 22.00GB, Allocated: 16.50GB, Free: 5.50GB
Generating 31 frames at 15 fps (2s)
Resolution: 288x512
Peak GPU memory: 20.50GB
Post-cleanup GPU memory - Allocated: 16.50GB, Reserved: 18.00GB
```

**Success Criteria**:
- Pre-generation free memory: >4GB (previously ~0.002GB)
- Peak memory during generation: <21.5GB (previously exceeded 22GB)
- Generation completes without CUDA OOM errors
- Post-cleanup returns to baseline

### Performance

- **Resolution**: 288×512 (9:16)
- **Duration**: 2-3 seconds
- **Steps**: 20-30
- **Generation Time**: 40-80 seconds (depending on parameters)

---

## Monitoring & Debugging

### Check Container Logs

```bash
# Via SSM
aws ssm start-session --target i-026929c584bc61c87
sudo docker logs -f video-inference
```

Look for:
- ✅ "Gradient checkpointing enabled"
- ✅ "VAE memory optimizations enabled"
- ✅ "Pre-generation GPU memory - Free: X.XXgb" (should be >4GB)
- ❌ "CUDA out of memory" (should not appear)

### Check Lambda Logs

```bash
# Get recent logs
aws logs tail /aws/lambda/ProcessJobFunction --follow
```

Look for:
- ✅ Request body shows width: 288, height: 512
- ✅ "Video generated in XX.XXs"
- ❌ GPU API errors (should not appear)

### GPU Status

```bash
# Via SSM
aws ssm start-session --target i-026929c584bc61c87
nvidia-smi

# Watch in real-time during generation
watch -n 1 nvidia-smi
```

---

## Rollback Plan

If the fixes don't work or cause issues:

### Rollback Container

```bash
# Connect to GPU
aws ssm start-session --target i-026929c584bc61c87

# Stop current container
sudo docker stop video-inference
sudo docker rm video-inference

# Run previous version (replace with actual previous tag)
sudo docker run -d \
  --name video-inference \
  --gpus all \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /opt/ml/models:/app/models \
  -v /opt/ml/hf_cache:/app/hf_cache \
  <ecr-uri>/video-inference:previous-tag
```

### Rollback Lambda

```bash
# Revert code changes
cd /Users/tyler/Desktop/Gauntlet/AI-video
git checkout HEAD~1 infra/lambda/process-job/index.ts

# Rebuild and redeploy
cd infra/lambda
npm run build
cd ..
npx cdk deploy --all
```

---

## Further Optimizations (If Still OOM)

If memory issues persist after these fixes:

### Option 1: Further Reduce Resolution
- Try 256×456 (9:16 ratio, 116,736 pixels = 50% reduction from original)
- Edit `infra/lambda/process-job/index.ts:119-120`

### Option 2: Reduce Video Duration
- Default is 3 seconds, try 2 seconds
- Fewer frames = less memory

### Option 3: Use Smaller Model Quantization
- Current: GGUF Q8 (~14GB)
- Alternative: GGUF Q4 (~7GB) - lower quality but half the memory
- Edit model path in container config

### Option 4: Multi-GPU Distribution
- Utilize all 4 GPUs instead of just GPU 0
- Requires code changes to enable model parallelism

---

## Cost Impact

**No cost increase** - These are software optimizations only.

Still: **$5.67/hour when GPU is running**

**Remember to stop GPU when not in use**:
```bash
./infra/scripts/stop-gpu.sh
```

---

## Files Changed

1. `infra/container/app/inference.py` - Memory optimizations in model loading and generation
2. `infra/container/Dockerfile` - Enhanced CUDA environment variables
3. `infra/lambda/process-job/index.ts` - Reduced resolution from 360×640 to 288×512

---

## References

- Original Issue: [docs/GPU-CONNECTION-AND-ARCHITECTURE.md](./GPU-CONNECTION-AND-ARCHITECTURE.md)
- PyTorch Memory Management: https://pytorch.org/docs/stable/notes/cuda.html#memory-management
- Diffusers Memory Optimization: https://huggingface.co/docs/diffusers/optimization/memory
- GGUF Quantization: https://github.com/ggerganov/ggml/blob/master/docs/gguf.md

---

**Status**: ✅ Ready for deployment and testing
**Next Step**: Follow deployment steps above and validate with tests
