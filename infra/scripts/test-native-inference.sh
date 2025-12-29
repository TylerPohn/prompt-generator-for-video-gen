#!/bin/bash
# End-to-end test of native GPU inference
set -e

API_ENDPOINT="https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod"

echo "=== Testing Native GPU Inference ==="
echo ""

# 1. Check GPU instance status
echo "1. Checking GPU instance..."
./scripts/gpu-status.sh

# 2. Submit a test job
echo ""
echo "2. Submitting test video generation..."
RESPONSE=$(curl -s -X POST "${API_ENDPOINT}/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A golden retriever playing fetch in a sunny park",
    "duration": 3,
    "steps": 30
  }')

JOB_ID=$(echo $RESPONSE | jq -r '.jobId')
echo "Job ID: $JOB_ID"

if [ "$JOB_ID" == "null" ] || [ -z "$JOB_ID" ]; then
  echo "❌ Failed to submit job"
  echo "Response: $RESPONSE"
  exit 1
fi

# 3. Poll for completion
echo ""
echo "3. Waiting for video generation..."
for i in {1..60}; do
  STATUS_RESPONSE=$(curl -s "${API_ENDPOINT}/status/${JOB_ID}")
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')

  echo "   Status: $STATUS"

  if [ "$STATUS" == "completed" ]; then
    VIDEO_URL=$(echo $STATUS_RESPONSE | jq -r '.videoUrl')
    echo ""
    echo "✅ Video generated successfully!"
    echo "   Video URL: $VIDEO_URL"
    break
  elif [ "$STATUS" == "failed" ]; then
    ERROR=$(echo $STATUS_RESPONSE | jq -r '.error')
    echo ""
    echo "❌ Generation failed: $ERROR"
    exit 1
  fi

  sleep 10
done

# 4. Verify video is accessible
echo ""
echo "4. Verifying video accessibility..."
if curl -s -I "$VIDEO_URL" | grep -q "200 OK"; then
  echo "✅ Video is accessible"
else
  echo "⚠️  Video URL returned non-200 status"
fi

# 5. Check GPU container logs for native inference
echo ""
echo "5. Checking inference logs..."
INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2" \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" \
  --output text)

aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters commands='["docker logs video-inference --tail 50"]' \
  --output text > /dev/null

echo "Run 'docker logs video-inference' on instance to see full inference logs"
echo ""
echo "=== Test Complete ==="
