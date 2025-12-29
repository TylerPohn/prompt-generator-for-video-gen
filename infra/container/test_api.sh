#!/bin/bash
# Test script for the video generation API

set -e

API_URL="${1:-http://localhost:8000}"

echo "========================================="
echo "Testing Video Generation API"
echo "API URL: ${API_URL}"
echo "========================================="

# Color output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo ""
echo "Test 1: Health Check"
echo "---------------------"
RESPONSE=$(curl -s "${API_URL}/health")
echo "${RESPONSE}" | jq .

if echo "${RESPONSE}" | jq -e '.status == "healthy"' > /dev/null; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    exit 1
fi

# Test 2: Root endpoint
echo ""
echo "Test 2: Root Endpoint"
echo "---------------------"
RESPONSE=$(curl -s "${API_URL}/")
echo "${RESPONSE}" | jq .

if echo "${RESPONSE}" | jq -e '.status == "running"' > /dev/null; then
    echo -e "${GREEN}✓ Root endpoint passed${NC}"
else
    echo -e "${RED}✗ Root endpoint failed${NC}"
    exit 1
fi

# Test 3: Generate video (requires AWS credentials and S3 bucket)
echo ""
echo "Test 3: Video Generation"
echo "------------------------"
echo "Note: This test requires valid AWS credentials and S3 bucket"
echo "Skipping actual generation test. Use the following curl command:"
echo ""
echo "curl -X POST ${API_URL}/generate \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{"
echo "    \"prompt\": \"A cat playing with a ball of yarn\","
echo "    \"job_id\": \"test-job-123\","
echo "    \"bucket_name\": \"your-bucket-name\","
echo "    \"steps\": 30,"
echo "    \"duration\": 3,"
echo "    \"fps\": 8,"
echo "    \"seed\": 42"
echo "  }'"

echo ""
echo "========================================="
echo -e "${GREEN}API tests completed${NC}"
echo "========================================="
