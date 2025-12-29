# Lambda Functions Directory Structure

```
infra/lambda/
├── README.md                    # Main documentation
├── API_EXAMPLES.md              # API usage examples
├── TESTING.md                   # Testing guide
├── STRUCTURE.md                 # This file
│
├── package.json                 # Dependencies and build scripts
├── tsconfig.json                # TypeScript configuration
├── esbuild.config.js            # Build configuration
├── .gitignore                   # Git ignore rules
├── .env.example                 # Environment variable template
│
├── shared/                      # Shared code
│   └── types.ts                 # TypeScript type definitions (55 lines)
│
├── submit-job/                  # POST /generate endpoint
│   └── index.ts                 # Lambda handler (178 lines)
│
├── get-status/                  # GET /status/{jobId} endpoint
│   └── index.ts                 # Lambda handler (142 lines)
│
├── process-job/                 # SQS-triggered processor
│   └── index.ts                 # Lambda handler (189 lines)
│
└── scripts/
    └── deploy.sh                # Deployment helper script
```

## File Descriptions

### Core Lambda Functions

1. **submit-job/index.ts** (178 lines)
   - API Gateway handler for POST /generate
   - Request validation
   - DynamoDB storage
   - SQS message publishing
   - CORS support
   - Error handling

2. **get-status/index.ts** (142 lines)
   - API Gateway handler for GET /status/{jobId}
   - DynamoDB query
   - S3 presigned URL generation
   - UUID validation
   - 404 handling
   - CORS support

3. **process-job/index.ts** (189 lines)
   - SQS event handler
   - GPU FastAPI integration
   - Video upload to S3
   - Status updates in DynamoDB
   - Error handling and retry logic

### Shared Code

4. **shared/types.ts** (55 lines)
   - VideoJobRequest interface
   - VideoJob interface
   - JobStatus type
   - SQS message types
   - FastAPI types
   - Response types

### Configuration Files

5. **package.json**
   - Dependencies (AWS SDK v3)
   - Build scripts
   - Node.js 20 requirement
   - esbuild integration

6. **tsconfig.json**
   - TypeScript compiler options
   - ES2022 target
   - Strict mode enabled
   - Node module resolution

7. **esbuild.config.js**
   - Build configuration
   - Bundle optimization
   - External dependencies (AWS SDK)
   - Multi-function build

### Documentation

8. **README.md**
   - Overview and features
   - Build instructions
   - Deployment guide
   - Environment variables

9. **API_EXAMPLES.md**
   - cURL examples
   - JavaScript/TypeScript examples
   - Python examples
   - Error responses
   - Complete workflows

10. **TESTING.md**
    - Local testing with SAM
    - LocalStack setup
    - Unit testing with Jest
    - Integration testing
    - Load testing
    - Monitoring and debugging

### Utilities

11. **scripts/deploy.sh**
    - Automated build and deployment
    - Type checking
    - Artifact verification

12. **.env.example**
    - Environment variable template
    - Required configuration values

13. **.gitignore**
    - Ignore node_modules
    - Ignore build artifacts
    - Ignore environment files

## Build Artifacts (Generated)

After running `npm run build`, the following structure is created:

```
dist/
├── submit-job/
│   └── index.js             # Bundled Lambda code
├── get-status/
│   └── index.js             # Bundled Lambda code
└── process-job/
    └── index.js             # Bundled Lambda code
```

## Dependencies

### Production Dependencies
- `@aws-sdk/client-dynamodb` - DynamoDB client
- `@aws-sdk/lib-dynamodb` - DynamoDB document client
- `@aws-sdk/client-s3` - S3 client
- `@aws-sdk/s3-request-presigner` - S3 presigned URLs
- `@aws-sdk/client-sqs` - SQS client

### Development Dependencies
- `@types/aws-lambda` - Lambda type definitions
- `@types/node` - Node.js type definitions
- `esbuild` - Fast bundler
- `typescript` - TypeScript compiler

## Key Features

### Security
- Input validation on all endpoints
- UUID format validation
- Request size limits
- CORS configuration
- Presigned URLs with expiry

### Reliability
- Error handling and logging
- SQS retry mechanism
- Status tracking in DynamoDB
- Failed job recording

### Performance
- Bundled with esbuild (fast builds)
- Minimal bundle sizes (AWS SDK excluded)
- Node.js 20 runtime
- Efficient DynamoDB queries

### Monitoring
- Structured logging
- CloudWatch integration
- Error tracking
- Status transitions

## Environment Variables

Each Lambda requires specific environment variables:

| Lambda | Variables |
|--------|-----------|
| submit-job | JOBS_TABLE_NAME, QUEUE_URL |
| get-status | JOBS_TABLE_NAME, BUCKET_NAME |
| process-job | JOBS_TABLE_NAME, BUCKET_NAME, GPU_ENDPOINT |

## Total Lines of Code

- TypeScript: 564 lines
- Documentation: ~800 lines
- Configuration: ~150 lines
- **Total: ~1,514 lines**

## Next Steps

1. Install dependencies: `npm install`
2. Build functions: `npm run build`
3. Deploy with CDK: `cd ../cdk && cdk deploy`
4. Test endpoints using API_EXAMPLES.md
5. Monitor with CloudWatch

## CDK Integration

These Lambda functions are designed to be deployed via AWS CDK. The CDK stack should:

1. Create IAM roles with appropriate permissions
2. Set environment variables
3. Configure VPC for process-job (to reach GPU instance)
4. Set up API Gateway routes
5. Configure SQS trigger
6. Enable CloudWatch logging
