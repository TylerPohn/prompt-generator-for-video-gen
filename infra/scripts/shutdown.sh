#!/bin/bash

##############################################################################
# AI Video Infrastructure Shutdown Script
# 
# This script helps manage costs by scaling down GPU instances or
# completely destroying the infrastructure.
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INFRA_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Parse command line arguments
DESTROY=false
if [ "$1" == "--destroy" ] || [ "$1" == "-d" ]; then
    DESTROY=true
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AI Video Infrastructure Shutdown${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Load environment variables
if [ -f "$INFRA_DIR/.env" ]; then
    export $(cat "$INFRA_DIR/.env" | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}⚠ .env file not found, using default values${NC}"
fi

AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-dev}"

echo -e "${BLUE}Configuration:${NC}"
echo -e "  Region: ${AWS_REGION}"
echo -e "  Environment: ${ENVIRONMENT}\n"

if [ "$DESTROY" = true ]; then
    # Complete infrastructure destruction
    echo -e "${RED}WARNING: Complete Infrastructure Destruction${NC}"
    echo -e "${RED}==========================================${NC}\n"
    echo -e "${YELLOW}This will DELETE ALL resources including:${NC}"
    echo -e "  - All generated videos in S3"
    echo -e "  - Job history in DynamoDB"
    echo -e "  - API Gateway endpoints"
    echo -e "  - Lambda functions"
    echo -e "  - GPU instances and containers"
    echo -e "  - All other infrastructure\n"
    echo -e "${RED}THIS CANNOT BE UNDONE!${NC}\n"
    
    read -p "Type 'DELETE' to confirm complete destruction: " -r
    echo
    
    if [ "$REPLY" != "DELETE" ]; then
        echo -e "${YELLOW}Destruction cancelled${NC}"
        exit 0
    fi
    
    echo -e "${BLUE}Destroying all CDK stacks...${NC}\n"
    
    cd "$INFRA_DIR"
    
    # Destroy stacks in reverse dependency order
    echo -e "${BLUE}Destroying Video API Stack...${NC}"
    npx cdk destroy "AiVideo-${ENVIRONMENT}-VideoApi" --force || echo -e "${YELLOW}⚠ Stack may not exist${NC}"
    
    echo -e "\n${BLUE}Destroying GPU Inference Stack...${NC}"
    npx cdk destroy "AiVideo-${ENVIRONMENT}-GpuInference" --force || echo -e "${YELLOW}⚠ Stack may not exist${NC}"
    
    echo -e "\n${BLUE}Destroying Storage Stack...${NC}"
    npx cdk destroy "AiVideo-${ENVIRONMENT}-Storage" --force || echo -e "${YELLOW}⚠ Stack may not exist${NC}"
    
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Infrastructure destroyed${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    echo -e "${YELLOW}Post-cleanup tasks:${NC}"
    echo -e "  1. Check for any remaining S3 buckets (if retention was enabled)"
    echo -e "  2. Review ECR repositories for Docker images"
    echo -e "  3. Check CloudWatch Logs for log groups"
    echo -e "  4. Verify no resources remain in CloudFormation console\n"
    
    echo -e "${BLUE}Commands to check for remaining resources:${NC}"
    echo -e "  aws s3 ls | grep ai-video"
    echo -e "  aws ecr describe-repositories | grep ai-video"
    echo -e "  aws logs describe-log-groups --log-group-name-prefix /aws/lambda/AiVideo"
    
else
    # Scale down GPU instances (cost-saving mode)
    echo -e "${BLUE}Scaling Down GPU Instances${NC}"
    echo -e "${BLUE}=========================${NC}\n"
    echo -e "${YELLOW}This will scale GPU Auto Scaling Group to 0 instances${NC}"
    echo -e "${YELLOW}Infrastructure will remain deployed (API, Lambda, DynamoDB)${NC}"
    echo -e "${YELLOW}You can scale back up when needed${NC}\n"
    
    read -p "Continue with scaling down? (y/N) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Shutdown cancelled${NC}"
        exit 0
    fi
    
    # Find Auto Scaling Group
    ASG_NAME="AiVideo-${ENVIRONMENT}-GpuInference-ASG"
    
    echo -e "${BLUE}Looking for Auto Scaling Group: ${ASG_NAME}${NC}"
    
    if aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$ASG_NAME" \
        --region "$AWS_REGION" &> /dev/null; then
        
        # Get current capacity
        CURRENT_CAPACITY=$(aws autoscaling describe-auto-scaling-groups \
            --auto-scaling-group-names "$ASG_NAME" \
            --region "$AWS_REGION" \
            --query 'AutoScalingGroups[0].DesiredCapacity' \
            --output text)
        
        echo -e "  Current capacity: ${CURRENT_CAPACITY}"
        
        if [ "$CURRENT_CAPACITY" -eq 0 ]; then
            echo -e "${GREEN}✓ Auto Scaling Group already scaled to 0${NC}"
        else
            echo -e "${BLUE}Scaling Auto Scaling Group to 0...${NC}"
            
            aws autoscaling set-desired-capacity \
                --auto-scaling-group-name "$ASG_NAME" \
                --desired-capacity 0 \
                --region "$AWS_REGION"
            
            echo -e "${GREEN}✓ Auto Scaling Group scaled to 0${NC}"
            echo -e "${YELLOW}  GPU instances will terminate shortly${NC}"
        fi
        
        # Also scale ECS service to 0 if it exists
        CLUSTER_NAME="ai-video-gpu-cluster"
        SERVICE_NAME="ai-video-inference-service"
        
        if aws ecs describe-services \
            --cluster "$CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --region "$AWS_REGION" &> /dev/null; then
            
            echo -e "\n${BLUE}Scaling ECS service to 0 tasks...${NC}"
            
            aws ecs update-service \
                --cluster "$CLUSTER_NAME" \
                --service "$SERVICE_NAME" \
                --desired-count 0 \
                --region "$AWS_REGION" > /dev/null
            
            echo -e "${GREEN}✓ ECS service scaled to 0${NC}"
        fi
        
    else
        echo -e "${YELLOW}⚠ Auto Scaling Group not found${NC}"
        echo -e "${YELLOW}  It may not be deployed yet or may have a different name${NC}"
        echo -e "${YELLOW}  Check CloudFormation console for GPU Inference stack${NC}"
    fi
    
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ GPU instances scaled down${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    echo -e "${BLUE}Current status:${NC}"
    echo -e "  ${GREEN}✓${NC} GPU instances: Scaled to 0 (no charges)"
    echo -e "  ${GREEN}✓${NC} API Gateway: Still running (minimal charges)"
    echo -e "  ${GREEN}✓${NC} Lambda: Still available (pay per use)"
    echo -e "  ${GREEN}✓${NC} DynamoDB: Still available (on-demand pricing)"
    echo -e "  ${GREEN}✓${NC} S3: Still available (storage only)\n"
    
    echo -e "${BLUE}Cost impact:${NC}"
    echo -e "  Saved: ~$550/month (g5.xlarge 24/7)"
    echo -e "  Remaining: ~$70/month (serverless components)\n"
    
    echo -e "${YELLOW}To scale back up:${NC}"
    echo -e "  aws autoscaling set-desired-capacity \\"
    echo -e "    --auto-scaling-group-name $ASG_NAME \\"
    echo -e "    --desired-capacity 1 \\"
    echo -e "    --region $AWS_REGION\n"
    
    echo -e "${YELLOW}To completely destroy infrastructure:${NC}"
    echo -e "  ./scripts/shutdown.sh --destroy\n"
fi

echo -e "${BLUE}Useful monitoring commands:${NC}"
echo -e "  Check ASG status:  aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG_NAME --region $AWS_REGION"
echo -e "  Check ECS tasks:   aws ecs list-tasks --cluster ai-video-gpu-cluster --region $AWS_REGION"
echo -e "  Check API status:  aws apigateway get-rest-apis --query 'items[?name==\`Video Generation API\`]' --region $AWS_REGION"
echo -e "  View costs:        https://console.aws.amazon.com/billing/home?region=$AWS_REGION#/bills"
