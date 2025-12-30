#!/bin/bash
# Monitor for H100 (p5.4xlarge) availability in us-east-1
# Checks all AZs and attempts to launch when capacity becomes available

set -e

INSTANCE_TYPE="p5.4xlarge"
REGION="us-east-1"
CHECK_INTERVAL=60  # seconds between checks
ASG_NAME="AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2"

echo "=========================================="
echo "  H100 (p5.4xlarge) Availability Monitor"
echo "=========================================="
echo "Region: $REGION"
echo "Check interval: ${CHECK_INTERVAL}s"
echo "ASG: $ASG_NAME"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo ""

check_count=0

while true; do
    check_count=$((check_count + 1))
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$timestamp] Check #$check_count - Checking p5.4xlarge availability..."

    # Check latest ASG activity
    latest_activity=$(aws autoscaling describe-scaling-activities \
        --auto-scaling-group-name "$ASG_NAME" \
        --max-items 1 \
        --query 'Activities[0].[StatusCode,Description]' \
        --output text 2>/dev/null || echo "Unknown Unknown")

    status=$(echo "$latest_activity" | awk '{print $1}')

    if [ "$status" = "Successful" ]; then
        echo "[$timestamp] ✅ SUCCESS! Instance launched!"

        # Get instance details
        instance_info=$(aws autoscaling describe-auto-scaling-groups \
            --auto-scaling-group-names "$ASG_NAME" \
            --query 'AutoScalingGroups[0].Instances[0].[InstanceId,AvailabilityZone]' \
            --output text 2>/dev/null)

        instance_id=$(echo "$instance_info" | awk '{print $1}')
        az=$(echo "$instance_info" | awk '{print $2}')

        if [ -n "$instance_id" ] && [ "$instance_id" != "None" ]; then
            echo ""
            echo "=========================================="
            echo "  H100 INSTANCE LAUNCHED!"
            echo "=========================================="
            echo "Instance ID: $instance_id"
            echo "AZ: $az"
            echo ""
            echo "Waiting for instance to be running..."
            aws ec2 wait instance-running --instance-ids "$instance_id"

            # Get private IP
            private_ip=$(aws ec2 describe-instances \
                --instance-ids "$instance_id" \
                --query 'Reservations[0].Instances[0].PrivateIpAddress' \
                --output text)

            echo "Private IP: $private_ip"
            echo ""
            echo "Updating SSM parameter..."
            aws ssm put-parameter \
                --name /video-generation/gpu-endpoint \
                --value "http://${private_ip}:8000" \
                --type String \
                --overwrite

            echo "✅ SSM updated to http://${private_ip}:8000"
            echo ""
            echo "Monitor complete! H100 is ready."
            exit 0
        fi
    elif [ "$status" = "Failed" ]; then
        # Extract which AZ failed
        failed_az=$(echo "$latest_activity" | grep -oP 'us-east-1[a-f]' | head -1 || echo "unknown")
        echo "[$timestamp] ❌ Failed in $failed_az - capacity unavailable"
    elif [ "$status" = "InProgress" ]; then
        echo "[$timestamp] ⏳ Launch in progress..."
    else
        echo "[$timestamp] Status: $status"
    fi

    # Check current ASG desired capacity
    desired=$(aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$ASG_NAME" \
        --query 'AutoScalingGroups[0].DesiredCapacity' \
        --output text 2>/dev/null)

    if [ "$desired" = "0" ]; then
        echo "[$timestamp] ⚠️  ASG desired capacity is 0. Setting to 1..."
        aws autoscaling set-desired-capacity \
            --auto-scaling-group-name "$ASG_NAME" \
            --desired-capacity 1
        echo "[$timestamp] ASG desired capacity set to 1"
    fi

    sleep $CHECK_INTERVAL
done
