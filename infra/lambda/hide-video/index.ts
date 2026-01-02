import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.UPVOTES_TABLE_NAME!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};

interface HideVideoRequest {
  videoKey: string;
  hidden: boolean;
}

interface HideVideoResponse {
  videoKey: string;
  hidden: boolean;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Hide video request:', JSON.stringify(event));

  // Handle CORS preflight
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

    let requestBody: HideVideoRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    // Validate request
    if (!requestBody.videoKey || typeof requestBody.videoKey !== 'string') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'videoKey is required and must be a string' }),
      };
    }

    if (typeof requestBody.hidden !== 'boolean') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'hidden must be a boolean' }),
      };
    }

    // Update the hidden field in DynamoDB
    // Note: "hidden" is a reserved keyword in DynamoDB, so we use #hidden as an alias
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { videoKey: requestBody.videoKey },
        UpdateExpression: 'SET #hidden = :hidden',
        ExpressionAttributeNames: {
          '#hidden': 'hidden',
        },
        ExpressionAttributeValues: {
          ':hidden': requestBody.hidden,
        },
      })
    );

    const response: HideVideoResponse = {
      videoKey: requestBody.videoKey,
      hidden: requestBody.hidden,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error hiding video:', error);

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
