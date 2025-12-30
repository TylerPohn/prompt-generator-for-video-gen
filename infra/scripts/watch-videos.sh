#!/bin/bash
# Watch S3 bucket for new videos and download them locally
# Usage: ./watch-videos.sh [bucket-name] [local-dir]

BUCKET=${1:-video-api-generatedvideosbucket06aborgjahsdg}
LOCAL_DIR=${2:-$HOME/Desktop/generated-videos}
INTERVAL=240  # 4 minutes

mkdir -p "$LOCAL_DIR"

echo "Watching s3://$BUCKET/generated-videos/"
echo "Downloading to: $LOCAL_DIR"
echo "Checking every $((INTERVAL/60)) minutes..."
echo ""

LAST_KEY=""
FIRST_RUN=true

while true; do
    # Sleep at start of loop (skip on first run)
    if [ "$FIRST_RUN" = true ]; then
        FIRST_RUN=false
    else
        sleep $INTERVAL
    fi
    # Get most recent file
    LATEST=$(aws s3api list-objects-v2 \
        --bucket "$BUCKET" \
        --prefix "generated-videos/" \
        --query 'sort_by(Contents, &LastModified)[-1].[Key, LastModified]' \
        --output text 2>/dev/null)

    KEY=$(echo "$LATEST" | cut -f1)
    TIMESTAMP=$(echo "$LATEST" | cut -f2)

    if [ -n "$KEY" ] && [ "$KEY" != "None" ] && [ "$KEY" != "$LAST_KEY" ]; then
        SUFFIX=$(head -c 2 /dev/urandom | xxd -p)
        FILENAME=$(basename "$KEY" .mp4)_${SUFFIX}.mp4

        echo "[$(date '+%H:%M:%S')] New video: $KEY"
        aws s3 cp "s3://$BUCKET/$KEY" "$LOCAL_DIR/$FILENAME" --quiet
        echo "  -> Downloaded: $FILENAME"

        LAST_KEY="$KEY"
    else
        echo -n "."
    fi
done
