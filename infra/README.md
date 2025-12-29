# AI Video Generation Infrastructure

Production-ready AWS CDK infrastructure for GPU-accelerated AI video generation using the Wan2.2-T2V-A14B text-to-video model.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT                                  │
│                     (Frontend/API Client)                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY                                 │
│  ┌──────────────┐              ┌──────────────┐                 │
│  │ POST /generate│              │GET /status/{id}│                │
│  └──────┬───────┘              └──────┬─────────┘                │
└─────────┼──────────────────────────────┼──────────────────────────┘
          │                              │
          │                              │
┌─────────▼──────────┐         ┌─────────▼──────────┐
│  Submit Job Lambda │         │ Get Status Lambda  │
│                    │         │                    │
│  - Generate Job ID │         │  - Query DynamoDB  │
│  - Send to SQS     │         │  - Return Status   │
│  - Save to DDB     │         │  - Presigned URLs  │
└─────────┬──────────┘         └────────────────────┘
          │
          │
┌─────────▼──────────────────────────────────────────┐
│              SQS JOB QUEUE                          │
│  ┌──────────────────────────────────────┐          │
│  │  Job: { jobId, prompt, parameters }  │          │
│  └──────────────────────────────────────┘          │
└─────────┬──────────────────────────────────────────┘
          │
          │ Poll Messages
          ▼
┌─────────────────────────────────────────────────────┐
│           PROCESS JOB LAMBDA                        │
│  (Triggered by SQS)                                 │
│                                                     │
│  - Update status: PROCESSING                        │
│  - Send request to GPU Container                    │
│  - Poll for completion                              │
│  - Update final status + video URL                  │
└─────────┬───────────────────────────────────────────┘
          │
          │ HTTP POST
          ▼
┌─────────────────────────────────────────────────────┐
│      GPU INFERENCE CLUSTER (ECS/EC2)                │
│  ┌───────────────────────────────────────┐          │
│  │   Application Load Balancer (ALB)     │          │
│  └───────────┬───────────────────────────┘          │
│              │                                       │
│  ┌───────────▼───────────────────────────┐          │
│  │   ECS Task (GPU-enabled g5.xlarge)    │          │
│  │                                        │          │
│  │   ┌────────────────────────────────┐  │          │
│  │   │  FastAPI Server                │  │          │
│  │   │  - Loads Wan2.2-T2V model      │  │          │
│  │   │  - Runs inference on GPU        │  │          │
│  │   │  - Uploads video to S3          │  │          │
│  │   └────────────────────────────────┘  │          │
│  └────────────────────────────────────────┘          │
└─────────┬───────────────────────────────────────────┘
          │
          │ Upload Video
          ▼
┌─────────────────────────────────────────────────────┐
│              S3 STORAGE                              │
│  ┌──────────────────┐  ┌──────────────────┐         │
│  │  Video Outputs   │  │  Model Weights   │         │
│  │  (7-day expiry)  │  │  (Retained)      │         │
│  └──────────────────┘  └──────────────────┘         │
└─────────────────────────────────────────────────────┘
          ▲
          │
