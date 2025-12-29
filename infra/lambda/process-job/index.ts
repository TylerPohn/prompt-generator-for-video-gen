import { SQSEvent, SQSRecord } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SQSJobMessage } from '../shared/types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new SSMClient({});

const TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const GPU_ENDPOINT_PARAM = process.env.GPU_ENDPOINT_PARAM!;

// Cache the GPU endpoint to avoid repeated SSM calls
let cachedGpuEndpoint: string | null = null;

async function getGpuEndpoint(): Promise<string> {
  if (cachedGpuEndpoint) {
    return cachedGpuEndpoint;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: GPU_ENDPOINT_PARAM,
    })
  );

  if (!response.Parameter?.Value) {
    throw new Error('GPU endpoint not configured in SSM');
  }

  cachedGpuEndpoint = response.Parameter.Value;
  console.log(`GPU endpoint from SSM: ${cachedGpuEndpoint}`);
  return cachedGpuEndpoint;
}

interface FastAPIGenerateRequest {
  prompt: string;
  model: string;       // NEW: model name
  job_id: string;
  bucket_name: string;
  seed?: number;
  steps?: number;
  duration?: number;
  width?: number;      // Video width
  height?: number;     // Video height
}

interface FastAPIGenerateResponse {
  status: string;
  video_key?: string;
  job_id: string;
  message?: string;
  generation_time_seconds?: number;
}

async function updateJobStatus(
  jobId: string,
  status: 'processing' | 'completed' | 'failed',
  videoUrl?: string,
  error?: string
): Promise<void> {
  const now = new Date().toISOString();

  const updateExpression: string[] = ['#status = :status', '#updatedAt = :updatedAt'];
  const expressionAttributeNames: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  };
  const expressionAttributeValues: Record<string, any> = {
    ':status': status,
    ':updatedAt': now,
  };

  if (videoUrl) {
    updateExpression.push('#videoUrl = :videoUrl');
    expressionAttributeNames['#videoUrl'] = 'videoUrl';
    expressionAttributeValues[':videoUrl'] = videoUrl;
  }

  if (error) {
    updateExpression.push('#error = :error');
    expressionAttributeNames['#error'] = 'error';
    expressionAttributeValues[':error'] = error;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { jobId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  console.log(`Updated job ${jobId} to status: ${status}`);
}

async function generateVideoWithGpu(
  jobId: string,
  prompt: string,
  model: string,       // NEW: model parameter
  seed?: number,
  steps?: number,
  duration?: number
): Promise<string> {
  const gpuEndpoint = await getGpuEndpoint();

  const requestBody: FastAPIGenerateRequest = {
    prompt,
    model,              // NEW: include model in request
    job_id: jobId,
    bucket_name: BUCKET_NAME,
    seed,
    steps: steps || 30,
    duration: duration || 3,
    width: 288,         // Reduced from 360 to 288 for 9:16 aspect ratio (GPU memory constraints)
    height: 512,        // Reduced from 640 to 512 for 9:16 aspect ratio (GPU memory constraints)
  };

  console.log(`Calling GPU endpoint: ${gpuEndpoint}/generate with model: ${model}`);
  console.log(`Request body: ${JSON.stringify(requestBody)}`);

  const response = await fetch(`${gpuEndpoint}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GPU API error: ${response.status} - ${errorText}`);
  }

  const data: FastAPIGenerateResponse = await response.json();
  console.log(`GPU response: ${JSON.stringify(data)}`);

  if (data.status !== 'completed' || !data.video_key) {
    throw new Error(data.message || 'Video generation failed');
  }

  console.log(`Video generated in ${data.generation_time_seconds}s: ${data.video_key}`);
  return data.video_key;
}

async function processRecord(record: SQSRecord): Promise<void> {
  let jobId: string | undefined;

  try {
    // Parse SQS message
    const message: SQSJobMessage = JSON.parse(record.body);
    jobId = message.jobId;
    const { prompt, model, seed, steps, duration } = message;

    console.log(`Processing job ${jobId} with model: ${model}, prompt: ${prompt.substring(0, 100)}...`);

    // Update status to processing
    await updateJobStatus(jobId, 'processing');

    // Generate video using GPU
    const videoKey = await generateVideoWithGpu(jobId, prompt, model, seed, steps, duration);

    // Update status to completed with video key
    await updateJobStatus(jobId, 'completed', videoKey);

    console.log(`Successfully completed job ${jobId}`);
  } catch (error) {
    console.error('Error processing record:', error);

    if (jobId) {
      await updateJobStatus(
        jobId,
        'failed',
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    throw error; // Let SQS retry based on queue config
  }
}

export const handler = async (event: SQSEvent): Promise<void> => {
  console.log('Received SQS event with', event.Records.length, 'records');
  console.log(`GPU Endpoint Param: ${GPU_ENDPOINT_PARAM}`);

  // Process records sequentially to avoid overloading GPU
  for (const record of event.Records) {
    await processRecord(record);
  }
};
