#!/bin/bash

# Video Generation Script using Replicate API
# Usage: ./generate-video.sh "your prompt here"

set -e

# Load API key from .env.local
if [ -f .env.local ]; then
    export $(cat .env.local | grep VITE_REPLICATE_API_KEY | xargs)
    REPLICATE_API_KEY="${VITE_REPLICATE_API_KEY}"
else
    echo "Error: .env.local not found"
    exit 1
fi

# Configuration
MODEL="google/veo-3.1"
PROMPT="${1:-waves crashing dramatically against rocks}"
DURATION=4

echo "🎬 Generating video with prompt: \"$PROMPT\""
echo "📹 Model: $MODEL"
echo ""

# Create prediction
echo "📤 Creating prediction..."
RESPONSE=$(curl -s -X POST "https://api.replicate.com/v1/models/$MODEL/predictions" \
  -H "Authorization: Bearer $REPLICATE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"input\": {\"prompt\": \"$PROMPT\", \"duration\": $DURATION}}")

# Extract prediction ID
PREDICTION_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$PREDICTION_ID" ]; then
    echo "❌ Error: Failed to create prediction"
    echo "$RESPONSE"
    exit 1
fi

echo "✅ Prediction created: $PREDICTION_ID"
echo "⏳ Waiting for completion..."

# Poll for completion
MAX_ATTEMPTS=120  # 10 minutes with 5 second intervals
ATTEMPT=0
STATUS="starting"

while [ "$STATUS" != "succeeded" ] && [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    sleep 5
    ATTEMPT=$((ATTEMPT + 1))

    # Get prediction status
    RESPONSE=$(curl -s -H "Authorization: Bearer $REPLICATE_API_KEY" \
      "https://api.replicate.com/v1/predictions/$PREDICTION_ID")

    STATUS=$(echo $RESPONSE | grep -o '"status":"[^"]*' | cut -d'"' -f4)

    echo "   Status: $STATUS (attempt $ATTEMPT/$MAX_ATTEMPTS)"

    if [ "$STATUS" = "failed" ] || [ "$STATUS" = "canceled" ]; then
        echo "❌ Generation failed"
        echo "$RESPONSE"
        exit 1
    fi
done

if [ "$STATUS" != "succeeded" ]; then
    echo "❌ Timeout: Video generation took too long"
    exit 1
fi

# Extract video URL
VIDEO_URL=$(echo $RESPONSE | grep -o '"output":"[^"]*' | cut -d'"' -f4)

echo ""
echo "✅ Video generated successfully!"
echo "🎥 Video URL: $VIDEO_URL"
echo ""
echo "To download:"
echo "  curl -o video.mp4 \"$VIDEO_URL\""
echo ""

# Optional: Auto-download
read -p "Download now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    FILENAME="video_$(date +%Y%m%d_%H%M%S).mp4"
    echo "📥 Downloading to $FILENAME..."
    curl -o "$FILENAME" "$VIDEO_URL"
    echo "✅ Downloaded: $FILENAME"
fi
