#!/bin/bash
# Build script for Wan2.2-T2V-A14B video generation container

set -e

echo "========================================="
echo "Building Wan2.2 Video Generator Container"
echo "========================================="

# Configuration
IMAGE_NAME="wan2-video-generator"
VERSION="${1:-latest}"
TAG="${IMAGE_NAME}:${VERSION}"

# Build the Docker image
echo ""
echo "Building Docker image: ${TAG}"
echo ""

docker build \
  --tag "${TAG}" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --progress=plain \
  .

echo ""
echo "========================================="
echo "Build complete: ${TAG}"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Test locally: docker-compose up"
echo "  2. Run container: docker run --gpus all -p 8000:8000 ${TAG}"
echo "  3. Push to registry: docker push ${TAG}"
echo ""
