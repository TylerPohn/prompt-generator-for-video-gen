# React Video App Crash Debug Document

## Problem
The app keeps crashing and is very unresponsive, especially when there are many video cards loaded from localStorage.

## Performance Optimizations Already Applied
1. **Lazy video loading** - Videos only create `<video>` elements when scrolled into view (Intersection Observer)
2. **Pagination** - Only 24 cards render per page
3. **Debounced localStorage writes** - 500ms delay with save on page unload

## Relevant Code Files

---

### 1. App.tsx (Main Component)
**Location:** `src/App.tsx`

```tsx
import { useState } from 'react';
import {
  PromptInputPanel,
  CardGrid,
  SectionHeader,
  FilterControls,
  ActiveFilters,
} from './components';
import { PromptGenerator } from './components/PromptGenerator';
import { useVideoCards, useFilters } from './hooks';

function App() {
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentDuration, setCurrentDuration] = useState(4); // Default 4 seconds
  const { cards, toggleFavorite, addLabel, removeLabel, updateCard, deleteCard, addCard } = useVideoCards();

  // Initialize filters
  const {
    filteredCards,
    filters,
    availableLabels,
    toggleFavoritesFilter,
    setLabelFilter,
    clearFilters,
    hasActiveFilters,
  } = useFilters(cards);

  const handleThumbnailGenerated = (id: string, thumbnailUrl: string) => {
    updateCard(id, { thumbnailUrl });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Video Prompt Lab
          </h1>
          <p className="mt-2 text-gray-600">
            Experiment with video generation models
          </p>
        </header>

        <div className="mb-8 space-y-4">
          <PromptGenerator
            onUsePrompt={(prompt, duration) => {
              setCurrentPrompt(prompt);
              setCurrentDuration(duration);
            }}
          />
          <PromptInputPanel
            prompt={currentPrompt}
            onPromptChange={setCurrentPrompt}
            duration={currentDuration}
            onCardCreate={addCard}
            onCardUpdate={updateCard}
          />
        </div>

        <div className="mt-12">
          <SectionHeader
            title="Generated Videos"
            count={filteredCards.length}
          >
            <FilterControls
              filters={filters}
              availableLabels={availableLabels}
              onToggleFavorites={toggleFavoritesFilter}
              onSelectLabel={setLabelFilter}
              onClearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </SectionHeader>

          <ActiveFilters
            filters={filters}
            onRemoveFavoriteFilter={toggleFavoritesFilter}
            onRemoveLabelFilter={() => setLabelFilter(null)}
          />

          <CardGrid
            cards={filteredCards}
            onToggleFavorite={toggleFavorite}
            onAddLabel={addLabel}
            onRemoveLabel={removeLabel}
            onThumbnailGenerated={handleThumbnailGenerated}
            onCardUpdate={updateCard}
            onDelete={deleteCard}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
```

---

### 2. CardGrid.tsx (Pagination Implementation)
**Location:** `src/components/CardGrid.tsx`

```tsx
import { useState } from 'react';
import type { VideoCard as VideoCardType } from '../types';
import { VideoCard } from './VideoCard';

interface CardGridProps {
  cards: VideoCardType[];
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCardType>) => void;
  onDelete: (id: string) => void;
}

const CARDS_PER_PAGE = 24;

export function CardGrid({
  cards,
  onToggleFavorite,
  onAddLabel,
  onRemoveLabel,
  onThumbnailGenerated,
  onCardUpdate,
  onDelete,
}: CardGridProps) {
  const [currentPage, setCurrentPage] = useState(1);

  if (cards.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mb-4">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No videos yet
        </h3>
        <p className="text-gray-500">
          Generate your first video using the prompt above!
        </p>
      </div>
    );
  }

  const totalPages = Math.ceil(cards.length / CARDS_PER_PAGE);
  const startIndex = (currentPage - 1) * CARDS_PER_PAGE;
  const endIndex = startIndex + CARDS_PER_PAGE;
  const visibleCards = cards.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleCards.map((card) => (
          <VideoCard
            key={card.id}
            card={card}
            onToggleFavorite={onToggleFavorite}
            onAddLabel={onAddLabel}
            onRemoveLabel={onRemoveLabel}
            onThumbnailGenerated={onThumbnailGenerated}
            onCardUpdate={onCardUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-700">
            Page {currentPage} of {totalPages} ({cards.length} total)
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

---

### 3. VideoCard.tsx
**Location:** `src/components/VideoCard.tsx`

```tsx
import { useState } from 'react';
import type { VideoCard as VideoCardType } from '../types';
import { StatusBadge } from './StatusBadge';
import { VideoPlayer } from './VideoPlayer';
import { VideoPlaceholder } from './VideoPlaceholder';
import { CopyButton } from './CopyButton';
import { LabelBadge } from './LabelBadge';
import { AddLabelModal } from './AddLabelModal';
import { ErrorDisplay } from './ErrorDisplay';
import { DeleteButton } from './DeleteButton';
import { useLabelColors } from '../hooks';
import { useThumbnailGeneration } from '../hooks/useThumbnailGeneration';
import { useVideoGeneration } from '../hooks';

