import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, ListObjectsV2Command, GetObjectCommand, _Object } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BUCKET_NAME = process.env.BUCKET_NAME!;
const UPVOTES_TABLE_NAME = process.env.UPVOTES_TABLE_NAME!;
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

type SortField = 'lastModified' | 'size' | 'key' | 'upvotes';
type SortOrder = 'asc' | 'desc';

interface VideoItem {
  key: string;
  url: string;
  size: number;
  lastModified: string;
  upvotes: number;
  hidden?: boolean;
}

interface VideoMetadata {
  videoKey: string;
  upvotes?: number;
  hidden?: boolean;
}

interface ListVideosResponse {
  videos: VideoItem[];
  nextToken?: string;
  totalCount: number;
}

// Helper to fetch all S3 objects with pagination
async function fetchAllObjects(prefix: string): Promise<_Object[]> {
  const allObjects: _Object[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    });

    const result = await s3Client.send(command);
    if (result.Contents) {
      allObjects.push(...result.Contents);
    }
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);

  return allObjects;
}

// Sort S3 objects based on field and order
function sortObjects(
  objects: _Object[],
  sortField: SortField,
  sortOrder: SortOrder,
  metadataMap?: Map<string, VideoMetadata>
): _Object[] {
  return [...objects].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case 'lastModified':
        comparison = (a.LastModified?.getTime() || 0) - (b.LastModified?.getTime() || 0);
        break;
      case 'size':
        comparison = (a.Size || 0) - (b.Size || 0);
        break;
      case 'key': {
        const aName = a.Key?.split('/').pop() || a.Key || '';
        const bName = b.Key?.split('/').pop() || b.Key || '';
        comparison = aName.localeCompare(bName);
        break;
      }
      case 'upvotes': {
        const aUpvotes = metadataMap?.get(a.Key || '')?.upvotes || 0;
        const bUpvotes = metadataMap?.get(b.Key || '')?.upvotes || 0;
        comparison = aUpvotes - bUpvotes;

        // If upvotes are equal, sort by date (newest first as secondary sort)
        // Apply sortOrder to primary comparison only, secondary is always newest-first
        if (comparison === 0) {
          const dateComparison = (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0);
          return dateComparison;
        }
        break;
      }
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });
}

// Filter objects by search query (matches filename)
function filterBySearch(objects: _Object[], search: string): _Object[] {
  if (!search.trim()) return objects;
  const query = search.toLowerCase();
  return objects.filter(obj => {
    const filename = obj.Key?.split('/').pop() || '';
    return filename.toLowerCase().includes(query);
  });
}

// Batch fetch video metadata (upvotes and hidden status) from DynamoDB
async function fetchVideoMetadata(videoKeys: string[]): Promise<Map<string, VideoMetadata>> {
  const metadataMap = new Map<string, VideoMetadata>();

  if (videoKeys.length === 0) return metadataMap;

  // DynamoDB BatchGetItem has a limit of 100 items per request
  const BATCH_SIZE = 100;

  for (let i = 0; i < videoKeys.length; i += BATCH_SIZE) {
    const batch = videoKeys.slice(i, i + BATCH_SIZE);
    const keys = batch.map(key => ({ videoKey: key }));

    try {
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [UPVOTES_TABLE_NAME]: {
              Keys: keys,
            },
          },
        })
      );

      const items = result.Responses?.[UPVOTES_TABLE_NAME] || [];
      for (const item of items) {
        metadataMap.set(item.videoKey as string, {
          videoKey: item.videoKey as string,
          upvotes: item.upvotes as number | undefined,
          hidden: item.hidden as boolean | undefined,
        });
      }
    } catch (error) {
      console.error('Error fetching metadata batch:', error);
      // Continue with defaults for failed batch
    }
  }

  return metadataMap;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('List videos request:', JSON.stringify(event));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // Parse query parameters
    const pageSize = parseInt(event.queryStringParameters?.pageSize || '24', 10);
    const page = parseInt(event.queryStringParameters?.page || '1', 10);
    const search = event.queryStringParameters?.search || '';
    const sortField = (event.queryStringParameters?.sortField || 'lastModified') as SortField;
    const sortOrder = (event.queryStringParameters?.sortOrder || 'desc') as SortOrder;

    // Fetch all objects from S3
    const allObjects = await fetchAllObjects('generated-videos/');

    // Filter to only .mp4 files and exclude folder markers
    let videoObjects = allObjects.filter(obj =>
      obj.Key && !obj.Key.endsWith('/') && obj.Key.endsWith('.mp4')
    );

    // Apply search filter
    videoObjects = filterBySearch(videoObjects, search);

    // Fetch metadata for all filtered videos (upvotes and hidden status)
    const allVideoKeys = videoObjects.map(obj => obj.Key!);
    const metadataMap = await fetchVideoMetadata(allVideoKeys);

    // Filter out hidden videos
    videoObjects = videoObjects.filter(obj => {
      const metadata = metadataMap.get(obj.Key!);
      return !metadata?.hidden;
    });

    // Get total count after filtering hidden
    const totalCount = videoObjects.length;

    // Apply sorting (pass metadataMap for upvotes sort)
    videoObjects = sortObjects(videoObjects, sortField, sortOrder, metadataMap);

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const paginatedObjects = videoObjects.slice(startIndex, startIndex + pageSize);

    // Generate presigned URLs for paginated results
    const videos: VideoItem[] = [];
    for (const object of paginatedObjects) {
      const presignedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: object.Key!,
        }),
        { expiresIn: PRESIGNED_URL_EXPIRY }
      );

      const metadata = metadataMap.get(object.Key!);
      videos.push({
        key: object.Key!,
        url: presignedUrl,
        size: object.Size || 0,
        lastModified: object.LastModified?.toISOString() || '',
        upvotes: metadata?.upvotes || 0,
      });
    }

    const hasMore = startIndex + pageSize < totalCount;
    const response: ListVideosResponse = {
      videos,
      nextToken: hasMore ? String(page + 1) : undefined,
      totalCount,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error listing videos:', error);

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