┌─────────┴───────────────────────────────────────────┐
│           DYNAMODB JOB TABLE                        │
│  ┌────────────────────────────────────────┐         │
│  │  jobId, status, prompt, videoUrl, etc. │         │
│  └────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────┘
```

## Stack Components

### 1. Storage Stack
- **Video Output Bucket**: Stores generated videos with 7-day lifecycle policy
- **Model Weights Bucket**: Stores AI model weights (retained on deletion)
- Encryption at rest (SSE-S3)
- CORS enabled for presigned URL access

### 2. Video API Stack
- **API Gateway**: RESTful API with CORS enabled
  - `POST /generate` - Submit video generation job
  - `GET /status/{jobId}` - Check job status and get video URL
- **Lambda Functions**:
  - Submit Job: Creates job records and queues work
  - Get Status: Returns job status and presigned URLs
  - Process Job: Polls SQS and coordinates GPU inference
- **DynamoDB Table**: Job tracking with status index
- **SQS Queue**: Job queue with DLQ for failed jobs
- API Key authentication (optional)
- Request validation and rate limiting

### 3. GPU Inference Stack (To be implemented)
- ECS Cluster with GPU-enabled tasks
- Application Load Balancer
- Auto Scaling Group with g5.xlarge instances
- Docker container running FastAPI + Wan2.2-T2V model

## Prerequisites

### Required Software
- **Node.js**: v18+ ([Download](https://nodejs.org/))
- **AWS CLI**: v2+ ([Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html))
- **AWS CDK**: v2.114.0+
  ```bash
  npm install -g aws-cdk@2.114.0
  ```
- **Docker**: For building container images ([Download](https://www.docker.com/products/docker-desktop))
- **jq**: For parsing JSON responses (optional, for testing)
  ```bash
  brew install jq  # macOS
  sudo apt-get install jq  # Ubuntu
  ```

### AWS Account Setup
1. **AWS Account**: Active AWS account with appropriate permissions
2. **IAM User**: User with Administrator access or these permissions:
   - CloudFormation
   - S3
   - DynamoDB
   - Lambda
   - API Gateway
   - SQS
   - ECS/EC2
   - IAM (for creating roles)
   - ECR (for Docker images)

3. **VPC Configuration**: Existing VPC with public and private subnets (for GPU instances)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd /Users/tyler/Desktop/Gauntlet/AI-video/infra
npm install
```

### 2. Configure Environment Variables

Create or update the `.env` file in the `infra/` directory:

```bash
# AWS Account Configuration
AWS_ACCOUNT_ID=123456789012          # Your AWS account ID
AWS_REGION=us-east-1                 # AWS region (us-east-1 recommended for GPU availability)
AWS_ACCESS_KEY_ID=AKIA...           # Your AWS access key
AWS_SECRET_ACCESS_KEY=...           # Your AWS secret key

# Environment
ENVIRONMENT=dev                      # dev, staging, or prod

# VPC Configuration (required for GPU instances)
VPC_ID=vpc-xxxxx                    # Your VPC ID
SUBNET_IDS=subnet-xxx,subnet-yyy    # Comma-separated private subnet IDs
```

**Finding Your AWS Account ID:**
```bash
aws sts get-caller-identity --query Account --output text
```

**Finding Your VPC and Subnets:**
```bash
# List VPCs
aws ec2 describe-vpcs --query 'Vpcs[*].[VpcId,Tags[?Key==`Name`].Value|[0]]' --output table

# List Subnets in a VPC
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-xxxxx" \
  --query 'Subnets[*].[SubnetId,AvailabilityZone,CidrBlock]' --output table
```

### 3. Bootstrap CDK (First Time Only)

Bootstrap your AWS account for CDK deployments:

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION

# Example:
cdk bootstrap aws://123456789012/us-east-1
```

This creates an S3 bucket and ECR repository for CDK assets.

### 4. Build TypeScript

```bash
npm run build
```

### 5. Review Infrastructure Changes

```bash
cdk diff
```

This shows what resources will be created without actually deploying.

### 6. Synthesize CloudFormation Templates

```bash
cdk synth
```

Generates CloudFormation templates in `cdk.out/` directory.

## Deployment

### Manual Deployment

**Deploy All Stacks:**
```bash
cdk deploy --all
```

**Deploy Individual Stacks:**
```bash
# Deploy storage first (required by other stacks)
cdk deploy AiVideo-dev-Storage

# Deploy API stack
cdk deploy AiVideo-dev-VideoApi

