#!/bin/bash

##############################################################################
# AI Video Infrastructure Deployment Script
# 
# This script automates the deployment of the AI video generation infrastructure
# including building and pushing Docker images, and deploying CDK stacks.
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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}AI Video Infrastructure Deployment${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Load environment variables from .env file
if [ -f "$INFRA_DIR/.env" ]; then
    echo -e "${GREEN}✓ Loading environment variables from .env${NC}"
    export $(cat "$INFRA_DIR/.env" | grep -v '^#' | xargs)
else
    echo -e "${RED}✗ Error: .env file not found in $INFRA_DIR${NC}"
    echo -e "${YELLOW}  Please create a .env file with required variables${NC}"
    echo -e "${YELLOW}  See README.md for details${NC}"
    exit 1
fi

# Validate required environment variables
echo -e "\n${BLUE}Validating environment variables...${NC}"
REQUIRED_VARS=("AWS_ACCOUNT_ID" "AWS_REGION" "AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    else
        # Mask sensitive values in output
        if [[ "$var" == *"KEY"* ]] || [[ "$var" == *"SECRET"* ]]; then
            echo -e "  ${var}: ${GREEN}[SET]${NC}"
        else
            echo -e "  ${var}: ${GREEN}${!var}${NC}"
        fi
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo -e "\n${RED}✗ Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "  - $var"
    done
    exit 1
fi

# Optional variables
ENVIRONMENT="${ENVIRONMENT:-dev}"
echo -e "  ENVIRONMENT: ${GREEN}${ENVIRONMENT}${NC}"

echo -e "${GREEN}✓ All required environment variables are set${NC}"

# Change to infrastructure directory
cd "$INFRA_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "\n${BLUE}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# Build TypeScript
echo -e "\n${BLUE}Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✓ TypeScript compiled${NC}"

# Check if Docker is running (for GPU container builds)
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        echo -e "\n${BLUE}Docker is running${NC}"
        
        # Check if GPU container Dockerfile exists
        GPU_CONTAINER_DIR="$INFRA_DIR/container"
        if [ -f "$GPU_CONTAINER_DIR/Dockerfile" ]; then
            echo -e "${BLUE}Building GPU inference Docker image...${NC}"
            
            # Get ECR repository URL (will be created by CDK if it doesn't exist)
            ECR_REPO_NAME="ai-video-gpu-inference"
            ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"
            
            # Build Docker image
            docker build -t "${ECR_REPO_NAME}:latest" "$GPU_CONTAINER_DIR"
            echo -e "${GREEN}✓ Docker image built${NC}"
            
            # Tag for ECR
            docker tag "${ECR_REPO_NAME}:latest" "${ECR_URI}:latest"
            echo -e "${GREEN}✓ Image tagged for ECR${NC}"
            
            # Login to ECR
            echo -e "${BLUE}Logging in to ECR...${NC}"
            aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
            
            # Create ECR repository if it doesn't exist
            if ! aws ecr describe-repositories --repository-names ${ECR_REPO_NAME} --region ${AWS_REGION} &> /dev/null; then
                echo -e "${YELLOW}Creating ECR repository...${NC}"
                aws ecr create-repository --repository-name ${ECR_REPO_NAME} --region ${AWS_REGION}
                echo -e "${GREEN}✓ ECR repository created${NC}"
            fi
            
            # Push to ECR
            echo -e "${BLUE}Pushing image to ECR...${NC}"
            docker push "${ECR_URI}:latest"
            echo -e "${GREEN}✓ Image pushed to ECR${NC}"
        else
            echo -e "${YELLOW}⚠ GPU container Dockerfile not found, skipping Docker build${NC}"
            echo -e "${YELLOW}  Location: $GPU_CONTAINER_DIR/Dockerfile${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Docker is installed but not running${NC}"
        echo -e "${YELLOW}  Skipping Docker image build${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Docker not installed, skipping Docker image build${NC}"
fi

# Synthesize CloudFormation templates
echo -e "\n${BLUE}Synthesizing CDK stacks...${NC}"
npx cdk synth
echo -e "${GREEN}✓ CloudFormation templates generated${NC}"

# Show what will be deployed
echo -e "\n${BLUE}Checking for infrastructure changes...${NC}"
npx cdk diff --all || true

# Confirm deployment
echo -e "\n${YELLOW}Ready to deploy infrastructure to AWS${NC}"
echo -e "  Account: ${AWS_ACCOUNT_ID}"
echo -e "  Region: ${AWS_REGION}"
echo -e "  Environment: ${ENVIRONMENT}"
read -p "Continue with deployment? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

# Deploy CDK stacks
echo -e "\n${BLUE}Deploying CDK stacks...${NC}"
echo -e "${YELLOW}This may take 10-15 minutes...${NC}\n"

npx cdk deploy --all --require-approval never

# Check deployment status
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    # Get stack outputs
    echo -e "${BLUE}Retrieving stack outputs...${NC}\n"
    
    # API Gateway endpoint
    API_ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name "AiVideo-${ENVIRONMENT}-VideoApi" \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
        --output text \
        --region ${AWS_REGION} 2>/dev/null)
    
    if [ -n "$API_ENDPOINT" ]; then
        echo -e "${GREEN}API Endpoint:${NC}"
        echo -e "  ${API_ENDPOINT}"
        echo -e "\n${BLUE}Test the API:${NC}"
        echo -e "  curl -X POST ${API_ENDPOINT}generate \\"
        echo -e "    -H 'Content-Type: application/json' \\"
        echo -e "    -d '{\"prompt\": \"A beautiful sunset over mountains\"}'"
    fi
    
    # Get other important outputs
    echo -e "\n${BLUE}Stack Resources:${NC}"
    aws cloudformation describe-stacks \
        --stack-name "AiVideo-${ENVIRONMENT}-VideoApi" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table \
        --region ${AWS_REGION} 2>/dev/null || echo "  (Outputs not available)"
    
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo -e "  1. Test the API endpoints (see examples/test-api.sh)"
    echo -e "  2. Monitor logs in CloudWatch"
    echo -e "  3. Set up billing alarms (see README.md)"
    echo -e "  4. Scale GPU instances as needed"
    
    echo -e "\n${BLUE}Useful commands:${NC}"
    echo -e "  View logs:     aws logs tail /aws/lambda/AiVideo-${ENVIRONMENT}-SubmitJobFunction --follow"
    echo -e "  Check stacks:  aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE"
    echo -e "  Shutdown:      ./scripts/shutdown.sh"
    
else
    echo -e "\n${RED}========================================${NC}"
    echo -e "${RED}✗ Deployment failed${NC}"
    echo -e "${RED}========================================${NC}\n"
    echo -e "${YELLOW}Check the error messages above for details${NC}"
    echo -e "${YELLOW}Common issues:${NC}"
    echo -e "  - Insufficient IAM permissions"
    echo -e "  - Resource limits exceeded"
    echo -e "  - Invalid VPC/subnet configuration"
    echo -e "\n${YELLOW}For help, see:${NC}"
    echo -e "  - README.md troubleshooting section"
    echo -e "  - CloudFormation console for detailed errors"
    exit 1
fi
