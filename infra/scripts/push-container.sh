#!/bin/bash
# Build and push inference container to ECR
set -e

REGION="us-east-1"
ACCOUNT_ID="971422717446"
ECR_REPO="video-inference"
IMAGE_TAG="${1:-latest}"

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

cd "$(dirname "$0")/../container"

echo "=== Logging into ECR ==="
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

echo "=== Building container for linux/amd64 ==="
docker build --platform linux/amd64 -t ${ECR_REPO}:${IMAGE_TAG} .

echo "=== Tagging for ECR ==="
docker tag ${ECR_REPO}:${IMAGE_TAG} ${ECR_URI}:${IMAGE_TAG}

echo "=== Pushing to ECR ==="
docker push ${ECR_URI}:${IMAGE_TAG}

echo ""
echo "✅ Container pushed to: ${ECR_URI}:${IMAGE_TAG}"
