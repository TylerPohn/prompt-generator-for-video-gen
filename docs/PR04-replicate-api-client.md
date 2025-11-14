# PR04: Replicate API Client

## Dependencies
- PR01 (Project Setup) - for environment variables
- PR02 (Data Model) - for Replicate types

## Overview
Implement a service layer for interacting with the Replicate API. This includes creating predictions, polling for completion, and handling API responses.

## Objectives
- Create API client for Replicate predictions
- Implement polling mechanism for async video generation
- Handle API errors and edge cases
- Provide clean interface for components to use

## Technical Decisions
- Use native `fetch` API (no external HTTP library needed)
- Implement exponential backoff for polling
- Maximum polling duration: 10 minutes
- Polling interval: Start at 1s, increase to 5s max
- Use Replicate REST API directly (no SDK dependency)

## Tasks

### 1. Install Replicate Package (Optional)
Note: We'll use fetch API directly, but can optionally use official SDK:
```bash
# Optional: npm install replicate
# For this PR, we'll use fetch for simplicity and no extra dependencies
```

### 2. Create API Configuration
Create `src/services/config.ts`:
```typescript
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
```

### 3. Create Replicate Client
Create `src/services/replicateClient.ts`:
```typescript
import { ReplicatePredictionRequest, ReplicatePredictionResponse } from '../types';
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
```

### 4. Create Polling Service
Create `src/services/polling.ts`:
```typescript
import { ReplicatePredictionResponse } from '../types';
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
```

### 5. Create useVideoGeneration Hook
Create `src/hooks/useVideoGeneration.ts`:
```typescript
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { VideoCard } from '../types';
import { replicateClient } from '../services/replicateClient';
import { pollPrediction } from '../services/polling';

interface GenerateOptions {
  prompt: string;
  model: string;
  onCardCreate: (card: VideoCard) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCard>) => void;
}

export function useVideoGeneration() {
  const [generating, setGenerating] = useState<Set<string>>(new Set());

  const generate = useCallback(async ({
    prompt,
    model,
    onCardCreate,
    onCardUpdate,
  }: GenerateOptions) => {
    const cardId = uuidv4();

    // Create initial card
    const initialCard: VideoCard = {
      id: cardId,
      prompt,
      model,
      status: 'pending',
      isFavorite: false,
      labels: [],
      createdAt: Date.now(),
    };

    onCardCreate(initialCard);
    setGenerating(prev => new Set(prev).add(cardId));

    try {
      // Start prediction
      onCardUpdate(cardId, { status: 'generating' });
      const prediction = await replicateClient.createPrediction(model, prompt);

      // Poll for completion
      const result = await pollPrediction(prediction.id, {
        onUpdate: (pred) => {
          // Update status as we poll
          if (pred.status === 'processing') {
            onCardUpdate(cardId, { status: 'generating' });
          }
        },
      });

      // Extract video URL from output
      const videoUrl = Array.isArray(result.output)
        ? result.output[0]
        : result.output;

      // Update with completed video
      onCardUpdate(cardId, {
        status: 'complete',
        videoUrl,
      });
    } catch (error) {
      console.error('Video generation error:', error);
      onCardUpdate(cardId, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setGenerating(prev => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }
  }, []);

  return {
    generate,
    isGenerating: generating.size > 0,
    generatingIds: Array.from(generating),
  };
}
```

### 6. Create Service Index
Create `src/services/index.ts`:
```typescript
export * from './config';
export * from './replicateClient';
export * from './polling';
```

## Acceptance Criteria
- [ ] Can create a prediction via Replicate API
- [ ] Polling correctly waits for completion
- [ ] Errors are properly caught and handled
- [ ] API key is correctly loaded from environment
- [ ] Exponential backoff works in polling
- [ ] Timeout prevents infinite polling
- [ ] Hook integrates cleanly with card management

## Files to Create
- `src/services/config.ts`
- `src/services/replicateClient.ts`
- `src/services/polling.ts`
- `src/services/index.ts`
- `src/hooks/useVideoGeneration.ts`
- Update `src/hooks/index.ts` to export new hook

## Testing
### Manual Testing (requires valid API key):
1. Set `VITE_REPLICATE_API_KEY` in `.env.local`
2. Create a test script or component that calls `generate()`
3. Check console for API calls
4. Verify polling happens (check Network tab)
5. Test error handling by using invalid model ID

### Console Test:
```typescript
// In App.tsx or test component
const { generate } = useVideoGeneration();

generate({
  prompt: "test video",
  model: "bytedance/seedance-1.0",
  onCardCreate: (card) => console.log('Created:', card),
  onCardUpdate: (id, updates) => console.log('Update:', id, updates),
});
```

## Notes for Junior Engineers
- The Replicate API is asynchronous - you start a prediction, then poll until done
- `import.meta.env` is Vite's way to access environment variables
- `fetch` is built into modern browsers - no library needed!
- Exponential backoff means we wait longer between each poll attempt (saves API calls)
- The `Set` type is like an array but with unique values only
- `async/await` makes asynchronous code look synchronous and easier to read
- Always handle both success AND error cases when calling APIs
- The `onUpdate` callback lets us show progress during polling
