#!/bin/bash
# Monitor for H100/A100 GPU availability in us-east-1
# Checks all AZs and attempts to launch when capacity becomes available
#
# Usage:
#   ./monitor-h100.sh           # Monitor H100 (p5.48xlarge) - default
#   ./monitor-h100.sh h100      # Monitor H100 (p5.48xlarge)
#   ./monitor-h100.sh a100      # Monitor A100 (p4d.24xlarge)
#   ./monitor-h100.sh a100-80   # Monitor A100 80GB (p4de.24xlarge)
#   ./monitor-h100.sh all       # Check availability of ALL GPU types

set -e

GPU_TYPE="${1:-h100}"
REGION="us-east-1"
CHECK_INTERVAL=60  # seconds between checks
ASG_NAME="AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2"

# Function to check spot pricing/availability for an instance type
check_instance_availability() {
    local instance_type="$1"
    local gpu_name="$2"

    # Check spot price history (indicates availability)
    spot_prices=$(aws ec2 describe-spot-price-history \
        --instance-types "$instance_type" \
        --product-descriptions "Linux/UNIX" \
        --start-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --region "$REGION" \
        --query 'SpotPriceHistory[*].[AvailabilityZone,SpotPrice]' \
        --output text 2>/dev/null | head -6)

    if [ -n "$spot_prices" ]; then
        echo "  $gpu_name ($instance_type):"
        echo "$spot_prices" | while read az price; do
            printf "    %-15s \$%s/hr\n" "$az" "$price"
        done
        return 0
    else
        echo "  $gpu_name ($instance_type): No spot availability"
        return 1
    fi
}

# Handle "all" flag - just check availability and exit
if [ "$GPU_TYPE" = "all" ] || [ "$GPU_TYPE" = "ALL" ]; then
    echo "=========================================="
    echo "  GPU Availability Check - All Types"
    echo "=========================================="
    echo "Region: $REGION"
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "Checking spot prices (indicates availability)..."
    echo ""

    check_instance_availability "p5.48xlarge" "H100 80GB"
    echo ""
    check_instance_availability "p4d.24xlarge" "A100 40GB x8"
    echo ""
    check_instance_availability "p4de.24xlarge" "A100 80GB x8"
    echo ""
    check_instance_availability "g5.48xlarge" "A10G 24GB x8"
    echo ""
    check_instance_availability "g5.16xlarge" "A10G 24GB x1"
    echo ""

    echo "=========================================="
    echo "Done. Use './monitor-h100.sh <type>' to monitor a specific GPU."
    exit 0
fi

# Set instance type based on GPU selection
case "$GPU_TYPE" in
    h100|H100)
        INSTANCE_TYPE="p5.48xlarge"
        GPU_NAME="H100 (p5.48xlarge)"
        GPU_MEMORY="80GB"
        ;;
    a100|A100)
        INSTANCE_TYPE="p4d.24xlarge"
        GPU_NAME="A100 40GB (p4d.24xlarge)"
        GPU_MEMORY="40GB x8"
        ;;
    a100-80|A100-80)
        INSTANCE_TYPE="p4de.24xlarge"
        GPU_NAME="A100 80GB (p4de.24xlarge)"
        GPU_MEMORY="80GB x8"
        ;;
    *)
        echo "Unknown GPU type: $GPU_TYPE"
        echo "Usage: $0 [h100|a100|a100-80|all]"
        exit 1
        ;;
esac

echo "=========================================="
echo "  $GPU_NAME Availability Monitor"
echo "=========================================="
echo "Instance Type: $INSTANCE_TYPE"
echo "GPU Memory: $GPU_MEMORY"
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

    echo "[$timestamp] Check #$check_count - Checking $INSTANCE_TYPE availability..."

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
            echo "  $GPU_NAME INSTANCE LAUNCHED!"
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
            echo "Monitor complete! $GPU_NAME is ready."
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
