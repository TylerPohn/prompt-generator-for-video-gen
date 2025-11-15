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
