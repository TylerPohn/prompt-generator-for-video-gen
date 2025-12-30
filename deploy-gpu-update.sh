#!/bin/bash
# Deploy GPU container updates to EC2 instance

set -e

INSTANCE_ID="i-0d37b84d08727a481"

echo "Deploying GPU container updates to $INSTANCE_ID..."

# Create a temporary script to run on the instance
cat > /tmp/gpu-update-commands.sh << 'EOF'
#!/bin/bash
set -e

echo "Stopping current container..."
docker stop $(docker ps -q --filter ancestor=video-inference) 2>/dev/null || echo "No container running"

echo "Building updated Docker image..."
cd /home/ubuntu/container
docker build -t video-inference .

echo "Starting updated container..."
docker run -d \
  --name video-inference \
  --gpus all \
  -p 8000:8000 \
  -e AWS_DEFAULT_REGION=us-east-1 \
  -e AWS_REGION=us-east-1 \
  video-inference

echo "Waiting for container to start..."
sleep 5

echo "Checking container status..."
docker ps | grep video-inference

echo "Testing health endpoint..."
curl -s http://localhost:8000/health | jq .

echo "✅ GPU container updated and running!"
EOF

# Copy the updated main.py to the instance
echo "Copying updated main.py to instance..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["mkdir -p /home/ubuntu/container/app","cat > /home/ubuntu/container/app/main.py"]' \
  --output text

# Note: The above approach won't work well for file transfer.
# Better approach: Use S3 as intermediary

echo "Uploading main.py to S3..."
aws s3 cp infra/container/app/main.py s3://aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale/tmp/main.py

echo "Downloading and deploying on instance..."
aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands="[
    'aws s3 cp s3://aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale/tmp/main.py /home/ubuntu/container/app/main.py',
    'chmod +x /tmp/gpu-update-commands.sh',
    'bash /tmp/gpu-update-commands.sh'
  ]" \
  --output json | jq -r '.Command.CommandId'

echo "✅ Deployment initiated. Check status with: aws ssm list-command-invocations --command-id <command-id> --details"
