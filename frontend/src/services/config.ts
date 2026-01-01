// Backend configuration
// Priority: AWS API > Local Backend > Direct Replicate

export type BackendType = 'aws' | 'local' | 'replicate';

// Feature flags
export const ENABLE_VIDEO_GEN = import.meta.env.VITE_ENABLE_VIDEO_GEN === 'true';

// Check if AWS API is configured
export function isAwsConfigured(): boolean {
  return !!(
    import.meta.env.VITE_AWS_VIDEO_API_ENDPOINT &&
    import.meta.env.VITE_AWS_VIDEO_API_KEY
  );
}

// Get the active backend type
export function getBackendType(): BackendType {
  // If AWS is configured, prefer it (production-ready)
  if (isAwsConfigured()) {
    return 'aws';
  }
  // In dev mode, use local backend server
  if (import.meta.env.DEV) {
    return 'local';
  }
  // Fallback to direct Replicate (would need CORS handling)
  return 'replicate';
}

// AWS API configuration
export const AWS_VIDEO_API_ENDPOINT = import.meta.env.VITE_AWS_VIDEO_API_ENDPOINT || '';
export const AWS_VIDEO_API_KEY = import.meta.env.VITE_AWS_VIDEO_API_KEY || '';

// Use local backend (uses bash/curl) to avoid CORS issues
export const REPLICATE_API_BASE = import.meta.env.DEV
  ? 'http://localhost:3001/api'  // Dev: use local backend with bash/curl
  : 'https://api.replicate.com/v1';  // Prod: would need backend server

export function getApiKey(): string {
  const apiKey = import.meta.env.VITE_REPLICATE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'VITE_REPLICATE_API_KEY is not set. Please add it to your .env.local file.'
    );
  }
  return apiKey;
}

export function getAuthHeaders(): HeadersInit {
  return {
    'Authorization': `Token ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}
