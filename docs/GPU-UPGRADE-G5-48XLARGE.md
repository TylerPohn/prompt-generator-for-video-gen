# GPU Upgrade: g5.12xlarge → g5.48xlarge

**Created**: 2025-12-28
**Status**: Ready for Implementation
**Issue**: HunyuanVideo Q4 model exceeds 24GB VRAM on g5.12xlarge
**Solution**: Upgrade to g5.48xlarge with 24GB VRAM per GPU (vs 22GB)

---

## Problem Summary

After extensive troubleshooting, HunyuanVideo-1.5 with Q4 quantization still exceeds available GPU memory on g5.12xlarge instances:

### What We Tried (All Failed)

1. **Q8 → Q4 Quantization** ❌
   - Reduced transformer from 14GB to 7.7GB
   - Still OOM during loading

2. **Memory Optimizations** ❌
   - Gradient checkpointing
   - VAE slicing + tiling
   - PYTORCH_CUDA_ALLOC_CONF settings
   - Reduced resolution (288×512)
   - Aggressive memory cleanup

3. **Loading Strategies** ❌
   - CPU offload → OOM during first inference
   - Multi-GPU balanced → tensor device mismatch
   - Incremental loading → still OOM

### Root Cause

**Memory Requirements:**
- Q4 Transformer: 7.7 GB
- VAE: 3-4 GB
- CLIP Text Encoder: 1-2 GB
- T5 Text Encoder: 3-4 GB
- **Total Model Weights: ~15-17 GB**
- **Activations & Inference: ~8-10 GB**
- **Total Required: ~25 GB**

**Available on g5.12xlarge:**
- GPU: NVIDIA A10G
- VRAM per GPU: 22-24 GB (reports as 23.60 GB)
- **Result: 1-2 GB short of requirements**

---

## Solution: Upgrade to g5.48xlarge

### Instance Comparison

| Specification | g5.12xlarge (Current) | g5.48xlarge (Upgrade) |
|--------------|----------------------|---------------------|
| **GPUs** | 4× NVIDIA A10G | 4× NVIDIA A10G |
| **VRAM per GPU** | 22-24 GB | 24 GB (full capacity) |
| **Total VRAM** | 88-96 GB | 96 GB |
| **vCPUs** | 48 | 192 |
| **RAM** | 192 GB | 768 GB |
| **Cost (On-Demand)** | $5.67/hr | $16.29/hr |
| **Cost (Spot)** | ~$2.00/hr | ~$5.50/hr |

### Why This Will Work

1. **More VRAM headroom**: The extra 1-2 GB per GPU provides the buffer needed for model loading and inference
2. **Same GPU type**: Still using A10G, so no driver/compatibility issues
3. **Proven**: Other users successfully run HunyuanVideo on instances with 24GB+ VRAM per GPU

---

## Cost Impact

### Current Costs (g5.12xlarge)
- **On-Demand**: $5.67/hour
- **Spot**: ~$2.00/hour (65% savings)
- **Monthly (8 hrs/day)**: ~$183/month on-demand, ~$64/month spot

### New Costs (g5.48xlarge)
- **On-Demand**: $16.29/hour (~2.9× increase)
- **Spot**: ~$5.50/hour (66% savings)
- **Monthly (8 hrs/day)**: ~$528/month on-demand, ~$178/month spot

### Cost Optimization Strategies

1. **Use Spot Instances** (Recommended)
   - Save ~66% on compute costs
   - Enable spot in ASG configuration
   - Low interruption risk in us-east-1

2. **Auto-Shutdown**
   - Already configured to scale to 0 when idle
   - Use `./scripts/stop-gpu.sh` when done testing

3. **Development Workflow**
   - Use g5.48xlarge only for video generation
   - Do frontend/Lambda dev without GPU running
   - Start GPU only when needed: `./scripts/start-gpu.sh`

4. **Consider Smaller Model Later**
   - Once validated, could switch to more efficient model
   - Wan2.2 or AnimateDiff fit on smaller instances
   - HunyuanVideo quality vs cost tradeoff

---

## Implementation Steps

### Step 1: Update CDK Stack

Edit `infra/lib/gpu-inference-stack.ts`:

```typescript
// Change line 202 from:
instanceType: ec2.InstanceType.of(ec2.InstanceClass.G5, ec2.InstanceSize.XLARGE12),

// To:
instanceType: ec2.InstanceType.of(ec2.InstanceClass.G5, ec2.InstanceSize.XLARGE48),
```

### Step 2: Deploy Infrastructure Update

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Stop current GPU instance (saves cost)
./scripts/stop-gpu.sh

# Deploy updated stack
npm run build
npx cdk deploy AiVideo-dev-GpuInference --require-approval never
```

**Note**: CloudFormation will replace the Auto Scaling Group, which means:
- Current GPU instance will be terminated
- Model files in `/opt/ml/models` will be lost
- Model will re-download on first startup (~7GB Q4 model)

### Step 3: Start New GPU Instance

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Start the upgraded instance
./scripts/start-gpu.sh

# Wait ~5 minutes for instance to start and model to load
# Monitor status
./scripts/gpu-status.sh
```

### Step 4: Verify Model Loading

```bash
# Connect via SSM
aws ssm start-session --target $(./scripts/gpu-status.sh | grep "Instance ID" | awk '{print $3}')

# Inside SSM session, check container logs
sudo docker logs -f video-inference
```

