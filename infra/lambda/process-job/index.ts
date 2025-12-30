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

// Cache the GPU endpoint to avoid repeated SSM calls (cache cleared on Lambda cold start)
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
  model: string;
  job_id: string;
  bucket_name: string;
  seed?: number;
  steps?: number;
  duration?: number;
  width?: number;
  height?: number;
  image_url?: string;  // S3 URL for LTX image-to-video
}

interface FastAPIGenerateResponse {
  status: string;
  job_id: string;
  message: string;
}

interface FastAPIStatusResponse {
  status: string;  // 'accepted', 'processing', 'completed', 'failed'
  job_id: string;
  video_key?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
  generation_time_seconds?: number;
  message?: string;
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
  model: string,
  seed?: number,
  steps?: number,
  duration?: number,
  imageUrl?: string
): Promise<string> {
  const gpuEndpoint = await getGpuEndpoint();

  const requestBody: FastAPIGenerateRequest = {
    prompt,
    model,
    job_id: jobId,
    bucket_name: BUCKET_NAME,
    seed,
    steps: steps || 30,
    duration: duration || 3,
    width: 288,
    height: 512,
    image_url: imageUrl,
  };

  console.log(`Calling GPU endpoint: ${gpuEndpoint}/generate with model: ${model}`);
  console.log(`Request body: ${JSON.stringify(requestBody)}`);

  // Step 1: Submit job (returns immediately)
  const submitResponse = await fetch(`${gpuEndpoint}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`GPU API error: ${submitResponse.status} - ${errorText}`);
  }

  const submitData: FastAPIGenerateResponse = await submitResponse.json();
  console.log(`Job accepted: ${JSON.stringify(submitData)}`);

  if (submitData.status !== 'accepted') {
    throw new Error(submitData.message || 'Job not accepted by GPU');
  }

  // Step 2: Poll for status until completed or failed
  const pollIntervalMs = 15000; // Poll every 15 seconds
  const maxPollingTimeMs = 12 * 60 * 1000; // 12 minutes (Lambda has 15 min max)
  const startTime = Date.now();

  while (true) {
    // Check if we've exceeded max polling time
    if (Date.now() - startTime > maxPollingTimeMs) {
      throw new Error('Video generation timed out after 12 minutes');
    }

    // Wait before polling (except for first check)
    if (Date.now() - startTime > 0) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Poll status endpoint
    console.log(`Polling status for job ${jobId}...`);
    const statusResponse = await fetch(`${gpuEndpoint}/status/${jobId}`);

    if (!statusResponse.ok) {
      if (statusResponse.status === 404) {
        throw new Error(`Job ${jobId} not found on GPU server`);
      }
      const errorText = await statusResponse.text();
      throw new Error(`Status API error: ${statusResponse.status} - ${errorText}`);
    }

    const statusData: FastAPIStatusResponse = await statusResponse.json();
    console.log(`Status: ${statusData.status}, message: ${statusData.message}`);

    // Check if completed
    if (statusData.status === 'completed') {
      if (!statusData.video_key) {
        throw new Error('Job completed but no video_key provided');
      }
      console.log(`Video generated in ${statusData.generation_time_seconds}s: ${statusData.video_key}`);
      return statusData.video_key;
    }

    // Check if failed
    if (statusData.status === 'failed') {
      throw new Error(statusData.error || statusData.message || 'Video generation failed');
    }

    // Still processing, continue polling
    console.log(`Job still ${statusData.status}, continuing to poll...`);
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  let jobId: string | undefined;

  try {
    // Parse SQS message
    const message: SQSJobMessage = JSON.parse(record.body);
    jobId = message.jobId;
    const { prompt, model, seed, steps, duration, image_url } = message;

    console.log(`Processing job ${jobId} with model: ${model}, prompt: ${prompt.substring(0, 100)}...`);
    if (image_url) {
      console.log(`Using input image: ${image_url}`);
    }

    // Update status to processing
    await updateJobStatus(jobId, 'processing');

    // Generate video using GPU
    const videoKey = await generateVideoWithGpu(jobId, prompt, model, seed, steps, duration, image_url);

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
