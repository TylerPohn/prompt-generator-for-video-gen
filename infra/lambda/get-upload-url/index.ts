import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,X-Amz-Date,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
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

    let body: { contentType?: string; fileExtension?: string };
    try {
      body = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    const { contentType, fileExtension } = body;

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!contentType || !allowedTypes.includes(contentType)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid content type. Allowed: image/jpeg, image/png, image/webp' }),
      };
    }

    // Generate unique key for the image
    const imageId = randomUUID();
    const extension = fileExtension || contentType.split('/')[1];
    const key = `inputs/${imageId}.${extension}`;

    console.log(`Generating presigned URL for key: ${key}, contentType: ${contentType}`);

    // Generate presigned URL (5 minute expiry)
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // Construct the final S3 URL that will be used in the job request
    const s3Url = `s3://${BUCKET_NAME}/${key}`;

    console.log(`Generated presigned URL for s3Url: ${s3Url}`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        uploadUrl,
        s3Url,
        key,
        expiresIn: 300,
      }),
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Failed to generate upload URL',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
