# Lambda Function Testing Guide

## Local Testing

### Prerequisites

```bash
npm install
npm run build
```

### Test Events

Create test events in `test-events/` directory:

#### submit-job-event.json
```json
{
  "httpMethod": "POST",
  "path": "/generate",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"prompt\":\"A cat playing piano\",\"seed\":42,\"steps\":30}",
  "pathParameters": null,
  "queryStringParameters": null
}
```

#### get-status-event.json
```json
{
  "httpMethod": "GET",
  "path": "/status/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "headers": {},
  "body": null,
  "pathParameters": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "queryStringParameters": null
}
```

#### process-job-event.json
```json
{
  "Records": [
    {
      "messageId": "test-message-id",
      "receiptHandle": "test-receipt-handle",
      "body": "{\"jobId\":\"a1b2c3d4-e5f6-7890-abcd-ef1234567890\",\"prompt\":\"A cat playing piano\",\"seed\":42}",
      "attributes": {},
      "messageAttributes": {
        "jobId": {
          "stringValue": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "dataType": "String"
        }
      }
    }
  ]
}
```

### Running Locally with AWS SAM

1. **Install AWS SAM CLI**:
```bash
brew install aws-sam-cli
```

2. **Create SAM template** (`template.yaml`):
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    Runtime: nodejs20.x
    Environment:
      Variables:
        JOBS_TABLE_NAME: local-jobs-table
        BUCKET_NAME: local-video-bucket
        QUEUE_URL: http://localhost:4566/000000000000/local-queue
        GPU_ENDPOINT: http://localhost:8000

Resources:
  SubmitJobFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/submit-job/
      Handler: index.handler

  GetStatusFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/get-status/
      Handler: index.handler

  ProcessJobFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/process-job/
      Handler: index.handler
```

3. **Invoke locally**:
```bash
# Submit job
sam local invoke SubmitJobFunction -e test-events/submit-job-event.json

# Get status
sam local invoke GetStatusFunction -e test-events/get-status-event.json

# Process job
sam local invoke ProcessJobFunction -e test-events/process-job-event.json
```

### Using LocalStack

1. **Start LocalStack**:
```bash
docker run -d \
  -p 4566:4566 \
  -e SERVICES=dynamodb,sqs,s3 \
  localstack/localstack
```

2. **Create local resources**:
```bash
# Create DynamoDB table
aws dynamodb create-table \
  --table-name local-jobs-table \
  --attribute-definitions AttributeName=jobId,AttributeType=S \
  --key-schema AttributeName=jobId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://localhost:4566

# Create S3 bucket
aws s3 mb s3://local-video-bucket --endpoint-url http://localhost:4566

# Create SQS queue
aws sqs create-queue \
  --queue-name local-queue \
  --endpoint-url http://localhost:4566
```

3. **Update environment variables**:
```bash
export AWS_ENDPOINT_URL=http://localhost:4566
export JOBS_TABLE_NAME=local-jobs-table
export BUCKET_NAME=local-video-bucket
export QUEUE_URL=http://localhost:4566/000000000000/local-queue
```

## Unit Testing with Jest

### Install Jest

```bash
npm install --save-dev jest @types/jest ts-jest aws-sdk-client-mock
```

### Example Unit Test

```typescript
// submit-job/index.test.ts
import { handler } from './index';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const sqsMock = mockClient(SQSClient);

describe('Submit Job Lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    sqsMock.reset();
    process.env.JOBS_TABLE_NAME = 'test-table';
    process.env.QUEUE_URL = 'test-queue-url';
  });

  it('should successfully submit a job', async () => {
    dynamoMock.on(PutCommand).resolves({});
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'test-msg-id' });

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'Test prompt' }),
      headers: {},
      pathParameters: null,
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body);
    expect(body.jobId).toBeDefined();
    expect(body.status).toBe('pending');
  });

  it('should return 400 for invalid request', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: '' }), // Empty prompt
      headers: {},
      pathParameters: null,
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Validation failed');
  });
});
```

### Run Tests

```bash
npm test
```

## Integration Testing

### End-to-End Test Script

```bash
#!/bin/bash
set -e

API_BASE="https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com"

echo "1. Submitting job..."
RESPONSE=$(curl -s -X POST $API_BASE/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Test video generation","seed":42}')

JOB_ID=$(echo $RESPONSE | jq -r '.jobId')
echo "Job ID: $JOB_ID"

echo ""
echo "2. Checking status (pending)..."
STATUS_RESPONSE=$(curl -s $API_BASE/status/$JOB_ID)
echo $STATUS_RESPONSE | jq .

echo ""
echo "3. Waiting for completion..."
for i in {1..60}; do
  sleep 5
  STATUS=$(curl -s $API_BASE/status/$JOB_ID | jq -r '.status')
  echo "Attempt $i: Status = $STATUS"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
done

echo ""
echo "4. Final status:"
curl -s $API_BASE/status/$JOB_ID | jq .

if [ "$STATUS" = "completed" ]; then
  VIDEO_URL=$(curl -s $API_BASE/status/$JOB_ID | jq -r '.videoUrl')
  echo ""
  echo "5. Downloading video..."
  curl -o test-output.mp4 "$VIDEO_URL"
  echo "Video saved to test-output.mp4"
fi
```

## Load Testing

### Using Artillery

1. **Install Artillery**:
```bash
npm install -g artillery
```

2. **Create load test config** (`load-test.yml`):
```yaml
config:
  target: "https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Ramp up"
    - duration: 60
      arrivalRate: 100
      name: "Peak load"

scenarios:
  - name: "Submit and check job"
    flow:
      - post:
          url: "/generate"
          json:
            prompt: "Load test video"
            seed: 42
          capture:
            - json: "$.jobId"
              as: "jobId"
      - think: 5
      - get:
          url: "/status/{{ jobId }}"
```

3. **Run load test**:
```bash
artillery run load-test.yml
```

## Monitoring Test Results

### CloudWatch Logs

```bash
# View submit-job logs
aws logs tail /aws/lambda/submit-job --follow

# View get-status logs
aws logs tail /aws/lambda/get-status --follow

# View process-job logs
aws logs tail /aws/lambda/process-job --follow
```

### CloudWatch Metrics

Monitor these metrics:
- `Invocations`: Number of Lambda invocations
- `Duration`: Execution time
- `Errors`: Number of errors
- `Throttles`: Throttled requests
- `ConcurrentExecutions`: Concurrent executions

### DynamoDB Metrics

```bash
# View consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=ai-video-jobs \
  --start-time 2025-12-23T00:00:00Z \
  --end-time 2025-12-23T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## Debugging Tips

1. **Enable detailed logging**:
```typescript
console.log('Event:', JSON.stringify(event, null, 2));
console.log('Environment:', process.env);
```

2. **Use X-Ray for distributed tracing**:
```bash
# Enable in Lambda configuration
aws lambda update-function-configuration \
  --function-name submit-job \
  --tracing-config Mode=Active
```

3. **Check DynamoDB items**:
```bash
aws dynamodb get-item \
  --table-name ai-video-jobs \
  --key '{"jobId":{"S":"your-job-id"}}'
```

4. **Monitor SQS queue**:
```bash
# Check queue depth
aws sqs get-queue-attributes \
  --queue-url YOUR_QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages
```
