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
