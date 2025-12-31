#!/bin/bash
# Auto-generate I2V videos by submitting jobs to the API
# Submits a single job and polls until complete, then exits
#
# Usage: ./autogen-i2v.sh [options]
#   -p, --prompt TEXT      Prompt text (default: "broly powers up")
#   -i, --image URL        S3 URL of input image (required, or use default)
#   -d, --duration SECS    Duration in seconds (default: 1)
#   -w, --width PIXELS     Width (default: 512)
#   -h, --height PIXELS    Height (default: 288)
#   -s, --steps NUM        Inference steps (default: 30)
#   -g, --guidance FLOAT   Guidance scale (default: 6.0)
#   --fps NUM              Frames per second (default: 15)
#   --seed NUM             Random seed (optional)
#   --help                 Show this help message

set -e

# Defaults from user's example
PROMPT="broly powers up"
IMAGE_URL="s3://aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale/inputs/33459e9f-9e6e-412b-8965-04aa05819842.jpeg"
DURATION=1
WIDTH=512
HEIGHT=288
STEPS=30
GUIDANCE=6.0
FPS=15
SEED=""

# API endpoint
API_ENDPOINT="${API_ENDPOINT:-https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod}"
BUCKET="${BUCKET:-aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--prompt)
            PROMPT="$2"
            shift 2
            ;;
        -i|--image)
            IMAGE_URL="$2"
            shift 2
            ;;
        -d|--duration)
            DURATION="$2"
            shift 2
            ;;
        -w|--width)
            WIDTH="$2"
            shift 2
            ;;
        -h|--height)
            HEIGHT="$2"
            shift 2
            ;;
        -s|--steps)
            STEPS="$2"
            shift 2
            ;;
        -g|--guidance)
            GUIDANCE="$2"
            shift 2
            ;;
        --fps)
            FPS="$2"
            shift 2
            ;;
        --seed)
            SEED="$2"
            shift 2
            ;;
        --help)
            head -20 "$0" | tail -17
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=== I2V Auto Generation ==="
echo "Prompt: $PROMPT"
echo "Image: $IMAGE_URL"
echo "Duration: ${DURATION}s @ ${FPS}fps"
echo "Resolution: ${WIDTH}x${HEIGHT}"
echo "Steps: $STEPS, Guidance: $GUIDANCE"
echo ""

# Build JSON payload
JOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
SEED_JSON=""
if [[ -n "$SEED" ]]; then
    SEED_JSON=", \"seed\": $SEED"
fi

PAYLOAD=$(cat <<EOF
{
  "model": "hunyuan-video-15-i2v",
  "prompt": "$PROMPT",
  "job_id": "$JOB_ID",
  "bucket_name": "$BUCKET",
  "image_url": "$IMAGE_URL",
  "duration": $DURATION,
  "width": $WIDTH,
  "height": $HEIGHT,
  "steps": $STEPS,
  "guidance_scale": $GUIDANCE,
  "fps": $FPS$SEED_JSON
}
EOF
)

# Helper to extract JSON value (no jq dependency)
json_val() {
    echo "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed "s/\"$2\"[[:space:]]*:[[:space:]]*\"//" | sed 's/"$//' | head -1
}

echo "Submitting job: $JOB_ID"
RESPONSE=$(curl -s -X POST "${API_ENDPOINT}/generate" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

STATUS=$(json_val "$RESPONSE" "status")
if [[ -z "$STATUS" ]]; then
    STATUS=$(json_val "$RESPONSE" "detail")
fi

if [[ "$STATUS" == "accepted" ]]; then
    echo "Job accepted, polling for completion..."
else
    echo "Failed to submit job: $RESPONSE"
    exit 1
fi

# Poll for completion
MAX_POLLS=120  # 10 minutes at 5s intervals
POLL_INTERVAL=5

for i in $(seq 1 $MAX_POLLS); do
    sleep $POLL_INTERVAL

    STATUS_RESPONSE=$(curl -s "${API_ENDPOINT}/status/${JOB_ID}")
    STATUS=$(json_val "$STATUS_RESPONSE" "status")

    case $STATUS in
        completed)
            VIDEO_URL=$(json_val "$STATUS_RESPONSE" "videoUrl")
            echo ""
            echo "Video generated successfully!"
            echo "URL: $VIDEO_URL"
            exit 0
            ;;
        failed)
            ERROR=$(json_val "$STATUS_RESPONSE" "error")
            echo ""
            echo "Generation failed: $ERROR"
            exit 1
            ;;
        processing|pending)
            echo -n "."
            ;;
        *)
            echo ""
            echo "Unknown status: $STATUS"
            echo "$STATUS_RESPONSE"
            exit 1
            ;;
    esac
done

echo ""
echo "Timeout waiting for video generation"
exit 1
