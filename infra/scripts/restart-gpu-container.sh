#!/bin/bash
# Restart the GPU container on EC2 instance (without rebuilding)

set -e

INSTANCE_ID="i-0d37b84d08727a481"

echo "Restarting GPU container on $INSTANCE_ID..."

# Restart the container via SSM
COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "echo Restarting video-inference container...",
    "docker restart video-inference",
    "echo Waiting for container to be ready...",
    "sleep 5",
    "echo Container status:",
    "docker ps | grep video-inference",
    "echo Testing health endpoint...",
    "curl -s http://localhost:8000/health | jq . || echo Health check failed"
  ]' \
  --output text \
  --query 'Command.CommandId')

echo "✅ Restart command sent: $COMMAND_ID"
echo ""
echo "Waiting for command to complete..."
sleep 10

# Get command output
aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query 'StandardOutputContent' \
  --output text

echo ""
echo "✅ Container restarted. Check logs with:"
echo "   aws ssm start-session --target $INSTANCE_ID"
echo "   sudo docker logs -f video-inference"
