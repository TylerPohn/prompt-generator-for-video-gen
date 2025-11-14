export interface ReplicatePredictionRequest {
  version?: string;
  input: {
    prompt: string;
    [key: string]: unknown; // additional model-specific params
  };
}

export interface ReplicatePredictionResponse {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[]; // video URL(s)
  error?: string;
  urls?: {
    get: string;
    cancel: string;
  };
}
