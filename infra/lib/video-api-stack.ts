import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { StorageStack } from './storage-stack';
import { GpuInferenceStack } from './gpu-inference-stack';
import * as path from 'path';

export interface VideoApiStackProps extends cdk.StackProps {
  storageStack: StorageStack;
  gpuInferenceStack: GpuInferenceStack;
}

export class VideoApiStack extends cdk.Stack {
  public readonly jobQueue: sqs.Queue;
  public readonly jobTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: VideoApiStackProps) {
    super(scope, id, props);

    // Get video bucket from storage stack
    const videoBucket = props.storageStack.videoBucket;
    const videoBucketName = videoBucket.bucketName;

    // DLQ for failed jobs
    const deadLetterQueue = new sqs.Queue(this, 'VideoJobDLQ', {
      queueName: 'video-generation-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Main SQS Queue for video generation jobs
    this.jobQueue = new sqs.Queue(this, 'VideoJobQueue', {
      queueName: 'video-generation-queue',
      visibilityTimeout: cdk.Duration.seconds(900), // 15 minutes (matches Lambda timeout)
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3, // Retry failed jobs 3 times before sending to DLQ
      },
    });

    // DynamoDB Table for job status tracking
    this.jobTable = new dynamodb.Table(this, 'VideoJobTable', {
      tableName: 'video-jobs',
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep job history
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'ttl', // Optional: auto-delete old jobs
    });

    // Add GSI for querying jobs by status
    this.jobTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    // Lambda: Submit Job (NodejsFunction handles TypeScript compilation)
    const submitJobLambda = new NodejsFunction(this, 'SubmitJobFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../lambda/submit-job/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        JOBS_TABLE_NAME: this.jobTable.tableName,
        QUEUE_URL: this.jobQueue.queueUrl,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant permissions to submit job Lambda
    this.jobTable.grantWriteData(submitJobLambda);
    this.jobQueue.grantSendMessages(submitJobLambda);

    // Lambda: Get Status (NodejsFunction handles TypeScript compilation)
    const getStatusLambda = new NodejsFunction(this, 'GetStatusFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../lambda/get-status/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      environment: {
        JOBS_TABLE_NAME: this.jobTable.tableName,
        BUCKET_NAME: videoBucketName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant permissions to get status Lambda
    this.jobTable.grantReadData(getStatusLambda);

    // Grant S3 access for presigned URLs
    videoBucket.grantRead(getStatusLambda);

    // SSM Parameter to store GPU endpoint (updated by start-gpu.sh script)
    const gpuEndpointParam = new ssm.StringParameter(this, 'GpuEndpointParam', {
      parameterName: '/video-generation/gpu-endpoint',
      stringValue: 'http://placeholder:8000', // Updated by start-gpu.sh
      description: 'GPU inference server endpoint',
    });

    // Security Group for ProcessJob Lambda
    // Note: GPU security group already allows traffic from entire VPC CIDR on port 8000
    const processJobSecurityGroup = new ec2.SecurityGroup(this, 'ProcessJobSecurityGroup', {
      vpc: props.gpuInferenceStack.vpc,
      description: 'Security group for ProcessJob Lambda to access GPU',
      allowAllOutbound: true,
    });

    // Lambda: Process Job (SQS consumer - calls GPU FastAPI)
    // Don't specify subnets - let CDK choose from available subnets in default VPC
    const processJobLambda = new NodejsFunction(this, 'ProcessJobFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../lambda/process-job/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15), // 15 minutes max (AWS Lambda limit) for polling
      memorySize: 512,
      vpc: props.gpuInferenceStack.vpc,
      securityGroups: [processJobSecurityGroup],
      allowPublicSubnet: true, // Allow Lambda in public subnets (default VPC only has public)
      environment: {
        JOBS_TABLE_NAME: this.jobTable.tableName,
        BUCKET_NAME: videoBucketName,
        GPU_ENDPOINT_PARAM: gpuEndpointParam.parameterName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant Lambda permission to read SSM parameter
    gpuEndpointParam.grantRead(processJobLambda);

    // Grant permissions to process job Lambda
    this.jobTable.grantReadWriteData(processJobLambda);
    videoBucket.grantReadWrite(processJobLambda);

    // Connect SQS queue to process job Lambda
    processJobLambda.addEventSource(
      new SqsEventSource(this.jobQueue, {
        batchSize: 1, // Process one video at a time
        maxConcurrency: 2, // Limit concurrent executions
      })
    );

    // API Gateway
    this.api = new apigateway.RestApi(this, 'VideoGenerationApi', {
      restApiName: 'Video Generation API',
      description: 'API for async video generation jobs',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
    });

    // API Key (optional authentication)
    const apiKey = this.api.addApiKey('VideoApiKey', {
      apiKeyName: 'video-generation-api-key',
      description: 'API Key for video generation service',
    });

    // Usage Plan
    const usagePlan = this.api.addUsagePlan('VideoApiUsagePlan', {
      name: 'Standard Usage Plan',
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.MONTH,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: this.api.deploymentStage,
    });

    // POST /generate endpoint
    const generateResource = this.api.root.addResource('generate');
    const generateIntegration = new apigateway.LambdaIntegration(submitJobLambda, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    generateResource.addMethod('POST', generateIntegration, {
      apiKeyRequired: false, // Set to true to require API key
      requestValidator: new apigateway.RequestValidator(this, 'GenerateRequestValidator', {
        restApi: this.api,
        validateRequestBody: true,
        validateRequestParameters: false,
      }),
      requestModels: {
        'application/json': new apigateway.Model(this, 'GenerateRequestModel', {
          restApi: this.api,
          contentType: 'application/json',
          modelName: 'GenerateRequest',
          schema: {
            type: apigateway.JsonSchemaType.OBJECT,
            required: ['prompt'],
            properties: {
              prompt: {
                type: apigateway.JsonSchemaType.STRING,
                minLength: 1,
                maxLength: 5000,
              },
              parameters: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                  duration: { type: apigateway.JsonSchemaType.NUMBER },
                  aspectRatio: { type: apigateway.JsonSchemaType.STRING },
                  style: { type: apigateway.JsonSchemaType.STRING },
                },
              },
            },
          },
        }),
      },
    });

    // GET /status/{jobId} endpoint
    const statusResource = this.api.root.addResource('status');
    const jobIdResource = statusResource.addResource('{jobId}');
    const statusIntegration = new apigateway.LambdaIntegration(getStatusLambda);

    jobIdResource.addMethod('GET', statusIntegration, {
      apiKeyRequired: false, // Set to true to require API key
      requestParameters: {
        'method.request.path.jobId': true,
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID (retrieve value from console)',
    });

    new cdk.CfnOutput(this, 'JobQueueUrl', {
      value: this.jobQueue.queueUrl,
      description: 'SQS Queue URL for video generation jobs',
    });

    new cdk.CfnOutput(this, 'JobTableName', {
      value: this.jobTable.tableName,
      description: 'DynamoDB table name for job tracking',
    });

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: deadLetterQueue.queueUrl,
      description: 'Dead Letter Queue URL for failed jobs',
    });
  }
}
