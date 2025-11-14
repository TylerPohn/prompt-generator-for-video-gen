export interface ReplicateModel {
  id: string; // e.g., "bytedance/seedance-1.0"
  name: string; // display name
  description?: string;
}

// Hardcoded model list from PRD
export const AVAILABLE_MODELS: ReplicateModel[] = [
  {
    id: "bytedance/seedance-1.0",
    name: "Bytedance Seedance 1.0",
  },
  {
    id: "hailuo/hailuo-02",
    name: "Hailuo 02",
  },
  {
    id: "kling/kling-2.5-turbo",
    name: "Kling 2.5 Turbo",
  },
  {
    id: "google/veo-3",
    name: "Google Veo 3",
  },
  // Add best sora 2 model when available
];
