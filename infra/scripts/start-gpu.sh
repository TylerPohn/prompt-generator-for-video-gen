#!/bin/bash
# Start the GPU inference instance by scaling up the ASG

set -e

ASG_NAME="AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2"
SSM_PARAM="/video-generation/gpu-endpoint"

echo "Starting GPU instance..."
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name "$ASG_NAME" \
  --desired-capacity 1

echo "Waiting for instance to launch..."
sleep 10

# Get instance info
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

if [ "$INSTANCE_ID" != "None" ] && [ -n "$INSTANCE_ID" ]; then
  echo "Instance launching: $INSTANCE_ID"

  # Wait for instance to be running
  echo "Waiting for instance to be running..."
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

  # Get private IP
  PRIVATE_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].PrivateIpAddress" \
    --output text)

  GPU_ENDPOINT="http://$PRIVATE_IP:8000"

  # Update SSM Parameter with the GPU endpoint
  echo "Updating SSM parameter with GPU endpoint..."
  aws ssm put-parameter \
    --name "$SSM_PARAM" \
    --value "$GPU_ENDPOINT" \
    --type String \
    --overwrite

  echo ""
  echo "✅ GPU instance started!"
  echo "   Instance ID: $INSTANCE_ID"
  echo "   Private IP:  $PRIVATE_IP"
  echo "   FastAPI URL: $GPU_ENDPOINT"
  echo "   SSM Param:   $SSM_PARAM = $GPU_ENDPOINT"
else
  echo "Instance is launching, check status with: ./scripts/gpu-status.sh"
fi
