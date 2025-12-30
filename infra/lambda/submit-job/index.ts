import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import { VideoJobRequest, VideoJob, SubmitJobResponse, SQSJobMessage } from '../shared/types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});

const TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const QUEUE_URL = process.env.QUEUE_URL!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};

interface ValidationError {
  field: string;
  message: string;
}

function validateRequest(body: any): { valid: boolean; errors?: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    errors.push({ field: 'prompt', message: 'Prompt is required and must be a non-empty string' });
  }

  if (body.prompt && body.prompt.length > 1000) {
    errors.push({ field: 'prompt', message: 'Prompt must be less than 1000 characters' });
  }

  if (body.seed !== undefined) {
    if (typeof body.seed !== 'number' || !Number.isInteger(body.seed) || body.seed < 0) {
      errors.push({ field: 'seed', message: 'Seed must be a non-negative integer' });
    }
  }

  if (body.steps !== undefined) {
    if (typeof body.steps !== 'number' || !Number.isInteger(body.steps) || body.steps < 1 || body.steps > 100) {
      errors.push({ field: 'steps', message: 'Steps must be an integer between 1 and 100' });
    }
  }

  if (body.duration !== undefined) {
    if (typeof body.duration !== 'number' || body.duration < 1 || body.duration > 10) {
      errors.push({ field: 'duration', message: 'Duration must be a number between 1 and 10 seconds' });
    }
  }

  // Validate image_url only allowed for ltx-video
  if (body.image_url !== undefined) {
    const model = body.model || 'hunyuan-video';
    if (model !== 'ltx-video') {
      errors.push({ field: 'image_url', message: 'image_url is only supported for ltx-video model' });
    }
    if (typeof body.image_url !== 'string' || !body.image_url.startsWith('s3://')) {
      errors.push({ field: 'image_url', message: 'image_url must be a valid S3 URL (s3://bucket/key)' });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    let requestBody: VideoJobRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    // Validate request
    const validation = validateRequest(requestBody);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Validation failed', details: validation.errors }),
      };
    }

    // Generate job ID
    const jobId = randomUUID();
    const now = Date.now(); // Store as number for GSI compatibility
    const nowIso = new Date().toISOString();
    const model = requestBody.model || 'hunyuan-video';  // Default to Hunyuan

    // Create job record
    const job: VideoJob = {
      jobId,
      prompt: requestBody.prompt.trim(),
      model,
      seed: requestBody.seed,
      steps: requestBody.steps,
      duration: requestBody.duration,
      image_url: requestBody.image_url,
      status: 'pending',
      createdAt: now,
      updatedAt: nowIso,
    };

    // Store in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: job,
      })
    );

    console.log('Job stored in DynamoDB:', jobId, 'model:', model);

    // Send message to SQS
    const sqsMessage: SQSJobMessage = {
      jobId,
      prompt: job.prompt,
      model,
      seed: job.seed,
      steps: job.steps,
      duration: job.duration,
      image_url: job.image_url,
    };

    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(sqsMessage),
        MessageAttributes: {
          jobId: {
            DataType: 'String',
            StringValue: jobId,
          },
        },
      })
    );

    console.log('Message sent to SQS for job:', jobId);

    // Return response
    const response: SubmitJobResponse = {
      jobId,
      status: 'pending',
    };

    return {
      statusCode: 202,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error processing request:', error);

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
