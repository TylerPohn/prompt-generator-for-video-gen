#!/bin/bash
# Setup the FastAPI inference container on the GPU instance
# Run this after the GPU instance is started

set -e

INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

if [ "$INSTANCE_ID" == "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "❌ No GPU instance running. Start with: ./scripts/start-gpu.sh"
  exit 1
fi

echo "Setting up FastAPI container on instance: $INSTANCE_ID"

# Send setup commands via SSM to pull and run native container
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --timeout-seconds 900 \
  --parameters 'commands=["set -e","echo === Setting up native GPU inference container ===","REGION=us-east-1","ACCOUNT_ID=971422717446","MOUNT_BASE=/mnt/efs","mkdir -p $MOUNT_BASE/hf_cache","mkdir -p $MOUNT_BASE/models","chown -R 1000:1000 $MOUNT_BASE || true","aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com","ECR_URI=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/video-inference:latest","echo Pulling: $ECR_URI","docker pull $ECR_URI","docker stop video-inference 2>/dev/null || true","docker rm video-inference 2>/dev/null || true","docker run -d --name video-inference --gpus all --restart unless-stopped -p 8000:8000 -e HF_HOME=/app/hf_cache -e TRANSFORMERS_CACHE=/app/hf_cache -e GGUF_MODEL_PATH=/app/models/hunyuan-video-t2v-720p-Q8_0.gguf -v $MOUNT_BASE/hf_cache:/app/hf_cache:rw -v $MOUNT_BASE/models:/app/models:rw -e AWS_DEFAULT_REGION=$REGION $ECR_URI","sleep 10","docker ps","curl -s http://localhost:8000/health || echo Health check pending...","echo === Setup complete ==="]' \
  --output text --query 'Command.CommandId')

echo "Command ID: $COMMAND_ID"
echo "Waiting for setup to complete (this may take a few minutes)..."

# Wait and check status
for i in {1..60}; do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' \
    --output text 2>/dev/null || echo "Pending")

  if [ "$STATUS" == "Success" ]; then
    echo ""
    echo "✅ Container setup complete!"
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$INSTANCE_ID" \
      --query 'StandardOutputContent' \
      --output text | tail -20
    break
  elif [ "$STATUS" == "Failed" ]; then
    echo ""
    echo "❌ Setup failed!"
    aws ssm get-command-invocation \
      --command-id "$COMMAND_ID" \
      --instance-id "$INSTANCE_ID" \
      --query 'StandardErrorContent' \
      --output text
    exit 1
  else
    echo -n "."
    sleep 5
  fi
done
