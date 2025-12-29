#!/bin/bash
# Script to rebuild Docker container on GPU instance with memory optimizations
set -e

INSTANCE_ID="${1:-i-026929c584bc61c87}"
REPO_URL="https://github.com/TylerPohn/prompt-generator-for-video-gen.git"
REPO_DIR="/home/ec2-user/AI-video"

echo "=== Rebuilding container on GPU instance ==="
echo "Instance ID: $INSTANCE_ID"

# Create script to run on GPU instance
SCRIPT=$(cat <<'EOF'
#!/bin/bash
set -e

REPO_URL="https://github.com/TylerPohn/prompt-generator-for-video-gen.git"
REPO_DIR="/home/ec2-user/AI-video"

echo "=== Step 1: Install git if not present ==="
if ! command -v git &> /dev/null; then
    echo "Installing git..."
    sudo yum install -y git
fi

echo "=== Step 2: Clone/Update Repository ==="
if [ -d "$REPO_DIR" ]; then
    echo "Repository exists, pulling latest changes..."
    cd "$REPO_DIR"
    git pull origin master
else
    echo "Cloning repository..."
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
fi

echo "=== Step 3: Stop existing container ==="
sudo docker stop video-inference || true
sudo docker rm video-inference || true

echo "=== Step 4: Build new container ==="
cd "$REPO_DIR/infra/container"
sudo docker build -t video-inference:latest .

echo "=== Step 5: Start new container ==="
sudo docker run -d \
  --name video-inference \
  --gpus all \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /opt/ml/models:/app/models \
  -v /opt/ml/hf_cache:/app/hf_cache \
  video-inference:latest

echo "=== Step 6: Wait for container to be ready ==="
sleep 10
sudo docker logs video-inference --tail 50

echo ""
echo "✅ Container rebuilt and running!"
echo "Check logs with: sudo docker logs -f video-inference"
EOF
)

# Send command to GPU instance via SSM
echo "Sending rebuild command to GPU instance..."
echo "$SCRIPT" > /tmp/rebuild-script.sh

aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "commands=[\"$(cat /tmp/rebuild-script.sh | sed 's/"/\\"/g')\"]" \
  --output text \
  --query 'Command.CommandId' > /tmp/command-id.txt

COMMAND_ID=$(cat /tmp/command-id.txt)
echo "Command ID: $COMMAND_ID"
echo ""
echo "Waiting for command to complete (this may take 5-10 minutes)..."

# Wait for command to complete
while true; do
    STATUS=$(aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" \
        --instance-id "$INSTANCE_ID" \
        --query 'Status' \
        --output text 2>/dev/null || echo "Pending")

    echo "Status: $STATUS"

    if [ "$STATUS" = "Success" ]; then
        echo ""
        echo "✅ Command completed successfully!"
        echo ""
        echo "=== Output ==="
        aws ssm get-command-invocation \
            --command-id "$COMMAND_ID" \
            --instance-id "$INSTANCE_ID" \
            --query 'StandardOutputContent' \
            --output text
        break
    elif [ "$STATUS" = "Failed" ]; then
        echo ""
        echo "❌ Command failed!"
        echo ""
        echo "=== Error Output ==="
        aws ssm get-command-invocation \
            --command-id "$COMMAND_ID" \
            --instance-id "$INSTANCE_ID" \
            --query 'StandardErrorContent' \
            --output text
        exit 1
    fi

    sleep 10
done

rm /tmp/rebuild-script.sh /tmp/command-id.txt

echo ""
echo "✅ Container rebuild complete!"
echo ""
echo "Next steps:"
echo "  1. Test generation: ./scripts/test-native-inference.sh"
echo "  2. View logs: aws ssm start-session --target $INSTANCE_ID"
echo "              Then run: sudo docker logs -f video-inference"
