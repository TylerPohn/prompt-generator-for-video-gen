import type { ReplicatePredictionResponse } from '../types';
import { replicateClient } from './replicateClient';

interface PollOptions {
  onUpdate?: (prediction: ReplicatePredictionResponse) => void;
  maxDuration?: number; // milliseconds
  initialInterval?: number; // milliseconds
  maxInterval?: number; // milliseconds
}

const DEFAULT_OPTIONS: Required<PollOptions> = {
  onUpdate: () => {},
  maxDuration: 10 * 60 * 1000, // 10 minutes
  initialInterval: 1000, // 1 second
  maxInterval: 5000, // 5 seconds
};

export async function pollPrediction(
  predictionId: string,
  options: PollOptions = {}
): Promise<ReplicatePredictionResponse> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let interval = opts.initialInterval;

  while (true) {
    // Check timeout
    if (Date.now() - startTime > opts.maxDuration) {
      throw new Error('Prediction polling timeout exceeded');
    }

    // Get current status
    const prediction = await replicateClient.getPrediction(predictionId);
    opts.onUpdate(prediction);

    // Check if complete
    if (prediction.status === 'succeeded') {
      return prediction;
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(
        prediction.error || `Prediction ${prediction.status}`
      );
    }

    // Wait before next poll (exponential backoff)
    await new Promise(resolve => setTimeout(resolve, interval));
    interval = Math.min(interval * 1.5, opts.maxInterval);
  }
}
