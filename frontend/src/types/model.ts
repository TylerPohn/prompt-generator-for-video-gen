// Legacy Replicate-only interface (kept for backward compatibility)
export interface ReplicateModel {
  id: string; // e.g., "bytedance/seedance-1.0"
  name: string; // display name
  description?: string;
}

// New unified model interface supporting both AWS GPU and Replicate
export interface VideoModel {
  id: string;           // e.g., "aws:hunyuan-video" or "replicate:google/veo-3.1"
  name: string;         // display name: "Hunyuan Video (AWS GPU)"
  description?: string;
  backend: 'aws' | 'replicate';

  // AWS-specific
  isAwsModel?: boolean;
  requiresGpu?: boolean;

  // Replicate-specific
  replicateModelId?: string; // e.g., "google/veo-3.1"
}

// All available models (AWS GPU + Replicate)
export const AVAILABLE_MODELS: VideoModel[] = [
  // AWS GPU Models
  {
    id: "aws:hunyuan-video",
    name: "Hunyuan Video (AWS GPU)",
    description: "State-of-the-art quality, 720p-1080p, self-hosted on g5.12xlarge",
    backend: 'aws',
    isAwsModel: true,
    requiresGpu: true,
  },
  {
    id: "aws:ltx-video",
    name: "LTX-Video (AWS GPU)",
    description: "Fast generation, 512px, self-hosted on g5.xlarge",
    backend: 'aws',
    isAwsModel: true,
    requiresGpu: true,
  },

  // Replicate Models
  {
    id: "replicate:google/veo-3.1",
    name: "Google Veo 3.1",
    description: "Google's latest video generation model - 4-8 second clips",
    backend: 'replicate',
    replicateModelId: "google/veo-3.1",
  },
  {
    id: "replicate:bytedance/seedance-1-pro-fast",
    name: "Seedance 1 Pro Fast",
    description: "ByteDance's fast video generation model",
    backend: 'replicate',
    replicateModelId: "bytedance/seedance-1-pro-fast",
  },
  {
    id: "replicate:bytedance/seedance-1-lite",
    name: "Seedance 1 Lite",
    description: "ByteDance's lightweight video generation model",
    backend: 'replicate',
    replicateModelId: "bytedance/seedance-1-lite",
  },
  {
    id: "replicate:openai/sora-2",
    name: "OpenAI Sora 2",
    description: "OpenAI's advanced video generation model",
    backend: 'replicate',
    replicateModelId: "openai/sora-2",
  },
];
