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

interface UpvoteRequest {
  videoKey: string;
  action: 'increment' | 'decrement';
}

interface UpvoteResponse {
  videoKey: string;
  upvotes: number;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Upvote request:', JSON.stringify(event));

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

    let requestBody: UpvoteRequest;
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

    if (!requestBody.action || !['increment', 'decrement'].includes(requestBody.action)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'action must be "increment" or "decrement"' }),
      };
    }

    const incrementValue = requestBody.action === 'increment' ? 1 : -1;

    // Atomic update with floor at 0
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { videoKey: requestBody.videoKey },
        UpdateExpression: 'SET upvotes = if_not_exists(upvotes, :zero) + :inc',
        ConditionExpression: 'attribute_not_exists(upvotes) OR upvotes >= :minCheck',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':inc': incrementValue,
          ':minCheck': requestBody.action === 'decrement' ? 1 : 0,
        },
        ReturnValues: 'UPDATED_NEW',
      })
    );

    const newUpvotes = (result.Attributes?.upvotes as number) || 0;

    const response: UpvoteResponse = {
      videoKey: requestBody.videoKey,
      upvotes: Math.max(0, newUpvotes), // Ensure non-negative
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (error) {
    // Handle condition check failure (trying to decrement below 0)
    if ((error as Error).name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          videoKey: JSON.parse(event.body!).videoKey,
          upvotes: 0,
        }),
      };
    }

    console.error('Error processing upvote:', error);

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