interface VideoCardProps {
  card: VideoCardType;
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCardType>) => void;
  onDelete: (id: string) => void;
}

export function VideoCard({
  card,
  onToggleFavorite,
  onAddLabel,
  onRemoveLabel,
  onThumbnailGenerated,
  onCardUpdate,
  onDelete,
}: VideoCardProps) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const { getColorForLabel } = useLabelColors();
  const { retry, generatingIds } = useVideoGeneration();
  const promptPreviewLength = 150;
  const needsTruncation = card.prompt.length > promptPreviewLength;

  const isRetrying = generatingIds.includes(card.id);
  const canRetry = (card.retryCount || 0) < 3;

  // Generate thumbnail when video completes
  useThumbnailGeneration({
    videoUrl: card.videoUrl,
    cardId: card.id,
    onThumbnailGenerated,
  });

  const displayPrompt = isPromptExpanded
    ? card.prompt
    : card.prompt.slice(0, promptPreviewLength) + (needsTruncation ? '...' : '');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-fadeIn hover:shadow-md transition-shadow">
      {/* Video/Placeholder */}
      <div className="p-4 pb-3">
        {card.status === 'complete' && card.videoUrl ? (
          <VideoPlayer videoUrl={card.videoUrl} />
        ) : (
          <VideoPlaceholder status={card.status} thumbnailUrl={card.thumbnailUrl} />
        )}
      </div>

      {/* Card Content */}
      <div className="px-4 pb-4 space-y-3">
        {/* Badges Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={card.status} />
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {card.model}
          </span>
          {card.labels.map((label) => (
            <LabelBadge
              key={label}
              label={label}
              color={getColorForLabel(label)}
              onRemove={() => onRemoveLabel(card.id, label)}
            />
          ))}
        </div>

        {/* Prompt */}
        <div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {displayPrompt}
          </p>
          {needsTruncation && (
            <button
              onClick={() => setIsPromptExpanded(!isPromptExpanded)}
              className="text-xs text-blue-600 hover:text-blue-800 mt-1"
            >
              {isPromptExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Error Message */}
        {card.status === 'error' && card.errorMessage && (
          <ErrorDisplay
            errorMessage={card.errorMessage}
            onRetry={() => retry(card, onCardUpdate)}
            canRetry={canRetry}
            isRetrying={isRetrying}
          />
        )}

        {/* Actions Row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleFavorite(card.id)}
              className="text-2xl hover:scale-110 transition-transform"
              aria-label={card.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {card.isFavorite ? '⭐' : '☆'}
            </button>

            <DeleteButton
              onDelete={() => onDelete(card.id)}
              itemName="video card"
            />
          </div>

          <div className="flex gap-2">
            <CopyButton text={card.prompt} />
            <button
              onClick={() => setIsLabelModalOpen(true)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              + Label
            </button>
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-gray-400">
          {new Date(card.createdAt).toLocaleString()}
        </div>
      </div>

      <AddLabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        onAdd={(label) => onAddLabel(card.id, label)}
        existingLabels={card.labels}
      />
    </div>
  );
}
```

---

### 4. VideoPlayer.tsx (Lazy Loading Implementation)
**Location:** `src/components/VideoPlayer.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';

interface VideoPlayerProps {
  videoUrl: string;
  alt?: string;
}

export function VideoPlayer({ videoUrl }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Once visible, we can disconnect as we don't need to unload
          observer.disconnect();
        }
      },
      {
        rootMargin: '100px', // Start loading slightly before visible
        threshold: 0.1,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="aspect-video bg-black rounded-lg overflow-hidden">
      {isVisible ? (
        <video
          src={videoUrl}
          controls
          className="w-full h-full"
          preload="metadata"
        >
          <track kind="captions" />
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
          Scroll to load video
        </div>
      )}
    </div>
  );
}
```

---

### 5. useVideoCards.ts (State Management with Debounced localStorage)
**Location:** `src/hooks/useVideoCards.ts`

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import type { VideoCard } from '../types';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';

export function useVideoCards() {
  const [cards, setCards] = useState<VideoCard[]>(() =>
    getFromStorage<VideoCard[]>(StorageKeys.VIDEO_CARDS, [])
  );

  // Debounce localStorage writes to avoid performance issues
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const cardsRef = useRef(cards);

  // Keep ref updated
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Debounced save
  useEffect(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule save after 500ms of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      setToStorage(StorageKeys.VIDEO_CARDS, cards);
    }, 500);

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [cards]);

  // Save immediately on page unload to prevent data loss
  useEffect(() => {
    const handleBeforeUnload = () => {
      setToStorage(StorageKeys.VIDEO_CARDS, cardsRef.current);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const addCard = useCallback((card: VideoCard) => {
    setCards(prev => [card, ...prev]); // newest first
  }, []);

  const updateCard = useCallback((id: string, updates: Partial<VideoCard>) => {
    setCards(prev =>
      prev.map(card => card.id === id ? { ...card, ...updates } : card)
    );
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards(prev => prev.filter(card => card.id !== id));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setCards(prev =>
      prev.map(card =>
        card.id === id ? { ...card, isFavorite: !card.isFavorite } : card
      )
    );
  }, []);

  const addLabel = useCallback((id: string, label: string) => {
    setCards(prev =>
      prev.map(card =>
        card.id === id && !card.labels.includes(label)
          ? { ...card, labels: [...card.labels, label] }
          : card
      )
    );
  }, []);

  const removeLabel = useCallback((id: string, label: string) => {
    setCards(prev =>
      prev.map(card =>
        card.id === id
          ? { ...card, labels: card.labels.filter(l => l !== label) }
          : card
      )
    );
  }, []);

  return {
    cards,
    addCard,
    updateCard,
    deleteCard,
    toggleFavorite,
    addLabel,
    removeLabel,
  };
}
```

---

### 6. useVideoGeneration.ts
**Location:** `src/hooks/useVideoGeneration.ts`

```tsx
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { VideoCard } from '../types';
import { replicateClient } from '../services/replicateClient';
import { pollPrediction } from '../services/polling';

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

  const generate = useCallback(async ({
    prompt,
    model,
    duration,
    onCardCreate,
    onCardUpdate,
    cardId,
    retryCount = 0,
  }: GenerateOptions) => {
    console.log('🎬 generate() called with:', { prompt, model, duration, cardId, retryCount });
    const id = cardId || uuidv4();
    const isRetry = Boolean(cardId);

    // Create initial card (only if not retry)
    if (!isRetry && onCardCreate) {
      const initialCard: VideoCard = {
        id,
        prompt,
        model,
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

      const prediction = await replicateClient.createPrediction(model, prompt, duration);

      // Store prediction ID
      onCardUpdate(id, { predictionId: prediction.id });

      // Poll for completion
      const result = await pollPrediction(prediction.id, {
        onUpdate: (pred) => {
          if (pred.status === 'processing') {
            onCardUpdate(id, { status: 'generating' });
          }
        },
      });

      // Extract video URL from output
      console.log('Polling completed! Result:', result);
      const videoUrl = Array.isArray(result.output)
        ? result.output[0]
        : result.output;

      console.log('Extracted video URL:', videoUrl);

      if (!videoUrl) {
        throw new Error('No video URL in response');
      }

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
  }, []);

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
```

---

### 7. useThumbnailGeneration.ts
**Location:** `src/hooks/useThumbnailGeneration.ts`

```tsx
import { useEffect } from 'react';
import { generateAndStoreThumbnail } from '../utils/thumbnail';

interface UseThumbnailGenerationProps {
  videoUrl?: string;
  cardId: string;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
}

export function useThumbnailGeneration({
  videoUrl,
  cardId,
  onThumbnailGenerated,
}: UseThumbnailGenerationProps) {
  useEffect(() => {
    if (!videoUrl) return;

    // Generate thumbnail when video URL becomes available
    generateAndStoreThumbnail(videoUrl, (thumbnailUrl) => {
      onThumbnailGenerated(cardId, thumbnailUrl);
    });
  }, [videoUrl, cardId, onThumbnailGenerated]);
}
```

---

### 8. thumbnail.ts (Thumbnail Generation)
**Location:** `src/utils/thumbnail.ts`

```tsx
/**
 * Generates a thumbnail from a video URL
 * @param videoUrl - URL of the video
 * @param seekTime - Time in seconds to capture frame (default 0.1)
 * @returns Promise resolving to data URL of thumbnail image
 */
export async function generateThumbnail(
  videoUrl: string,
  seekTime = 0.1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    // When metadata loads, we know the video dimensions
    video.addEventListener('loadedmetadata', () => {
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Seek to specific time
      video.currentTime = Math.min(seekTime, video.duration);
    });

    // When seeked to the right time, capture the frame
    video.addEventListener('seeked', () => {
      try {
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        // Clean up
        video.src = '';
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    });

    video.addEventListener('error', () => {
      reject(new Error('Failed to load video for thumbnail'));
    });

    // Start loading the video
    video.load();
  });
}

/**
 * Hook to generate thumbnail when video URL is available
 */
export async function generateAndStoreThumbnail(
  videoUrl: string,
  onThumbnail: (thumbnailUrl: string) => void
): Promise<void> {
  try {
    const thumbnail = await generateThumbnail(videoUrl);
    onThumbnail(thumbnail);
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    // Don't throw - thumbnails are optional
  }
}
```

---

### 9. polling.ts
**Location:** `src/services/polling.ts`

```tsx
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
    console.log(`Polling ${predictionId}: status = ${prediction.status}`);
    if (prediction.output) {
      console.log(`Output available:`, prediction.output);
    }
    opts.onUpdate(prediction);

    // Check if complete
    if (prediction.status === 'succeeded') {
      console.log(`Video generation succeeded! Output:`, prediction.output);
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

---

### 10. localStorage.ts
**Location:** `src/utils/localStorage.ts`

```tsx
const STORAGE_PREFIX = 'videoPromptLab:';

export const StorageKeys = {
  VIDEO_CARDS: `${STORAGE_PREFIX}videoCards`,
  LABEL_COLORS: `${STORAGE_PREFIX}labelColors`,
  LAST_MODEL: `${STORAGE_PREFIX}lastModel`,
  PROMPT_HISTORY: `${STORAGE_PREFIX}promptHistory`,
} as const;

export function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error reading from localStorage (${key}):`, error);
    return defaultValue;
  }
}

