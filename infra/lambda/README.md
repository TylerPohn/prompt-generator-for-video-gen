# AI Video Generation Lambda Functions

TypeScript Lambda functions for the AI video generation service.

## Structure

```
lambda/
├── shared/
│   └── types.ts              # Shared TypeScript types
├── submit-job/
│   └── index.ts              # POST /generate endpoint
├── get-status/
│   └── index.ts              # GET /status/{jobId} endpoint
├── process-job/
│   └── index.ts              # SQS-triggered processor
├── package.json
├── tsconfig.json
└── README.md
```

## Functions

### 1. submit-job (POST /generate)

**Trigger**: API Gateway POST /generate

**Environment Variables**:
- `JOBS_TABLE_NAME`: DynamoDB table name
- `QUEUE_URL`: SQS queue URL

**Request Body**:
```json
{
  "prompt": "string (required)",
  "seed": "number (optional)",
  "steps": "number (optional, 1-100)",
  "duration": "number (optional, 1-10)"
}
```

**Response**:
```json
{
  "jobId": "uuid",
  "status": "pending"
}
```

**Features**:
- Request validation
- UUID generation
- DynamoDB storage
- SQS message publishing
- CORS headers
- Error handling

### 2. get-status (GET /status/{jobId})

**Trigger**: API Gateway GET /status/{jobId}

**Environment Variables**:
- `JOBS_TABLE_NAME`: DynamoDB table name
- `BUCKET_NAME`: S3 bucket name

**Response**:
```json
{
  "jobId": "uuid",
  "status": "pending|processing|completed|failed",
  "videoUrl": "presigned-url (if completed)",
  "error": "string (if failed)",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**Features**:
- Path parameter extraction
- UUID validation
- DynamoDB query
- S3 presigned URL generation (1 hour expiry)
- 404 handling for missing jobs
- CORS headers

### 3. process-job (SQS Trigger)

**Trigger**: SQS queue

**Environment Variables**:
- `JOBS_TABLE_NAME`: DynamoDB table name
- `BUCKET_NAME`: S3 bucket name
- `GPU_ENDPOINT`: GPU instance endpoint (e.g., http://10.0.1.100:8000)

**Features**:
- SQS message parsing
- Status updates (processing → completed/failed)
- HTTP call to GPU FastAPI service
- Video upload to S3
- Error handling with DynamoDB updates
- VPC networking support

## Build

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build all functions
npm run build

# Build individual functions
npm run build:submit-job
npm run build:get-status
npm run build:process-job

# Clean build artifacts
npm run clean
```

## Deployment

The Lambda functions are deployed using AWS CDK (see `../cdk/` directory).

Each function is bundled with esbuild and deployed with:
- Node.js 20 runtime
- AWS SDK v3 (excluded from bundle, provided by Lambda runtime)
- Appropriate IAM roles and permissions
- Environment variables from CDK stack

## Development

### Local Testing

```typescript
// Example event for submit-job
const event = {
  httpMethod: 'POST',
  body: JSON.stringify({
    prompt: 'A cat playing piano',
    seed: 42,
    steps: 30
  }),
  headers: {},
  pathParameters: null
};
```

### Type Safety

All functions use shared types from `shared/types.ts` for:
- Request/response validation
- DynamoDB items
- SQS messages
- FastAPI communication

### Error Handling

- API Gateway functions return appropriate HTTP status codes
- CORS headers included in all responses
- Detailed error messages for debugging
- SQS processor updates job status on failure

## AWS SDK v3

All functions use AWS SDK v3 with modular imports:
- `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- `@aws-sdk/client-sqs`

Benefits:
- Smaller bundle sizes
- Tree-shaking support
- Modern TypeScript support
- Better performance
