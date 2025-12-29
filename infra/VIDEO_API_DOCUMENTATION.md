# Video API Stack Documentation

## Overview

The Video API Stack provides a complete serverless REST API for asynchronous video generation with job tracking. It integrates with the Storage Stack for S3 bucket access and coordinates video generation jobs through SQS and DynamoDB.

## Architecture Components

### 1. SQS Queue (Async Job Processing)
- **Main Queue**: `video-generation-queue`
  - Visibility timeout: 600 seconds (10 minutes)
  - Long polling: 20 seconds
  - Max retries: 3 attempts before DLQ

- **Dead Letter Queue (DLQ)**: `video-generation-dlq`
  - Retention: 14 days
  - Captures failed jobs after max retries

### 2. DynamoDB Table (Job Status Tracking)
- **Table Name**: `video-jobs`
- **Partition Key**: `jobId` (string, UUID)
- **Attributes**:
  - `jobId`: Unique job identifier
  - `status`: Job state (pending | processing | completed | failed)
  - `prompt`: User's video generation prompt
  - `seed`: Optional random seed
  - `steps`: Optional inference steps
  - `duration`: Optional video duration in seconds
  - `createdAt`: ISO timestamp
  - `updatedAt`: ISO timestamp
  - `videoUrl`: S3 URL (when completed)
  - `error`: Error message (when failed)

- **Global Secondary Index**: `status-index`
  - Partition Key: `status`
  - Sort Key: `createdAt`
  - Enables querying jobs by status

- **TTL**: Automatic deletion after 30 days (via `ttl` attribute)
- **Billing**: PAY_PER_REQUEST mode
- **Backup**: Point-in-time recovery enabled
- **Retention**: RETAIN policy (preserved on stack deletion)

### 3. Lambda Functions

#### Submit Job Lambda (`SubmitJobFunction`)
- **Runtime**: Node.js 18.x
- **Timeout**: 30 seconds
- **Handler**: `index.handler`
- **Responsibilities**:
  - Validates incoming requests
  - Creates job record in DynamoDB
  - Sends message to SQS queue
  - Returns job ID to client

- **Environment Variables**:
  - `JOBS_TABLE_NAME`: DynamoDB table name
  - `QUEUE_URL`: SQS queue URL

- **Permissions**:
  - DynamoDB: Write access to jobs table
  - SQS: Send messages to queue

#### Get Status Lambda (`GetStatusFunction`)
- **Runtime**: Node.js 18.x
- **Timeout**: 10 seconds
- **Handler**: `index.handler
- **Responsibilities**:
  - Retrieves job status from DynamoDB
  - Generates presigned S3 URLs for completed videos
  - Returns job details and video URL

- **Environment Variables**:
  - `JOBS_TABLE_NAME`: DynamoDB table name
  - `BUCKET_NAME`: S3 bucket name

- **Permissions**:
  - DynamoDB: Read access to jobs table
  - S3: Read access to video bucket

### 4. API Gateway (REST)
- **Name**: Video Generation API
- **Stage**: prod
- **Endpoints**:
  - `POST /generate` - Submit video generation job
  - `GET /status/{jobId}` - Get job status and video URL

- **CORS**: Enabled for all origins
  - Methods: ALL
  - Headers: Content-Type, Authorization, X-Api-Key, etc.

- **Throttling**:
  - Rate limit: 100 requests/second
  - Burst limit: 200 requests

- **Usage Plan**:
  - Quota: 10,000 requests/month
  - API Key: Optional (currently disabled)

- **Request Validation**:
  - POST /generate: Validates JSON schema
  - Required field: `prompt` (1-5000 characters)
  - Optional field: `parameters` (object)

## API Endpoints

### POST /generate

Submit a new video generation job.

**Request:**
```json
{
  "prompt": "A beautiful sunset over the ocean with waves",
  "seed": 42,
  "steps": 50,
  "duration": 5
}
```

**Response (202 Accepted):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

**Validation Rules:**
- `prompt`: Required, 1-1000 characters
- `seed`: Optional, non-negative integer
- `steps`: Optional, integer between 1-100
- `duration`: Optional, number between 1-10 seconds

**Error Responses:**
- 400: Invalid request (missing prompt, validation errors)
- 500: Internal server error

### GET /status/{jobId}

Retrieve job status and video URL if completed.

**Path Parameters:**
- `jobId`: UUID format required

**Response (200 OK) - Pending:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2025-12-23T10:30:00.000Z",
  "updatedAt": "2025-12-23T10:30:00.000Z"
}
```

**Response (200 OK) - Completed:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "videoUrl": "https://bucket.s3.region.amazonaws.com/...",
  "createdAt": "2025-12-23T10:30:00.000Z",
  "updatedAt": "2025-12-23T10:35:00.000Z"
}
```

**Response (200 OK) - Failed:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error": "Video generation failed: ...",
  "createdAt": "2025-12-23T10:30:00.000Z",
  "updatedAt": "2025-12-23T10:32:00.000Z"
}
```

**Error Responses:**
- 400: Invalid jobId format
- 404: Job not found
- 500: Internal server error

**Presigned URL:**
- Automatically generated for completed jobs
- Expiration: 1 hour (3600 seconds)
- Allows direct video download without authentication

## SQS Message Format

Messages sent to the queue have the following structure:

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "prompt": "A beautiful sunset over the ocean",
  "seed": 42,
  "steps": 50,
  "duration": 5
}
```

**Message Attributes:**
- `jobId`: String type, contains the job ID

## Job Status Flow

```
PENDING → PROCESSING → COMPLETED
                    ↓
                  FAILED → DLQ (after 3 retries)
