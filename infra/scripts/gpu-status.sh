#!/bin/bash
# Check the status of the GPU inference instance

ASG_NAME="AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2"

echo "GPU Instance Status"
echo "==================="

# Get ASG info
DESIRED=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].DesiredCapacity" \
  --output text)

INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

echo "ASG Desired Capacity: $DESIRED"

if [ "$INSTANCE_ID" != "None" ] && [ -n "$INSTANCE_ID" ]; then
  # Get instance details
  INSTANCE_INFO=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].{State:State.Name,Type:InstanceType,PrivateIp:PrivateIpAddress,LaunchTime:LaunchTime}" \
    --output json)

  STATE=$(echo "$INSTANCE_INFO" | jq -r '.State')
  TYPE=$(echo "$INSTANCE_INFO" | jq -r '.Type')
  PRIVATE_IP=$(echo "$INSTANCE_INFO" | jq -r '.PrivateIp')
  LAUNCH_TIME=$(echo "$INSTANCE_INFO" | jq -r '.LaunchTime')

  echo ""
  echo "Instance ID:    $INSTANCE_ID"
  echo "State:          $STATE"
  echo "Type:           $TYPE"
  echo "Private IP:     $PRIVATE_IP"
  echo "Launch Time:    $LAUNCH_TIME"

  if [ "$STATE" == "running" ]; then
    echo ""
    echo "FastAPI URL: http://$PRIVATE_IP:8000"
    echo ""
    echo "To check if FastAPI is responding:"
    echo "  curl http://$PRIVATE_IP:8000/health"
  fi
else
  echo ""
  echo "No GPU instance running"
  echo ""
  echo "To start: ./scripts/start-gpu.sh"
fi
