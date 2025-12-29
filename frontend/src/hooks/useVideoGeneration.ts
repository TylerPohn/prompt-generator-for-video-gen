import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { VideoCard } from '../types';
import { replicateClient } from '../services/replicateClient';
import { pollPrediction } from '../services/polling';
import { getAwsVideoClient } from '../services/awsVideoClient';
import { parseModelId } from '../services/modelRouter';

interface GenerateOptions {
  prompt: string;
  model: string;
  duration: number;
  onCardCreate?: (card: VideoCard) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCard>) => void;
  cardId?: string; // Optional - for retries
  retryCount?: number;
}

const MAX_RETRIES = 3;

export function useVideoGeneration() {
  const [generating, setGenerating] = useState<Set<string>>(new Set());

  const generateWithAws = useCallback(async (
    id: string,
    prompt: string,
    duration: number,
    awsModelName: string,  // NEW: "hunyuan-video" or "ltx-video"
    onCardUpdate: (id: string, updates: Partial<VideoCard>) => void
  ) => {
    const awsClient = getAwsVideoClient();

    // Submit job to AWS
    const submitResponse = await awsClient.submitJob({
      prompt,
      duration,
      model: awsModelName,  // NEW: pass model to AWS API
    });

    console.log(`AWS job submitted: ${submitResponse.jobId} (model: ${awsModelName})`);
    onCardUpdate(id, { predictionId: submitResponse.jobId });

    // Poll for completion
    const result = await awsClient.pollJobUntilComplete(submitResponse.jobId, {
      pollInterval: 5000,
      onStatusChange: (status) => {
        console.log('AWS job status:', status.status);
        if (status.status === 'processing') {
          onCardUpdate(id, { status: 'generating' });
        }
      },
    });

    if (!result.videoUrl) {
      throw new Error('No video URL in AWS response');
    }

    return result.videoUrl;
  }, []);

  const generateWithReplicate = useCallback(async (
    id: string,
    prompt: string,
    model: string,
    duration: number,
    onCardUpdate: (id: string, updates: Partial<VideoCard>) => void
  ) => {
    const prediction = await replicateClient.createPrediction(model, prompt, duration);
    onCardUpdate(id, { predictionId: prediction.id });

    const result = await pollPrediction(prediction.id, {
      onUpdate: (pred) => {
        if (pred.status === 'processing') {
          onCardUpdate(id, { status: 'generating' });
        }
      },
    });

    console.log('Polling completed! Result:', result);
    const videoUrl = Array.isArray(result.output)
      ? result.output[0]
      : result.output;

    if (!videoUrl) {
      throw new Error('No video URL in response');
    }

    return videoUrl;
  }, []);

  const generate = useCallback(async ({
    prompt,
    model,  // NOW full model ID: "aws:hunyuan-video" or "replicate:google/veo-3.1"
    duration,
    onCardCreate,
    onCardUpdate,
    cardId,
    retryCount = 0,
  }: GenerateOptions) => {
    const id = cardId || uuidv4();
    const isRetry = Boolean(cardId);

    // Parse model ID to determine routing
    const routeInfo = parseModelId(model);

    console.log('🎬 generate() called with:', {
      prompt,
      model,
      duration,
      cardId,
      retryCount,
      backend: routeInfo.backend,
      awsModel: routeInfo.awsModelName,
      replicateModel: routeInfo.replicateModelId,
    });

    // Create initial card (only if not retry)
    if (!isRetry && onCardCreate) {
      const initialCard: VideoCard = {
        id,
        prompt,
        model,
        backend: routeInfo.backend,  // NEW
        duration,
        status: 'pending',
        isFavorite: false,
        labels: [],
        createdAt: Date.now(),
        retryCount: 0,
      };
      console.log('📝 Creating initial card:', initialCard);
      onCardCreate(initialCard);
    } else {
      console.log('⏭️ Skipping card creation (retry or no onCardCreate)');
    }

    setGenerating(prev => new Set(prev).add(id));

    try {
      // Start prediction
      onCardUpdate(id, {
        status: 'generating',
        errorMessage: undefined,
        retryCount,
      });

      let videoUrl: string;

      // Route based on parsed model info
      if (routeInfo.backend === 'aws') {
        console.log(`🌩️ Using AWS backend: ${routeInfo.awsModelName}`);
        videoUrl = await generateWithAws(
          id,
          prompt,
          duration,
          routeInfo.awsModelName!,
          onCardUpdate
        );
      } else {
        console.log(`🔧 Using Replicate backend: ${routeInfo.replicateModelId}`);
        videoUrl = await generateWithReplicate(
          id,
          prompt,
          routeInfo.replicateModelId!,
          duration,
          onCardUpdate
        );
      }

      console.log('Extracted video URL:', videoUrl);

      // Update with completed video
      console.log(`Updating card ${id} to complete with URL:`, videoUrl);
      onCardUpdate(id, {
        status: 'complete',
        videoUrl,
        errorMessage: undefined,
      });
    } catch (error) {
      console.error('Video generation error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const canRetry = retryCount < MAX_RETRIES;

      onCardUpdate(id, {
        status: 'error',
        errorMessage: `${errorMessage}${canRetry ? ` (Attempt ${retryCount + 1}/${MAX_RETRIES})` : ' (Max retries reached)'}`,
        retryCount,
      });
    } finally {
      setGenerating(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [generateWithAws, generateWithReplicate]);

  const retry = useCallback(async (
    card: VideoCard,
    onCardUpdate: (id: string, updates: Partial<VideoCard>) => void
  ) => {
    const nextRetryCount = (card.retryCount || 0) + 1;

    if (nextRetryCount > MAX_RETRIES) {
      console.warn('Max retries reached for card', card.id);
      return;
    }

    // Wait before retry (exponential backoff)
    const delay = Math.min(1000 * Math.pow(2, card.retryCount || 0), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));

    await generate({
      prompt: card.prompt,
      model: card.model,
      duration: card.duration || 4, // Fallback to 4 if not specified
      onCardUpdate,
      cardId: card.id,
      retryCount: nextRetryCount,
    });
  }, [generate]);

  return {
    generate,
    retry,
    isGenerating: generating.size > 0,
    generatingIds: Array.from(generating),
  };
}
