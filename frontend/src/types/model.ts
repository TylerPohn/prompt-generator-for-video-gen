export interface ReplicateModel {
  id: string; // e.g., "bytedance/seedance-1.0"
  name: string; // display name
  description?: string;
}

// Real Replicate video models that are verified to work
export const AVAILABLE_MODELS: ReplicateModel[] = [
  {
    id: "google/veo-3.1",
    name: "Google Veo 3.1",
    description: "Google's latest video generation model - 4-8 second clips"
  },
  {
    id: "bytedance/seedance-1-pro-fast",
    name: "Seedance 1 Pro Fast",
    description: "ByteDance's fast video generation model"
  },
  {
    id: "openai/sora-2",
    name: "OpenAI Sora 2",
    description: "OpenAI's advanced video generation model"
  },
  // Note: Add more models as they become available on Replicate
  // Check https://replicate.com/collections/video-generation for current models
];