export function setToStorage<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error writing to localStorage (${key}):`, error);
    // Handle quota exceeded or other errors
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('LocalStorage quota exceeded. Consider cleaning old data.');
    }
    return false;
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing from localStorage (${key}):`, error);
  }
}

export function clearAllAppStorage(): void {
  Object.values(StorageKeys).forEach(key => {
    removeFromStorage(key);
  });
}
```

---

## Potential Issues to Investigate

### 1. Thumbnail Generation Creating Video Elements
**CRITICAL:** In `thumbnail.ts`, the `generateThumbnail()` function creates a video element for EVERY completed card via `useThumbnailGeneration`. This happens immediately when `videoUrl` becomes available.

**Problem:** Even though VideoPlayer uses lazy loading, the thumbnail generation is creating additional video elements for every completed video, which could be hitting Chrome's limit again.

**Potential Fix:** Lazy load thumbnail generation as well, or use a different approach.

### 2. Multiple Re-renders
The `updateCard()` function is called multiple times during video generation:
- When status changes to 'generating'
- When predictionId is stored
- During polling updates
- When complete

Each of these triggers:
- A state update in useVideoCards
- A potential localStorage write (debounced, but still queued)
- A re-render of the entire cards array

### 3. useThumbnailGeneration Dependency Array
In `useThumbnailGeneration.ts`, the dependency array includes `onThumbnailGenerated` which might not be memoized, causing unnecessary effect re-runs.

### 4. Intersection Observer Not Disconnecting Properly
In `VideoPlayer.tsx`, the observer cleanup might not be working correctly if the component unmounts before becoming visible.

### 5. No Cleanup for Thumbnail Video Elements
The thumbnail generation creates video elements but only sets `video.src = ''` - it doesn't remove the element from memory.

---

## Questions to Consider

1. **How many cards are in localStorage?** If hundreds, even with pagination, the initial load and filtering operations could be expensive.

2. **Are thumbnails being generated for all videos?** This creates additional video elements that bypass the lazy loading optimization.

3. **Is the browser running out of memory?** Check if there are memory leaks from:
   - Video elements not being garbage collected
   - Canvas contexts from thumbnail generation
   - Event listeners not being cleaned up

4. **Are there any console errors?** Specific errors would help narrow down the issue.

5. **What happens if you disable thumbnail generation?** This would test if that's the culprit.

---

## Suggested Debugging Steps

1. **Disable thumbnail generation temporarily** - Comment out the `useThumbnailGeneration` call in VideoCard.tsx

2. **Check localStorage size** - In browser console:
   ```javascript
   JSON.stringify(localStorage).length
   ```

3. **Monitor memory usage** - Use Chrome DevTools Memory profiler

4. **Add performance logging**:
   ```javascript
   console.time('render');
   // ...render logic
   console.timeEnd('render');
   ```

5. **Check for memory leaks** - Take heap snapshots before/after loading cards

6. **Test with cleared localStorage** - See if performance improves with no saved cards
