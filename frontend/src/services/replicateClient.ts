import type { ReplicatePredictionResponse } from '../types';
import { REPLICATE_API_BASE, getAuthHeaders } from './config';

export class ReplicateClient {
  async createPrediction(
    modelId: string,
    prompt: string
  ): Promise<ReplicatePredictionResponse> {
    const response = await fetch(`${REPLICATE_API_BASE}/predictions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        version: modelId,
        input: { prompt },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getPrediction(predictionId: string): Promise<ReplicatePredictionResponse> {
    const response = await fetch(
      `${REPLICATE_API_BASE}/predictions/${predictionId}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get prediction: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async cancelPrediction(predictionId: string): Promise<void> {
    await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  }
}

export const replicateClient = new ReplicateClient();
