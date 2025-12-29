export interface VideoJobRequest {
  prompt: string;
  seed?: number;
  steps?: number;
  duration?: number;
  model?: string;  // NEW: "hunyuan-video" or "ltx-video"
}

export interface VideoJob {
  jobId: string;
  prompt: string;
  model: string;     // NEW: model name ("hunyuan-video" or "ltx-video")
  seed?: number;
  steps?: number;
  duration?: number;
  status: JobStatus;
  createdAt: number;  // Timestamp in milliseconds for GSI
  updatedAt: string;  // ISO string for human readability
  videoUrl?: string;
  error?: string;
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
  model: string;     // NEW: model name
  seed?: number;
  steps?: number;
  duration?: number;
}

export interface FastAPIRequest {
  prompt: string;
  model: string;     // NEW: model name
  seed?: number;
  steps?: number;
  duration?: number;
}

export interface FastAPIResponse {
  video_url: string;
  generation_time: number;
}
