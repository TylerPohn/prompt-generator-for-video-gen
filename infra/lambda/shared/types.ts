export interface VideoJobRequest {
  prompt: string;
  seed?: number;
  steps?: number;
  duration?: number;
  model?: string;  // "hunyuan-video" or "ltx-video"
  image_url?: string;  // S3 URL for LTX image-to-video
}

export interface VideoJob {
  jobId: string;
  prompt: string;
  model: string;     // Model name ("hunyuan-video" or "ltx-video")
  seed?: number;
  steps?: number;
  duration?: number;
  status: JobStatus;
  createdAt: number;  // Timestamp in milliseconds for GSI
  updatedAt: string;  // ISO string for human readability
  videoUrl?: string;
  error?: string;
  image_url?: string;  // S3 URL for LTX image-to-video
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SubmitJobResponse {
  jobId: string;
  status: JobStatus;
}

export interface GetStatusResponse {
  jobId: string;
  status: JobStatus;
  videoUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: string;
}

export interface SQSJobMessage {
  jobId: string;
  prompt: string;
  model: string;     // Model name
  seed?: number;
  steps?: number;
  duration?: number;
  image_url?: string;  // S3 URL for LTX image-to-video
}

export interface FastAPIRequest {
  prompt: string;
  model: string;     // Model name
  seed?: number;
  steps?: number;
  duration?: number;
  image_url?: string;  // S3 URL for LTX image-to-video
}

export interface FastAPIResponse {
  video_url: string;
  generation_time: number;
}

export interface VideoItem {
  key: string;
  url: string;
  size: number;
  lastModified: string;
}

export interface ListVideosResponse {
  videos: VideoItem[];
  nextToken?: string;
  totalCount: number;
}
