# API Examples

## Submit Job (POST /generate)

### Request

```bash
curl -X POST https://api.example.com/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A golden retriever puppy playing in a sunny meadow",
    "seed": 42,
    "steps": 30,
    "duration": 5
  }'
```

### Response (202 Accepted)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending"
}
```

### Validation Errors (400 Bad Request)

```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "prompt",
      "message": "Prompt is required and must be a non-empty string"
    },
    {
      "field": "steps",
      "message": "Steps must be an integer between 1 and 100"
    }
  ]
}
```

## Get Status (GET /status/{jobId})

### Request

```bash
curl https://api.example.com/status/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Response - Pending/Processing (200 OK)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "createdAt": "2025-12-23T10:30:00.000Z",
  "updatedAt": "2025-12-23T10:30:15.000Z"
}
```

### Response - Completed (200 OK)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "videoUrl": "https://bucket.s3.amazonaws.com/videos/a1b2c3d4...?X-Amz-Algorithm=...",
  "createdAt": "2025-12-23T10:30:00.000Z",
  "updatedAt": "2025-12-23T10:32:45.000Z"
}
```

### Response - Failed (200 OK)

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "failed",
  "error": "GPU service error: Out of memory",
  "createdAt": "2025-12-23T10:30:00.000Z",
  "updatedAt": "2025-12-23T10:31:20.000Z"
}
```

### Response - Not Found (404 Not Found)

```json
{
  "error": "Job not found"
}
```

### Response - Invalid Job ID (400 Bad Request)

```json
{
  "error": "Invalid jobId format"
}
```

## CORS

All endpoints support CORS with the following headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type,Authorization
Access-Control-Allow-Methods: GET,POST,OPTIONS
```

OPTIONS requests are handled automatically.

## Rate Limits

The API uses standard AWS API Gateway rate limiting:
- Burst: 5000 requests
- Rate: 10000 requests per second

Customize these in the CDK stack configuration.

## Error Codes

| Status Code | Meaning |
|-------------|---------|
| 200 | Success - Job status retrieved |
| 202 | Accepted - Job submitted successfully |
| 400 | Bad Request - Validation error or invalid format |
| 404 | Not Found - Job doesn't exist |
| 500 | Internal Server Error - System error |

## Example Workflow

1. **Submit a job**:
```bash
RESPONSE=$(curl -X POST https://api.example.com/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A cat playing piano"}')

JOB_ID=$(echo $RESPONSE | jq -r '.jobId')
echo "Job ID: $JOB_ID"
```

2. **Poll for status** (every 5 seconds):
```bash
while true; do
  STATUS=$(curl -s https://api.example.com/status/$JOB_ID | jq -r '.status')
  echo "Status: $STATUS"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi

  sleep 5
done
```

3. **Download video** (if completed):
```bash
VIDEO_URL=$(curl -s https://api.example.com/status/$JOB_ID | jq -r '.videoUrl')
curl -o output.mp4 "$VIDEO_URL"
```

## JavaScript/TypeScript Example

```typescript
interface SubmitJobResponse {
  jobId: string;
  status: string;
}

interface JobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

async function generateVideo(prompt: string): Promise<string> {
  // Submit job
  const submitResponse = await fetch('https://api.example.com/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  const { jobId }: SubmitJobResponse = await submitResponse.json();
  console.log(`Job submitted: ${jobId}`);

  // Poll for completion
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResponse = await fetch(`https://api.example.com/status/${jobId}`);
    const status: JobStatus = await statusResponse.json();

    console.log(`Status: ${status.status}`);

    if (status.status === 'completed') {
      return status.videoUrl!;
    } else if (status.status === 'failed') {
      throw new Error(status.error || 'Video generation failed');
    }
  }
}

// Usage
generateVideo('A cat playing piano')
  .then(url => console.log('Video ready:', url))
  .catch(err => console.error('Error:', err));
```

## Python Example

```python
import requests
import time
import json

def generate_video(prompt: str, seed: int = None) -> str:
    api_base = "https://api.example.com"

    # Submit job
    submit_response = requests.post(
        f"{api_base}/generate",
        json={"prompt": prompt, "seed": seed}
    )
    submit_response.raise_for_status()
    job_id = submit_response.json()["jobId"]
    print(f"Job submitted: {job_id}")

    # Poll for completion
    while True:
        time.sleep(5)

        status_response = requests.get(f"{api_base}/status/{job_id}")
        status_response.raise_for_status()
        status = status_response.json()

        print(f"Status: {status['status']}")

        if status["status"] == "completed":
            return status["videoUrl"]
        elif status["status"] == "failed":
            raise Exception(status.get("error", "Video generation failed"))

# Usage
try:
    video_url = generate_video("A cat playing piano", seed=42)
    print(f"Video ready: {video_url}")

    # Download video
    video_response = requests.get(video_url)
    with open("output.mp4", "wb") as f:
        f.write(video_response.content)
    print("Video downloaded!")
except Exception as e:
    print(f"Error: {e}")
```