**Look for:**
- ✅ "Transformer moved to GPU"
- ✅ "Moving VAE to GPU..."
- ✅ "Moving text encoders to GPU..."
- ✅ "Pipeline loaded successfully"
- ✅ "Application startup complete"
- ❌ NO "CUDA out of memory" errors

### Step 5: Test Video Generation

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Run end-to-end test
./scripts/test-native-inference.sh
```

**Expected:**
- Job status: `completed` (not `failed`)
- Video generated in ~60-120 seconds
- S3 URL returned with downloadable video

---

## Rollback Plan

If upgrade doesn't work or costs are too high:

### Rollback Infrastructure

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra

# Revert instance type
git checkout HEAD -- lib/gpu-inference-stack.ts

# Redeploy
npm run build
npx cdk deploy AiVideo-dev-GpuInference --require-approval never
```

### Alternative: Switch to Smaller Model

If costs are prohibitive, consider switching to a more efficient model:

1. **Wan2.2-T2V** (Recommended)
   - 2.7B parameters (vs HunyuanVideo's 8.3B)
   - Fits comfortably in 8-12 GB VRAM
   - Works on g5.xlarge (1× A10G, $1.00/hr)
   - Good quality for product videos

2. **AnimateDiff**
   - Built on Stable Diffusion
   - 6-8 GB VRAM
   - Fast inference (~30 seconds)
   - Wide community support

3. **CogVideoX**
   - 5B parameters
   - 12-16 GB VRAM
   - Good motion quality
   - Newer model with active development

---

## Monitoring & Validation

### Check GPU Memory During Generation

```bash
# Connect to GPU instance
aws ssm start-session --target $(./scripts/gpu-status.sh | grep "Instance ID" | awk '{print $3}')

# Monitor GPU usage in real-time during generation
watch -n 1 nvidia-smi
```

**Success Criteria:**
- Memory usage stays under 22-23 GB (below 24 GB limit)
- No OOM errors in logs
- Video generation completes successfully

### Check Logs for Memory Stats

```bash
# View container logs
sudo docker logs video-inference 2>&1 | grep -E "Pre-generation GPU memory|Peak GPU memory"
```

**Expected Output:**
```
Pre-generation GPU memory - Total: 23.60GB, Allocated: 15.50GB, Free: 8.10GB
Peak GPU memory: 22.50GB
```

---

## Post-Upgrade Optimizations

Once validated on g5.48xlarge, consider these optimizations:

### 1. Evaluate Spot Instances

```bash
# Check spot pricing
aws ec2 describe-spot-price-history \
  --instance-types g5.48xlarge \
  --product-descriptions "Linux/UNIX" \
  --region us-east-1 \
  --start-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --query 'SpotPriceHistory[*].[Timestamp,SpotPrice]' \
  --output table
```

If spot price is stable (usually $5-6/hr), enable spot in ASG:
- Edit `gpu-inference-stack.ts`
- Set `spotPrice` in launch template
- Redeploy

### 2. Right-Size for Workload

**Light Usage** (< 10 videos/day):
- Spot g5.48xlarge: $5.50/hr
- Only run when needed
- ~$44/month (8 hrs/week)

**Medium Usage** (50-100 videos/day):
- Spot g5.48xlarge 8-12 hrs/day
- ~$178/month

**Heavy Usage** (> 500 videos/day):
- Consider Reserved Instances (1-year: 40% savings)
- Or switch to more efficient model

### 3. Implement Request Batching

If processing multiple videos, batch requests:
- Load model once
- Generate multiple videos in sequence
- Amortize startup cost across videos

---

## Timeline

1. **Code changes**: 5 minutes
2. **CDK deployment**: 10-15 minutes
3. **New instance startup**: 5 minutes
4. **Model download & load**: 5 minutes
5. **Testing**: 5-10 minutes

**Total**: ~30-40 minutes

---

## Success Metrics

After upgrade, verify:

- [ ] Instance type shows `g5.48xlarge` in AWS console
- [ ] Container starts without OOM errors
- [ ] Model loads successfully (all components)
- [ ] Test video generation completes
- [ ] Video quality is acceptable
- [ ] Generation time < 2 minutes per video
- [ ] Memory usage < 23 GB during inference

---

## Files to Modify

1. `infra/lib/gpu-inference-stack.ts` - Change instance type
2. `docs/GPU-STATUS.md` - Update instance type documentation
3. `docs/COST-NOTES.md` - Update cost calculations

---

## References

- [AWS g5 Instance Types](https://aws.amazon.com/ec2/instance-types/g5/)
- [HunyuanVideo Memory Requirements](https://github.com/Tencent/HunyuanVideo)
- [Previous CUDA Memory Fix Attempt](./CUDA-MEMORY-FIX-DEPLOYMENT.md)
- [GPU Architecture Documentation](./GPU-CONNECTION-AND-ARCHITECTURE.md)

---

## Notes

- Current code with Q4 quantization and optimizations is ready
- No code changes needed, only infrastructure upgrade
- Model will re-download on first startup (one-time, ~5 minutes)
- All optimizations (gradient checkpointing, VAE slicing, etc.) still apply
- If this works, we're done; if not, we switch to different model

---

**Status**: ✅ Ready to implement
**Next Step**: Update instance type in `gpu-inference-stack.ts` and deploy
