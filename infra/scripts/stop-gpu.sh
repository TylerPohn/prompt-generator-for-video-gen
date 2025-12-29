#!/bin/bash
# Stop the GPU inference instance by scaling down the ASG

set -e

ASG_NAME="AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2"

echo "Stopping GPU instance..."

# Get current instance ID before scaling down
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

# Scale down to 0
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name "$ASG_NAME" \
  --desired-capacity 0

if [ "$INSTANCE_ID" != "None" ] && [ -n "$INSTANCE_ID" ]; then
  echo "Terminating instance: $INSTANCE_ID"
  echo "Waiting for instance to terminate..."
  aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID" 2>/dev/null || true
fi

echo ""
echo "✅ GPU instance stopped (ASG scaled to 0)"