# Deploy GPU inference stack (when implemented)
cdk deploy AiVideo-dev-GpuInference
```

**Deploy with Auto-Approval (CI/CD):**
```bash
cdk deploy --all --require-approval never
```

### Automated Deployment (Recommended)

Use the provided deployment script:

```bash
./scripts/deploy.sh
```

This script:
1. Loads environment variables from `.env`
2. Builds Docker images for GPU containers
3. Pushes images to ECR
4. Runs `cdk deploy --all`
5. Outputs API endpoint and important URLs

### Monitoring Deployment

Watch CloudFormation stack creation:
```bash
# Via AWS CLI
aws cloudformation describe-stacks --stack-name AiVideo-dev-VideoApi

# Via AWS Console
# https://console.aws.amazon.com/cloudformation
```

## Environment Variables Explained

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AWS_ACCOUNT_ID` | Yes | Your 12-digit AWS account ID | `123456789012` |
| `AWS_REGION` | No | AWS region for deployment | `us-east-1` (default) |
| `AWS_ACCESS_KEY_ID` | Yes | AWS access key for authentication | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS secret key for authentication | `...` |
| `ENVIRONMENT` | No | Environment name (used in resource naming) | `dev`, `staging`, `prod` |
| `VPC_ID` | Yes* | VPC ID for GPU instances | `vpc-abc123` |
| `SUBNET_IDS` | Yes* | Comma-separated subnet IDs (private recommended) | `subnet-aaa,subnet-bbb` |

*Required only for GPU Inference Stack

## API Usage Examples

After deployment, you'll receive an API Gateway endpoint URL. Use it as follows:

### Submit a Video Generation Job

**Request:**
```bash
curl -X POST https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene lake with mountains in the background at sunset",
    "parameters": {
      "duration": 5,
      "aspectRatio": "16:9",
      "style": "cinematic"
    }
  }'
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "message": "Job submitted successfully",
  "createdAt": 1703001234567
}
```

### Check Job Status

**Request:**
```bash
curl -X GET https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/status/550e8400-e29b-41d4-a716-446655440000
```

**Response (Processing):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PROCESSING",
  "prompt": "A serene lake with mountains in the background at sunset",
  "createdAt": 1703001234567,
  "updatedAt": 1703001240123
}
```

**Response (Completed):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  "prompt": "A serene lake with mountains in the background at sunset",
  "videoUrl": "https://ai-video-outputs-123456789012-us-east-1.s3.amazonaws.com/videos/550e8400-e29b-41d4-a716-446655440000.mp4?X-Amz-Algorithm=...",
  "duration": 5,
  "createdAt": 1703001234567,
  "updatedAt": 1703001345678,
  "completedAt": 1703001345678
}
```

**Response (Failed):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "FAILED",
  "error": "GPU inference timeout after 600 seconds",
  "createdAt": 1703001234567,
  "updatedAt": 1703001834567
}
```

### Job Status Values

- `PENDING`: Job submitted, waiting in queue
- `PROCESSING`: Currently generating video on GPU
- `COMPLETED`: Video generation successful, URL available
- `FAILED`: Generation failed (check error field)

### Using API Key (Optional)

If API key authentication is enabled:

```bash
curl -X POST https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR-API-KEY" \
  -d '{"prompt": "..."}'
