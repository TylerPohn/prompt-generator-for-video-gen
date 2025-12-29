#!/bin/bash

##############################################################################
# AI Video API Testing Script
# 
# This script demonstrates how to interact with the Video Generation API
# including submitting jobs and checking their status.
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
echo -e "${BLUE}AI Video API Testing Suite${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Load environment variables
if [ -f "$INFRA_DIR/.env" ]; then
    export $(cat "$INFRA_DIR/.env" | grep -v '^#' | xargs)
fi

AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-dev}"

# Get API endpoint from CloudFormation
echo -e "${BLUE}Retrieving API endpoint...${NC}"
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "AiVideo-${ENVIRONMENT}-VideoApi" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text \
    --region ${AWS_REGION} 2>/dev/null)

if [ -z "$API_ENDPOINT" ]; then
    echo -e "${RED}✗ Could not retrieve API endpoint${NC}"
    echo -e "${YELLOW}  Make sure the VideoApi stack is deployed${NC}"
    echo -e "${YELLOW}  Stack name: AiVideo-${ENVIRONMENT}-VideoApi${NC}"
    exit 1
fi

echo -e "${GREEN}✓ API Endpoint: ${API_ENDPOINT}${NC}\n"

# Check if jq is installed for JSON parsing
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠ jq is not installed - responses will not be formatted${NC}"
    echo -e "${YELLOW}  Install with: brew install jq (macOS) or apt-get install jq (Ubuntu)${NC}\n"
    JQ_INSTALLED=false
else
    JQ_INSTALLED=true
fi

##############################################################################
# Test 1: Submit a video generation job
##############################################################################

echo -e "${BLUE}Test 1: Submit Video Generation Job${NC}"
echo -e "${BLUE}====================================${NC}\n"

PROMPT="A serene lake surrounded by mountains at sunset, cinematic lighting, 4K quality"

echo -e "${YELLOW}Request:${NC}"
echo -e "  POST ${API_ENDPOINT}generate"
echo -e "  Prompt: $PROMPT\n"

RESPONSE=$(curl -s -X POST "${API_ENDPOINT}generate" \
    -H "Content-Type: application/json" \
    -d "{
        \"prompt\": \"$PROMPT\",
        \"parameters\": {
            \"duration\": 5,
            \"aspectRatio\": \"16:9\",
            \"style\": \"cinematic\"
        }
    }")

echo -e "${YELLOW}Response:${NC}"
if [ "$JQ_INSTALLED" = true ]; then
    echo "$RESPONSE" | jq '.'
    
    # Extract job ID
    JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId')
    STATUS=$(echo "$RESPONSE" | jq -r '.status')
