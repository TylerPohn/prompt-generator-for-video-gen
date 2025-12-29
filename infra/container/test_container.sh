#!/bin/bash
# Test container build and dependency imports locally
set -e

cd "$(dirname "$0")"

echo "=== Building container ==="
docker build -t video-inference:test .

echo ""
echo "=== Testing dependency imports ==="
docker run --rm video-inference:test python /app/test_deps.py

echo ""
echo "=== Testing inference module import ==="
docker run --rm video-inference:test python -c "
from app.inference import VideoGenerator
print('✓ VideoGenerator class importable')
print('  (Model not loaded - would require GPU)')
"

echo ""
echo "=== Testing FastAPI app startup ==="
# Start container in background, test health endpoint, then stop
docker run -d --name video-test -p 8001:8000 video-inference:test
sleep 5

if curl -s http://localhost:8001/health | grep -q "healthy"; then
    echo "✓ Health endpoint responding"
else
    echo "❌ Health endpoint failed"
    docker logs video-test
    docker stop video-test && docker rm video-test
    exit 1
fi

docker stop video-test && docker rm video-test

echo ""
echo "✅ Container build and tests passed!"
