export type VideoStatus = "pending" | "generating" | "complete" | "error";

export interface VideoCard {
  id: string; // uuid
  prompt: string;
  model: string; // replicate model ID
  duration?: number; // video duration in seconds (defaults to 4 if not specified)
  status: VideoStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  isFavorite: boolean;
  labels: string[];
  createdAt: number; // timestamp
  errorMessage?: string; // for error status
  retryCount?: number; // number of retry attempts
  predictionId?: string; // replicate prediction ID
}
