# AI Video Infrastructure Documentation Index

This directory contains comprehensive documentation and utilities for the AI video generation infrastructure.

## Documentation Files

### 1. [README.md](./README.md)
**The main documentation file** - Start here!

**Contents:**
- ASCII architecture diagram
- Prerequisites and setup instructions
- Deployment guide (manual and automated)
- Environment variables reference
- API usage examples with curl commands
- Cost estimation summary
- Shutdown and cleanup procedures
- Troubleshooting guide
- Production deployment checklist
- Security considerations

**Size:** 20KB | **Type:** Main Guide

---

### 2. [COST-NOTES.md](./COST-NOTES.md)
**Comprehensive cost analysis and optimization guide**

**Contents:**
- Detailed monthly cost breakdowns
- Service-by-service pricing analysis
- Cost scenarios (dev, production, 24/7, spot)
- GPU instance pricing comparisons
- Cost optimization strategies
- Monitoring and alerting setup
- FAQ on costs and optimization
- ROI calculations for Reserved Instances
- Spot Instance best practices

**Size:** 22KB | **Type:** Cost Analysis

---

## Scripts

### 1. [scripts/deploy.sh](./scripts/deploy.sh)
**Automated deployment script**

**Features:**
- Loads environment variables from `.env`
- Validates required configuration
- Builds TypeScript
- Builds and pushes Docker images to ECR
- Synthesizes CDK templates
- Deploys all stacks with confirmation
- Displays deployment outputs and next steps

**Usage:**
```bash
./scripts/deploy.sh
```

**Size:** 8.1KB | **Type:** Bash Script

---

### 2. [scripts/shutdown.sh](./scripts/shutdown.sh)
**Infrastructure shutdown and cost management script**

**Features:**
- **Scale Mode:** Scales GPU instances to 0 (saves ~$550/month)
- **Destroy Mode:** Completely removes all infrastructure
- Confirmation prompts for safety
- Displays current status and cost impact
- Provides commands to scale back up

**Usage:**
```bash
# Scale GPU to zero (temporary shutdown)
./scripts/shutdown.sh

# Destroy all infrastructure (permanent)
./scripts/shutdown.sh --destroy
```

**Size:** 7.9KB | **Type:** Bash Script

---

## Examples

### 1. [examples/test-api.sh](./examples/test-api.sh)
**Complete API testing suite**

**Features:**
- Retrieves API endpoint from CloudFormation
- Submits sample video generation jobs
- Polls job status with timeout
- Demonstrates JSON parsing with jq
- Provides additional test prompts
- Shows useful AWS CLI commands

**Usage:**
```bash
./examples/test-api.sh
```

**Tests Performed:**
1. Submit video generation job
2. Check job status immediately
3. Poll for completion (up to 5 minutes)
4. Display final results with video URL

**Size:** 9.5KB | **Type:** Bash Script

---

## Quick Start

### First Time Setup
1. Read [README.md](./README.md) - Prerequisites section
2. Create `.env` file with AWS credentials
3. Run `npm install`
4. Run `./scripts/deploy.sh`

### Testing the API
1. Run `./examples/test-api.sh`
2. Or use curl commands from README.md

### Managing Costs
1. Read [COST-NOTES.md](./COST-NOTES.md)
2. Run `./scripts/shutdown.sh` when not in use
3. Set up billing alarms (see README.md)

### Troubleshooting
1. Check README.md - Troubleshooting section
2. View CloudWatch logs
3. Check CloudFormation console for errors

---

## File Structure

```
infra/
├── README.md                    # Main documentation (20KB)
├── COST-NOTES.md               # Cost analysis (22KB)
├── DOCUMENTATION-INDEX.md      # This file
├── .env                        # Environment variables (create this)
├── package.json                # Node.js dependencies
├── cdk.json                    # CDK configuration
├── tsconfig.json               # TypeScript configuration
│
├── bin/
│   └── app.ts                  # CDK app entry point
│
├── lib/
│   ├── storage-stack.ts        # S3 and DynamoDB
│   ├── video-api-stack.ts      # API Gateway and Lambda
│   └── gpu-inference-stack.ts  # ECS/EC2 GPU instances (to be implemented)
│
├── lambda/
│   ├── submit-job/            # Submit job Lambda
│   ├── get-status/            # Get status Lambda
│   ├── process-job/           # Process job Lambda
│   └── shared/                # Shared Lambda code
│
├── container/
│   ├── Dockerfile             # GPU inference container
│   └── app/                   # FastAPI application
│
├── scripts/
│   ├── deploy.sh              # Automated deployment
│   └── shutdown.sh            # Shutdown/destroy infrastructure
│
└── examples/
    └── test-api.sh            # API testing script
```

---

## Documentation Features

### README.md Highlights
- Production-quality documentation
- Complete architecture diagram (ASCII art)
- Step-by-step setup guide
- Example API requests and responses
- Cost summary table
- Debugging commands
- Production checklist

### COST-NOTES.md Highlights
- 4 detailed cost scenarios
- Service-by-service breakdowns
- Optimization strategies with code examples
- ROI calculations
- Spot instance analysis
- FAQ section
- External resource links

### Scripts Features
- Error handling and validation
- Colored output for readability
- Confirmation prompts for destructive actions
- Helpful error messages
- Post-operation summaries
- Useful next steps

---

## Common Tasks

### Deploy Infrastructure
```bash
./scripts/deploy.sh
```

### Test API
```bash
./examples/test-api.sh
```

### Scale Down GPU (Save Money)
```bash
./scripts/shutdown.sh
```

### Scale Up GPU
```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name AiVideo-dev-GpuInference-ASG \
  --desired-capacity 1
```

### View Logs
```bash
aws logs tail /aws/lambda/AiVideo-dev-SubmitJobFunction --follow
```

### Check Costs
```bash
aws ce get-cost-and-usage \
  --time-period Start=2025-12-01,End=2025-12-23 \
  --granularity MONTHLY \
  --metrics BlendedCost
```

### Destroy Everything
```bash
./scripts/shutdown.sh --destroy
```

---

## Additional Resources

### In This Repository
- [AWS-INFERENCE.md](../docs/AWS-INFERENCE.md) - Original infrastructure requirements
- [PRD.md](../docs/PRD.md) - Product requirements document

### AWS Documentation
- [AWS CDK Guide](https://docs.aws.amazon.com/cdk/)
- [API Gateway](https://docs.aws.amazon.com/apigateway/)
- [Lambda](https://docs.aws.amazon.com/lambda/)
- [ECS](https://docs.aws.amazon.com/ecs/)

### Cost Management
- [AWS Pricing Calculator](https://calculator.aws/)
- [Cost Explorer](https://console.aws.amazon.com/cost-management/)
- [Trusted Advisor](https://console.aws.amazon.com/trustedadvisor/)

---

## Support

### Getting Help
1. Check documentation files (README.md, COST-NOTES.md)
2. Review CloudWatch Logs
3. Check CloudFormation console
4. Review AWS service quotas
5. Check AWS service health dashboard

### Common Issues
- **Deployment fails:** Check IAM permissions, service quotas
- **API not working:** Verify stack outputs, check Lambda logs
- **High costs:** Scale down GPU, check billing alarms
- **Jobs not processing:** Check GPU instance status, SQS queue

---

**Last Updated:** 2025-12-23  
**Maintained By:** AI Video Generation Team  
**CDK Version:** 2.114.0
