import { AVAILABLE_MODELS, type VideoModel } from '../types/model';

export interface ModelRouteInfo {
  backend: 'aws' | 'replicate';
  modelId: string;
  awsModelName?: string;      // e.g., "hunyuan-video"
  replicateModelId?: string;  // e.g., "google/veo-3.1"
}

/**
 * Parse a model ID to determine routing information
 * @param modelId - Full model ID (e.g., "aws:hunyuan-video" or "replicate:google/veo-3.1")
 * @returns Routing information for the model
 */
export function parseModelId(modelId: string): ModelRouteInfo {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);

  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  if (model.backend === 'aws') {
    const awsModelName = modelId.replace('aws:', '');
    return {
      backend: 'aws',
      modelId,
      awsModelName,
    };
  }

  return {
    backend: 'replicate',
    modelId,
    replicateModelId: model.replicateModelId,
  };
}

/**
 * Check if AWS models are available (AWS API configured)
 * @returns true if AWS Video API is configured
 */
export function isAwsModelAvailable(): boolean {
  return !!(
    import.meta.env.VITE_AWS_VIDEO_API_ENDPOINT &&
    import.meta.env.VITE_AWS_VIDEO_API_KEY
  );
}

/**
 * Get list of available models based on current configuration
 * Filters out AWS models if AWS API is not configured
 * @returns List of available models
 */
export function getAvailableModels(): VideoModel[] {
  const awsAvailable = isAwsModelAvailable();

  return AVAILABLE_MODELS.filter(model => {
    // Filter out AWS models if AWS not configured
    if (model.backend === 'aws' && !awsAvailable) {
      return false;
    }
    return true;
  });
}

/**
 * Get the default model to use
 * Prefers AWS if available, otherwise uses first available model
 * @returns Default model ID
 */
export function getDefaultModel(): string {
  // Check for explicit default in env
  const envDefault = import.meta.env.VITE_DEFAULT_MODEL;
  if (envDefault) {
    return envDefault;
  }

  // Otherwise, prefer AWS if available
  const available = getAvailableModels();
  const awsModel = available.find(m => m.backend === 'aws');
  if (awsModel) {
    return awsModel.id;
  }

  // Fall back to first available model
  return available[0]?.id || 'replicate:google/veo-3.1';
}
