export const REPLICATE_API_BASE = 'https://api.replicate.com/v1';

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