else
    echo "$RESPONSE"
    
    # Try to extract job ID without jq (basic grep/sed)
    JOB_ID=$(echo "$RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
    STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$JOB_ID" ] || [ "$JOB_ID" == "null" ]; then
    echo -e "\n${RED}✗ Failed to submit job${NC}"
    exit 1
fi

echo -e "\n${GREEN}✓ Job submitted successfully${NC}"
echo -e "  Job ID: ${JOB_ID}"
echo -e "  Status: ${STATUS}\n"

##############################################################################
# Test 2: Check job status immediately
##############################################################################

echo -e "${BLUE}Test 2: Check Job Status (Immediate)${NC}"
echo -e "${BLUE}=====================================${NC}\n"

sleep 2  # Wait a moment for the job to be processed

echo -e "${YELLOW}Request:${NC}"
echo -e "  GET ${API_ENDPOINT}status/${JOB_ID}\n"

RESPONSE=$(curl -s -X GET "${API_ENDPOINT}status/${JOB_ID}")

echo -e "${YELLOW}Response:${NC}"
if [ "$JQ_INSTALLED" = true ]; then
    echo "$RESPONSE" | jq '.'
    STATUS=$(echo "$RESPONSE" | jq -r '.status')
else
    echo "$RESPONSE"
    STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
fi

echo -e "\n${GREEN}✓ Job status retrieved${NC}"
echo -e "  Current status: ${STATUS}\n"

##############################################################################
# Test 3: Poll for completion (optional, commented out by default)
##############################################################################

echo -e "${BLUE}Test 3: Poll for Completion${NC}"
echo -e "${BLUE}===========================${NC}\n"

echo -e "${YELLOW}Polling every 10 seconds for up to 5 minutes...${NC}"
echo -e "${YELLOW}(Press Ctrl+C to stop polling)${NC}\n"

MAX_ATTEMPTS=30  # 5 minutes with 10 second intervals
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    
    RESPONSE=$(curl -s -X GET "${API_ENDPOINT}status/${JOB_ID}")
    
    if [ "$JQ_INSTALLED" = true ]; then
        STATUS=$(echo "$RESPONSE" | jq -r '.status')
        VIDEO_URL=$(echo "$RESPONSE" | jq -r '.videoUrl // empty')
        ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
    else
        STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        VIDEO_URL=$(echo "$RESPONSE" | grep -o '"videoUrl":"[^"]*"' | cut -d'"' -f4)
        ERROR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    fi
    
    echo -e "[Attempt $ATTEMPT/$MAX_ATTEMPTS] Status: ${STATUS}"
    
    if [ "$STATUS" == "COMPLETED" ]; then
        echo -e "\n${GREEN}========================================${NC}"
        echo -e "${GREEN}✓ Video generation completed!${NC}"
        echo -e "${GREEN}========================================${NC}\n"
        
        if [ "$JQ_INSTALLED" = true ]; then
            echo -e "${YELLOW}Full response:${NC}"
            echo "$RESPONSE" | jq '.'
        fi
        
        if [ -n "$VIDEO_URL" ] && [ "$VIDEO_URL" != "null" ]; then
            echo -e "\n${GREEN}Video URL:${NC}"
            echo -e "  $VIDEO_URL\n"
            
            echo -e "${BLUE}Download video:${NC}"
            echo -e "  curl -o video.mp4 \"$VIDEO_URL\"\n"
        fi
        
        break
    elif [ "$STATUS" == "FAILED" ]; then
        echo -e "\n${RED}========================================${NC}"
        echo -e "${RED}✗ Video generation failed${NC}"
        echo -e "${RED}========================================${NC}\n"
        
        if [ -n "$ERROR" ] && [ "$ERROR" != "null" ]; then
            echo -e "${RED}Error:${NC} $ERROR\n"
        fi
        
        if [ "$JQ_INSTALLED" = true ]; then
            echo -e "${YELLOW}Full response:${NC}"
            echo "$RESPONSE" | jq '.'
        fi
        
        exit 1
    fi
    
    if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
        sleep 10
    fi
done

if [ "$STATUS" != "COMPLETED" ] && [ "$STATUS" != "FAILED" ]; then
    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}⚠ Polling timeout reached${NC}"
    echo -e "${YELLOW}========================================${NC}\n"
    echo -e "${YELLOW}Job is still processing (status: ${STATUS})${NC}"
    echo -e "${YELLOW}Continue checking manually:${NC}"
    echo -e "  curl -X GET ${API_ENDPOINT}status/${JOB_ID} | jq '.'\n"
fi

##############################################################################
# Test 4: Additional test prompts
##############################################################################

echo -e "${BLUE}Test 4: Additional Test Prompts${NC}"
echo -e "${BLUE}================================${NC}\n"

echo -e "${YELLOW}Here are some additional prompts to test:${NC}\n"

TEST_PROMPTS=(
    "A futuristic city at night with neon lights and flying cars"
    "Ocean waves crashing on a beach during golden hour"
    "Northern lights dancing over a snowy forest"
    "A time-lapse of clouds moving over a desert landscape"
    "Abstract geometric shapes morphing and transforming"
)

for i in "${!TEST_PROMPTS[@]}"; do
    echo -e "${BLUE}[$((i+1))] ${TEST_PROMPTS[$i]}${NC}"
done

echo -e "\n${YELLOW}To test these prompts:${NC}"
echo -e "  curl -X POST ${API_ENDPOINT}generate \\"
echo -e "    -H 'Content-Type: application/json' \\"
echo -e "    -d '{\"prompt\": \"YOUR_PROMPT_HERE\"}'\n"

##############################################################################
# Summary and useful commands
##############################################################################

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Complete${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${YELLOW}Useful Commands:${NC}\n"

echo -e "${BLUE}Submit a new job:${NC}"
echo -e "  curl -X POST ${API_ENDPOINT}generate \\"
echo -e "    -H 'Content-Type: application/json' \\"
echo -e "    -d '{\"prompt\": \"Your prompt here\"}' | jq '.'\n"

echo -e "${BLUE}Check job status:${NC}"
echo -e "  curl -X GET ${API_ENDPOINT}status/JOB_ID | jq '.'\n"

echo -e "${BLUE}List all jobs in DynamoDB:${NC}"
echo -e "  aws dynamodb scan --table-name video-jobs --limit 10 --region ${AWS_REGION}\n"

echo -e "${BLUE}Check SQS queue depth:${NC}"
echo -e "  aws sqs get-queue-attributes \\"
echo -e "    --queue-url \$(aws sqs get-queue-url --queue-name video-generation-queue --region ${AWS_REGION} --query 'QueueUrl' --output text) \\"
echo -e "    --attribute-names ApproximateNumberOfMessages --region ${AWS_REGION}\n"

echo -e "${BLUE}View Lambda logs:${NC}"
echo -e "  aws logs tail /aws/lambda/AiVideo-${ENVIRONMENT}-SubmitJobFunction --follow --region ${AWS_REGION}\n"

echo -e "${GREEN}Happy testing!${NC}\n"