```

Get your API key from AWS Console:
1. Navigate to API Gateway
2. Select "Video Generation API"
3. Go to "API Keys"
4. Click on "video-generation-api-key"
5. Click "Show" to reveal the key

### Testing Script

See `examples/test-api.sh` for a complete testing script with jq parsing.

## Cost Estimation

### Monthly Costs (Approximate)

Based on moderate usage (assumes us-east-1 pricing):

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| **EC2 g5.xlarge** | 1 instance, 24/7 | ~$550/month |
| **EC2 g5.xlarge** | 1 instance, 8hrs/day | ~$183/month |
| **S3 Storage** | 100GB stored, 1000 videos | ~$2.30/month |
| **S3 Data Transfer** | 500GB out | ~$45/month |
| **API Gateway** | 1M requests | ~$3.50/month |
| **Lambda** | 1M invocations, 512MB | ~$1.00/month |
| **DynamoDB** | On-demand, 1M requests | ~$1.25/month |
| **SQS** | 1M requests | ~$0.40/month |
| **ALB** | Running 24/7 | ~$16/month |
| **ECR Storage** | Docker images | ~$1/month |

**Total (24/7 GPU):** ~$620/month
**Total (8hrs/day GPU):** ~$253/month
**Total (on-demand only):** ~$70/month + GPU runtime

### Cost Control Recommendations

1. **Scale GPU Instances to Zero When Idle**
   ```bash
   # Scale down ASG to 0
   aws autoscaling set-desired-capacity \
     --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
     --desired-capacity 0

   # Scale up when needed
   aws autoscaling set-desired-capacity \
     --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
     --desired-capacity 1
   ```

2. **Use Lifecycle Policies for S3**
   - Videos auto-delete after 7 days (already configured)
   - Adjust in `lib/storage-stack.ts` if needed

3. **Use Spot Instances for GPU (Advanced)**
   - Can save up to 70% on GPU costs
   - Trade-off: potential interruptions

4. **Set Up CloudWatch Billing Alarms**
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name ai-video-billing-alarm \
     --alarm-description "Alert when monthly charges exceed $300" \
     --metric-name EstimatedCharges \
     --namespace AWS/Billing \
     --statistic Maximum \
     --period 21600 \
     --threshold 300 \
     --comparison-operator GreaterThanThreshold \
     --evaluation-periods 1 \
     --dimensions Name=Currency,Value=USD
   ```

5. **Monitor with Cost Explorer**
   - Enable in AWS Console > Billing > Cost Explorer
   - Filter by tags: `Project=AI-Video-Generation`

See [COST-NOTES.md](./COST-NOTES.md) for detailed cost analysis.

## Shutdown and Cleanup

### Temporary Shutdown (Preserve Infrastructure)

**Scale GPU instances to zero:**
```bash
./scripts/shutdown.sh
```

Or manually:
```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
  --desired-capacity 0
```

This stops GPU costs but keeps infrastructure deployed.

### Complete Cleanup (Delete All Resources)

**WARNING:** This deletes ALL data including videos and job history.

```bash
# Destroy all stacks
cdk destroy --all

# Or use the shutdown script with destroy flag
./scripts/shutdown.sh --destroy
```

**Manual deletion order:**
```bash
# Delete stacks in reverse dependency order
cdk destroy AiVideo-dev-VideoApi
cdk destroy AiVideo-dev-GpuInference
cdk destroy AiVideo-dev-Storage
```

## Troubleshooting

### Deployment Errors

**Error: "AWS_ACCOUNT_ID environment variable is required"**
- Solution: Create `.env` file with required variables

**Error: "Resource handler returned message: Invalid bucket name"**
- Solution: Bucket names must be globally unique. CDK generates unique names using account ID.

**Error: "User is not authorized to perform: cloudformation:CreateStack"**
- Solution: Ensure your AWS credentials have sufficient permissions

### Runtime Errors

**Job Stuck in PENDING Status**
- Check SQS queue has messages
- Verify process-job Lambda has permissions
- Check CloudWatch Logs for Lambda errors

**Job Status Returns FAILED**
- Check CloudWatch Logs: `/aws/lambda/AiVideo-dev-ProcessJobFunction`
- Verify GPU instance is running
- Check ECS task logs in CloudWatch

### Debugging Commands

```bash
# Check API Gateway endpoint
aws apigateway get-rest-apis --query 'items[?name==`Video Generation API`]'

# Check Lambda function status
aws lambda get-function --function-name AiVideo-dev-SubmitJobFunction

# Check DynamoDB table
aws dynamodb scan --table-name video-jobs --limit 10

# Check SQS queue depth
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/video-generation-queue \
  --attribute-names ApproximateNumberOfMessages

# View CloudWatch logs
aws logs tail /aws/lambda/AiVideo-dev-SubmitJobFunction --follow
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Change `ENVIRONMENT=prod` in `.env`
- [ ] Enable API key authentication (`apiKeyRequired: true`)
- [ ] Restrict CORS origins to your domain
- [ ] Set up CloudWatch alarms for errors and latency
- [ ] Enable CloudTrail for audit logging
- [ ] Configure AWS WAF on API Gateway
- [ ] Review IAM policies (principle of least privilege)
- [ ] Set up multi-region failover (if needed)

## Deployed Resources (Current)

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/generate` | POST | Submit video generation job |
| `https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/status/{jobId}` | GET | Get job status |

