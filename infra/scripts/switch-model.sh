#!/bin/bash
# Switch the video generation model on the GPU instance
# Usage: ./switch-model.sh [hunyuan-video|ltx-video|hunyuan-video-15-i2v]
#
# This script:
# 1. Stops the current container
# 2. Starts a new container with VIDEO_MODEL set to the specified model
# 3. Models are cached on EFS, so no re-download is needed after first run
#
# Can be run from:
# - The GPU instance itself (runs docker commands directly)
# - Any machine with AWS credentials (uses SSM to run commands remotely)

set -e

MODEL=${1:-hunyuan-video}

if [[ "$MODEL" != "hunyuan-video" && "$MODEL" != "ltx-video" && "$MODEL" != "hunyuan-video-15-i2v" ]]; then
    echo "Invalid model: $MODEL"
    echo "Usage: ./switch-model.sh [hunyuan-video|ltx-video|hunyuan-video-15-i2v]"
    exit 1
fi

echo "Switching to model: $MODEL"

# Function to run the model switch commands locally
run_local_switch() {
    echo "Running model switch locally..."

    docker stop video-inference || true
    docker rm video-inference || true

    REGION=us-east-1
    ACCOUNT_ID=971422717446
    ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/video-inference:latest"
    HF_CACHE_DIR=/mnt/efs/hf_cache
    MODEL_DIR=/mnt/efs/models

    echo "Starting container with VIDEO_MODEL=$MODEL..."
    docker run -d --name video-inference --gpus all --restart unless-stopped \
        -p 8000:8000 \
        -e VIDEO_MODEL=$MODEL \
        -e HF_HOME=/app/hf_cache \
        -e TRANSFORMERS_CACHE=/app/hf_cache \
        -v $HF_CACHE_DIR:/app/hf_cache:rw \
        -v $MODEL_DIR:/app/models:rw \
        -e AWS_DEFAULT_REGION=$REGION \
        $ECR_URI

    echo "Waiting for container to be ready..."
    for i in {1..120}; do
        HEALTH=$(curl -s http://localhost:8000/health 2>/dev/null || echo '{}')
        if echo "$HEALTH" | grep -q healthy; then
            echo "Container ready!"
            echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"
            exit 0
        fi
        echo -n "."
        sleep 5
    done

    echo ""
    echo "Container may still be loading model. Check logs:"
    docker logs video-inference --tail 20
}

# Check if we're running on an EC2 instance (likely the GPU instance)
if curl -s --connect-timeout 1 http://169.254.169.254/latest/meta-data/instance-id >/dev/null 2>&1; then
    # We're on an EC2 instance - check if docker is available and we have a GPU
    if command -v docker >/dev/null 2>&1 && command -v nvidia-smi >/dev/null 2>&1; then
        echo "Detected GPU instance - running commands locally"
        run_local_switch
        exit 0
    fi
fi

# Not on GPU instance - use SSM to run remotely
echo "Running remotely via SSM..."

# Get instance ID from ASG
ASG_NAME=$(aws autoscaling describe-auto-scaling-groups \
    --query "AutoScalingGroups[?contains(AutoScalingGroupName, 'GpuAsg')].AutoScalingGroupName" \
    --output text | head -1)

if [ -z "$ASG_NAME" ]; then
    echo "Could not find GPU ASG"
    exit 1
fi

INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG_NAME" \
    --query "AutoScalingGroups[0].Instances[0].InstanceId" \
    --output text)

if [ "$INSTANCE_ID" == "None" ] || [ -z "$INSTANCE_ID" ]; then
    echo "No GPU instance running. Start with: ./scripts/start-gpu.sh"
    echo "   When instance starts, set VIDEO_MODEL=$MODEL in user-data or manually."
    exit 0
fi

echo "Found GPU instance: $INSTANCE_ID"
echo "Restarting container with VIDEO_MODEL=$MODEL..."

# Create a temporary file for the commands JSON
PARAMS_FILE=$(mktemp)
cat > "$PARAMS_FILE" << EOF
{
    "commands": [
        "echo '=== Switching to model: $MODEL ==='",
        "docker stop video-inference || true",
        "docker rm video-inference || true",
        "REGION=us-east-1",
        "ACCOUNT_ID=971422717446",
        "ECR_URI=\"\${ACCOUNT_ID}.dkr.ecr.\${REGION}.amazonaws.com/video-inference:latest\"",
        "HF_CACHE_DIR=/mnt/efs/hf_cache",
        "MODEL_DIR=/mnt/efs/models",
        "echo 'Starting container with VIDEO_MODEL=$MODEL...'",
        "docker run -d --name video-inference --gpus all --restart unless-stopped -p 8000:8000 -e VIDEO_MODEL=$MODEL -e HF_HOME=/app/hf_cache -e TRANSFORMERS_CACHE=/app/hf_cache -v \$HF_CACHE_DIR:/app/hf_cache:rw -v \$MODEL_DIR:/app/models:rw -e AWS_DEFAULT_REGION=\$REGION \$ECR_URI",
        "echo 'Waiting for container to be ready...'",
        "for i in {1..120}; do HEALTH=\$(curl -s http://localhost:8000/health 2>/dev/null || echo '{}'); if echo \$HEALTH | grep -q healthy; then echo 'Container ready!'; echo \$HEALTH | jq .; exit 0; fi; echo -n '.'; sleep 5; done",
        "echo ''",
        "echo 'Container may still be loading model. Check logs:'",
        "docker logs video-inference --tail 20"
    ]
}
EOF

COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --timeout-seconds 600 \
    --parameters "file://$PARAMS_FILE" \
    --output text \
    --query 'Command.CommandId')

rm -f "$PARAMS_FILE"

echo "Command ID: $COMMAND_ID"
echo "Waiting for model switch (this may take 2-5 minutes for first load)..."

# Wait for command to complete
for i in {1..60}; do
    STATUS=$(aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --query 'Status' \
        --output text 2>/dev/null || echo "Pending")

    if [ "$STATUS" == "Success" ]; then
        echo ""
        echo "Model switched to: $MODEL"
        aws ssm get-command-invocation \
            --command-id "$COMMAND_ID" \
            --instance-id "$INSTANCE_ID" \
            --query 'StandardOutputContent' \
            --output text | tail -20
        exit 0
    elif [ "$STATUS" == "Failed" ]; then
        echo ""
        echo "Model switch failed!"
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

echo ""
echo "Command timed out. Check instance manually:"
echo "   aws ssm start-session --target $INSTANCE_ID"
echo "   docker logs -f video-inference"
