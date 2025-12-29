#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { GpuInferenceStack } from '../lib/gpu-inference-stack';
import { VideoApiStack } from '../lib/video-api-stack';

const app = new cdk.App();

// Use environment account/region from AWS credentials (no hardcoding needed)
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
};

const environment = process.env.ENVIRONMENT || 'dev';
const stackPrefix = `AiVideo-${environment}`;

// Storage Stack - S3 bucket for videos
const storageStack = new StorageStack(app, `${stackPrefix}-Storage`, {
  env,
  description: 'S3 storage for AI video generation',
});

// GPU Inference Stack - EC2 with GPU (uses default VPC)
const gpuInferenceStack = new GpuInferenceStack(app, `${stackPrefix}-GpuInference`, {
  env,
  description: 'GPU inference infrastructure (EC2 g5.xlarge)',
});

// Video API Stack - API Gateway, Lambda, SQS, DynamoDB
const videoApiStack = new VideoApiStack(app, `${stackPrefix}-VideoApi`, {
  env,
  description: 'REST API for video generation',
  storageStack,
  gpuInferenceStack,
});

// Dependencies
gpuInferenceStack.addDependency(storageStack);
videoApiStack.addDependency(storageStack);
videoApiStack.addDependency(gpuInferenceStack);

// Tags
const tags = {
  Project: 'AI-Video-Generation',
  Environment: environment,
  ManagedBy: 'CDK',
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(storageStack).add(key, value);
  cdk.Tags.of(gpuInferenceStack).add(key, value);
  cdk.Tags.of(videoApiStack).add(key, value);
});

app.synth();
