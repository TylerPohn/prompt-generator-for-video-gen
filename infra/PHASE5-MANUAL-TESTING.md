# Phase 5: Manual Testing Instructions

## Prerequisites

Before running the end-to-end test, complete these steps:

### 1. Rebuild and Push Container

The health endpoint has been updated with detailed GPU/model status. Push the updated container:

```bash
cd infra
./scripts/push-container.sh
```

### 2. Start GPU Instance

```bash
./scripts/start-gpu.sh
```

### 3. Wait for Model to Load

Check the health endpoint until `model_loaded: true`:

```bash
# Get instance IP
./scripts/gpu-status.sh

# Check health (replace IP)
curl http://<PRIVATE_IP>:8000/health | jq
```

Expected response when ready:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "cuda_available": true,
  "gpu_name": "NVIDIA A10G",
  "gpu_memory": {
    "total_gb": 22.84,
    "allocated_gb": 10.5,
    "cached_gb": 12.0
  },
  "inference_mode": "native",
  "timestamp": "2025-12-24T..."
}
```

### 4. Run End-to-End Test

```bash
./scripts/test-native-inference.sh
```

## Manual Verification Checklist

### Health Endpoint Checks
- [ ] `cuda_available: true`
- [ ] `model_loaded: true`
- [ ] `inference_mode: native`

### Inference Checks
- [ ] Container logs show DiffusionPipeline being used (not Replicate)
- [ ] Container logs show reasonable generation time (2-5 minutes for 3s video)
- [ ] No Replicate API calls in container logs

### Output Checks
- [ ] Generated video plays correctly
- [ ] Video content matches prompt

## Checking Container Logs

Via SSM:
```bash
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

aws ssm start-session --target $INSTANCE_ID
# Then in session:
docker logs video-inference --tail 100
```

## Troubleshooting

### Model not loading
- Check EFS mount: `df -h | grep efs`
- Check cache contents: `ls -la /mnt/efs/hf_cache`
- Run model preload: `./scripts/preload-model.sh`

### Container not starting
- Check user-data log: `cat /var/log/user-data.log`
- Check docker status: `docker ps -a`
- Check container logs: `docker logs video-inference`

### Generation failing
- Check GPU memory: health endpoint shows `gpu_memory`
- Reduce resolution/duration in test request
- Check for CUDA OOM errors in logs