### Resource ARNs & Names

**Storage Stack (`AiVideo-dev-Storage`)**
- S3 Bucket: `aivideo-dev-storage-videooutputbucket84b20b15-eibw7rfimale`
- Stack ARN: `arn:aws:cloudformation:us-east-1:971422717446:stack/AiVideo-dev-Storage/12a09710-e082-11f0-8058-0e9b6fc03247`

**Video API Stack (`AiVideo-dev-VideoApi`)**
- API Gateway Endpoint: `https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/`
- API Key ID: `fu9o12bsz6`
- DynamoDB Table: `video-jobs`
- SQS Queue URL: `https://sqs.us-east-1.amazonaws.com/971422717446/video-generation-queue`
- DLQ URL: `https://sqs.us-east-1.amazonaws.com/971422717446/video-generation-dlq`
- Stack ARN: `arn:aws:cloudformation:us-east-1:971422717446:stack/AiVideo-dev-VideoApi/ddd5c4f0-e082-11f0-9910-1279199a2b11`

**Lambda Functions**
- Submit Job: `AiVideo-dev-VideoApi-SubmitJobFunctionF227DE12-ygqQDu6wZQ5t`
- Get Status: `AiVideo-dev-VideoApi-GetStatusFunction4DB2BCBB-FTo25tMk5S4v`
- Process Job: `AiVideo-dev-VideoApi-ProcessJobFunction19F99648-aW94LTLJjVRC`

**GPU Inference Stack (`AiVideo-dev-GpuInference`)**
- VPC ID: `vpc-03cd6462b46350c8e`
- Security Group: `sg-0c77e10a20dbb5dac`
- ASG Name: `AiVideo-dev-GpuInference-GpuAsgASG4AAF2DD0-TVuuf0DBOch2`
- Stack ARN: `arn:aws:cloudformation:us-east-1:971422717446:stack/AiVideo-dev-GpuInference/32803a40-e082-11f0-9401-0ebec566510b`

### Quick Test Commands

```bash
# Submit a job
curl -X POST https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A cat playing piano", "duration": 4}'

# Check job status (replace JOB_ID)
curl https://0woorvfufb.execute-api.us-east-1.amazonaws.com/prod/status/JOB_ID

# Get API key value
aws apigateway get-api-key --api-key fu9o12bsz6 --include-value --query 'value' --output text

# Check Lambda logs
aws logs tail /aws/lambda/AiVideo-dev-VideoApi-ProcessJobFunction19F99648-aW94LTLJjVRC --follow

# Check SQS queue depth
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/971422717446/video-generation-queue \
  --attribute-names ApproximateNumberOfMessages
```

## Support and Resources

### AWS Documentation
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/latest/guide/)
- [API Gateway Developer Guide](https://docs.aws.amazon.com/apigateway/)
- [ECS Developer Guide](https://docs.aws.amazon.com/ecs/)
- [Lambda Developer Guide](https://docs.aws.amazon.com/lambda/)

### Project Documentation
- [Cost Notes](./COST-NOTES.md) - Detailed cost breakdown
- [Deployment Script](./scripts/deploy.sh) - Automated deployment
- [Shutdown Script](./scripts/shutdown.sh) - Infrastructure shutdown
- [API Testing Examples](./examples/test-api.sh) - Complete test suite

## License

ISC License - See project root for details.

---

**Last Updated:** 2025-12-24
**CDK Version:** 2.114.0
**AWS CLI Version:** 2.x required
