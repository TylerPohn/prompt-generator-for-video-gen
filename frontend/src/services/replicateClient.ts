import type { ReplicatePredictionResponse } from '../types';
import { REPLICATE_API_BASE, getAuthHeaders } from './config';

export class ReplicateClient {
  async createPrediction(
    modelId: string,
    prompt: string,
    duration: number = 4
  ): Promise<ReplicatePredictionResponse> {
    // Backend will handle the bash/curl call
    const response = await fetch(`${REPLICATE_API_BASE}/predictions/${modelId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          prompt,
          duration
        },
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
        headers: {
          'Content-Type': 'application/json',
        },
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