```

1. **PENDING**: Job created, waiting in queue
2. **PROCESSING**: Job picked up by worker
3. **COMPLETED**: Video generated and uploaded to S3
4. **FAILED**: Error occurred during processing

## Stack Outputs

After deployment, the stack provides these outputs:

- **ApiEndpoint**: Full API Gateway URL
- **ApiKeyId**: API Key ID (retrieve value from AWS console)
- **JobQueueUrl**: SQS queue URL for processing jobs
- **JobTableName**: DynamoDB table name
- **DLQUrl**: Dead letter queue URL

## Integration with Other Stacks

### Storage Stack
- **Dependency**: Requires `storageStack.videoBucket`
- **Usage**:
  - Lambda environment variable: `BUCKET_NAME`
  - S3 presigned URL generation
  - Video storage location

### GPU Inference Stack
- **Connection Point**: Job processing worker reads from SQS queue
- **Worker Responsibilities**:
  - Poll SQS queue for new jobs
  - Update DynamoDB job status to "processing"
  - Generate video using AI model
  - Upload video to S3
  - Update DynamoDB with videoUrl and "completed" status
  - Handle errors and update status to "failed"

## Configuration Options

### Enable API Key Authentication

In `video-api-stack.ts`, change line 160 and 200:
```typescript
apiKeyRequired: true,
```

Retrieve API key value:
```bash
aws apigateway get-api-key --api-key <ApiKeyId> --include-value
```

Use in requests:
```bash
curl -H "X-API-Key: your-api-key-value" https://api-endpoint/generate
```

### Adjust Queue Timeouts

Modify visibility timeout for longer video generation:
```typescript
visibilityTimeout: cdk.Duration.seconds(900), // 15 minutes
```

### Modify DynamoDB TTL

Change auto-deletion period in job creation:
```typescript
ttl: Math.floor(timestamp / 1000) + (60 * 24 * 60 * 60), // 60 days
```

## Monitoring and Logging

### CloudWatch Metrics

**API Gateway:**
- Request count
- Latency (min, max, avg)
- 4XX/5XX error rates
- Cache hit/miss

**Lambda:**
- Invocations
- Errors
- Duration
- Throttles
- Concurrent executions

**SQS:**
- Messages sent
- Messages received
- Messages deleted
- Messages visible
- Age of oldest message
- DLQ messages

**DynamoDB:**
- Read/write capacity units
- Throttled requests
- System errors
- User errors

### CloudWatch Logs

Lambda logs are available at:
- `/aws/lambda/VideoApiStack-SubmitJobFunction-*`
- `/aws/lambda/VideoApiStack-GetStatusFunction-*`

Enable API Gateway logging in deployment options:
```typescript
deployOptions: {
  loggingLevel: apigateway.MethodLoggingLevel.INFO,
  dataTraceEnabled: true,
}
```

## Security Considerations

1. **API Authentication**: Enable API key requirement in production
2. **CORS**: Restrict allowed origins in production:
   ```typescript
   allowOrigins: ['https://yourdomain.com'],
   ```
3. **IAM Roles**: Lambda functions use least-privilege IAM policies
4. **Encryption**:
   - S3: Server-side encryption (SSE-S3)
   - DynamoDB: Encryption at rest enabled by default
   - SQS: Consider enabling encryption for sensitive data

5. **Presigned URLs**: 1-hour expiration limits unauthorized access
6. **Input Validation**: Request validator prevents injection attacks
7. **Rate Limiting**: Throttling prevents abuse and controls costs

## Cost Optimization

1. **DynamoDB**: PAY_PER_REQUEST billing scales with actual usage
2. **Lambda**: Only charged for actual execution time
3. **API Gateway**: Consider caching for frequently accessed endpoints
4. **S3**: Use lifecycle policies to archive/delete old videos
5. **SQS**: Long polling reduces empty receive charges
6. **TTL**: Automatic cleanup reduces storage costs

## Troubleshooting

### Jobs Stuck in PENDING

Check queue processing:
```bash
aws sqs get-queue-attributes \
  --queue-url <QueueUrl> \
  --attribute-names All
```

Verify worker is polling the queue.

### DLQ Messages

Inspect failed jobs:
```bash
aws sqs receive-message --queue-url <DLQUrl>
```

Common causes:
- Worker crashes
- Invalid S3 permissions
- Model inference errors

### Lambda Errors

View logs:
```bash
aws logs tail /aws/lambda/VideoApiStack-SubmitJobFunction-* --follow
```

### API Gateway 429 Errors

Throttling limits reached. Options:
- Increase rate limits in usage plan
- Implement client-side retry logic
- Request service limit increase

## Development and Testing

### Local Testing

Test Lambda functions locally:
```bash
cd infra/lambda/submit-job
npm test
```

### API Testing

```bash
# Submit job
curl -X POST https://<api-endpoint>/prod/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test video"}'

# Get status
curl https://<api-endpoint>/prod/status/<jobId>
```

### Load Testing

Use tools like Apache Bench or Artillery:
```bash
artillery quick --count 100 --num 10 \
  https://<api-endpoint>/prod/status/<jobId>
```

## Future Enhancements

1. **WebSocket Support**: Real-time job status updates
2. **Batch Operations**: Submit multiple jobs at once
3. **Job Cancellation**: DELETE endpoint to cancel pending jobs
4. **Priority Queue**: FIFO queue for priority jobs
5. **Webhooks**: Notify external systems on job completion
6. **Job Filtering**: Query jobs by status, date range, etc.
7. **Analytics**: CloudWatch dashboards for job metrics
