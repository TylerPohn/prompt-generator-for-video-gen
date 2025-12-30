#!/bin/bash
# Script to rebuild Docker container on GPU instance from latest code
# Usage: ./rebuild-container-on-gpu.sh [model]
#   model: hunyuan-video (default) or ltx-video
set -e

MODEL=${1:-hunyuan-video}

if [[ "$MODEL" != "hunyuan-video" && "$MODEL" != "ltx-video" ]]; then
    echo "Invalid model: $MODEL"
    echo "Usage: ./rebuild-container-on-gpu.sh [hunyuan-video|ltx-video]"
    exit 1
fi

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
    exit 1
fi

REPO_URL="https://github.com/TylerPohn/AI-video.git"
REPO_DIR="/home/ec2-user/AI-video"

echo "=== Rebuilding container on GPU instance ==="
echo "Instance ID: $INSTANCE_ID"
echo "Model: $MODEL"
echo "Repository: $REPO_URL"

# Create a temporary file for the commands JSON
PARAMS_FILE=$(mktemp)
cat > "$PARAMS_FILE" << EOF
{
    "commands": [
        "#!/bin/bash",
        "set -e",
        "REPO_URL='$REPO_URL'",
        "REPO_DIR='$REPO_DIR'",
        "MODEL='$MODEL'",
        "",
        "echo '=== Step 1: Install git if not present ==='",
        "if ! command -v git &> /dev/null; then sudo yum install -y git; fi",
        "",
        "echo '=== Step 2: Clone/Update Repository ==='",
        "if [ -d \"\$REPO_DIR\" ]; then echo 'Repository exists, pulling latest...'; cd \"\$REPO_DIR\"; git fetch origin; git reset --hard origin/master; else echo 'Cloning repository...'; git clone \"\$REPO_URL\" \"\$REPO_DIR\"; cd \"\$REPO_DIR\"; fi",
        "",
        "echo '=== Step 3: Stop existing container ==='",
        "docker stop video-inference || true",
        "docker rm video-inference || true",
        "",
        "echo '=== Step 4: Build new container ==='",
        "cd \"\$REPO_DIR/infra/container\"",
        "docker build -t video-inference:latest .",
        "",
        "echo '=== Step 5: Start new container with VIDEO_MODEL=\$MODEL ==='",
        "docker run -d --name video-inference --gpus all --restart unless-stopped -p 8000:8000 -e VIDEO_MODEL=\$MODEL -e HF_HOME=/app/hf_cache -e TRANSFORMERS_CACHE=/app/hf_cache -v /mnt/efs/hf_cache:/app/hf_cache:rw -v /mnt/efs/models:/app/models:rw -e AWS_DEFAULT_REGION=us-east-1 video-inference:latest",
        "",
        "echo '=== Step 6: Wait for container to start ==='",
        "sleep 15",
        "docker logs video-inference --tail 30",
        "",
        "echo ''",
        "echo 'Container rebuild initiated with VIDEO_MODEL=\$MODEL'",
        "echo 'Model loading may take 2-5 minutes. Monitor with: docker logs -f video-inference'"
    ]
}
EOF

echo "Sending rebuild command to GPU instance..."

COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --timeout-seconds 1800 \
    --parameters "file://$PARAMS_FILE" \
    --output text \
    --query 'Command.CommandId')

rm -f "$PARAMS_FILE"

echo "Command ID: $COMMAND_ID"
echo ""
echo "Waiting for command to complete (this may take 5-10 minutes for docker build)..."

# Wait for command to complete
for i in {1..120}; do
    STATUS=$(aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --query 'Status' \
        --output text 2>/dev/null || echo "Pending")

    if [ "$STATUS" = "Success" ]; then
        echo ""
        echo "Command completed successfully!"
        echo ""
        echo "=== Output ==="
        aws ssm get-command-invocation \
            --command-id "$COMMAND_ID" \
            --instance-id "$INSTANCE_ID" \
            --query 'StandardOutputContent' \
            --output text | tail -50
        break
    elif [ "$STATUS" = "Failed" ]; then
        echo ""
        echo "Command failed!"
        echo ""
        echo "=== Error Output ==="
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
echo "Container rebuild complete!"
echo ""
echo "Next steps:"
echo "  1. Check status: ./scripts/gpu-status.sh"
echo "  2. View logs: aws ssm start-session --target $INSTANCE_ID"
echo "              Then run: docker logs -f video-inference"
