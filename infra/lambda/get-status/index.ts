import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { VideoJob, GetStatusResponse } from '../shared/types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

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
    // Get jobId from path parameters
    const jobId = event.pathParameters?.jobId;

    if (!jobId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'jobId is required in path' }),
      };
    }

    // Validate jobId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid jobId format' }),
      };
    }

    // Query DynamoDB for job
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { jobId },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Job not found' }),
      };
    }

    const job = result.Item as VideoJob;

    // Build response
    const response: GetStatusResponse = {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    // If completed, generate presigned URL
    if (job.status === 'completed' && job.videoUrl) {
      try {
        // Extract S3 key from videoUrl (assuming format: s3://bucket/key or just the key)
        let s3Key: string;
        if (job.videoUrl.startsWith('s3://')) {
          // Parse s3://bucket/key format
          const s3Url = new URL(job.videoUrl);
          s3Key = s3Url.pathname.substring(1); // Remove leading slash
        } else if (job.videoUrl.startsWith('http')) {
          // If it's already a presigned URL or public URL, return as-is
          response.videoUrl = job.videoUrl;
        } else {
          // Assume it's just the key
          s3Key = job.videoUrl;
        }

        // Generate presigned URL if we have an S3 key
        if (s3Key) {
          const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
          });

          const presignedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: PRESIGNED_URL_EXPIRY,
          });

          response.videoUrl = presignedUrl;
        }
      } catch (error) {
        console.error('Error generating presigned URL:', error);
        // Still return the response but without videoUrl
        response.error = 'Failed to generate video URL';
      }
    }

    // Include error if job failed
    if (job.status === 'failed' && job.error) {
      response.error = job.error;
    }

    return {
      statusCode: 200,
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
