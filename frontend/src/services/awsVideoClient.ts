/**
 * AWS Video Generation API Client
 *
 * Connects to the deployed AWS API Gateway for video generation jobs.
 * Uses SQS-backed queue processing with DynamoDB for job tracking.
 */

export interface SubmitJobRequest {
  prompt: string;
  seed?: number;
  steps?: number;
  duration?: number;
  model?: string;  // NEW: "hunyuan-video" or "ltx-video"
}

export interface SubmitJobResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface GetStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const getAwsConfig = () => {
  const endpoint = import.meta.env.VITE_AWS_VIDEO_API_ENDPOINT;
  const apiKey = import.meta.env.VITE_AWS_VIDEO_API_KEY;

  if (!endpoint || !apiKey) {
    return null;
  }

  return { endpoint, apiKey };
};

export function isAwsApiConfigured(): boolean {
  return getAwsConfig() !== null;
}

export class AwsVideoClient {
  private endpoint: string;
  private apiKey: string;

  constructor() {
    const config = getAwsConfig();
    if (!config) {
      throw new Error(
        'AWS Video API is not configured. Please set VITE_AWS_VIDEO_API_ENDPOINT and VITE_AWS_VIDEO_API_KEY in your .env.local file.'
      );
    }
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
    };
  }

  async submitJob(request: SubmitJobRequest): Promise<SubmitJobResponse> {
    const response = await fetch(`${this.endpoint}/generate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit job: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getJobStatus(jobId: string): Promise<GetStatusResponse> {
    const response = await fetch(`${this.endpoint}/status/${jobId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get job status: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async pollJobUntilComplete(
    jobId: string,
    options: {
      maxAttempts?: number;
      pollInterval?: number;
      onStatusChange?: (status: GetStatusResponse) => void;
    } = {}
  ): Promise<GetStatusResponse> {
    const {
      maxAttempts = 120, // 10 minutes with 5s interval
      pollInterval = 5000,
      onStatusChange,
    } = options;

    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getJobStatus(jobId);

      if (onStatusChange) {
        onStatusChange(status);
      }

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Video generation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      attempts++;
    }

    throw new Error('Job polling timed out');
  }
}

// Singleton instance (lazy-loaded)
let awsVideoClientInstance: AwsVideoClient | null = null;

export function getAwsVideoClient(): AwsVideoClient {
  if (!awsVideoClientInstance) {
    awsVideoClientInstance = new AwsVideoClient();
  }
  return awsVideoClientInstance;
}
