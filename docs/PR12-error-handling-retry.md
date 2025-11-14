# PR12: Error Handling & Retry

## Dependencies
- PR04 (Replicate API Client) - requires API client and generation logic
- PR06 (Video Card Component) - requires VideoCard component

## Overview
Enhance error handling throughout the application and add retry functionality for failed video generations. Improve user feedback for various error states.

## Objectives
- Add retry button to error state cards
- Improve error messages with specific details
- Handle different types of errors (API, network, timeout)
- Add retry logic to video generation
- Limit retry attempts to prevent infinite loops
- Show loading state during retry

## Technical Decisions
- Maximum 3 retry attempts per video
- Retry uses same prompt and model
- Preserve card ID on retry (update existing card, don't create new one)
- Show retry count in error message
- Exponential backoff for retries (wait longer between attempts)

## Tasks

### 1. Update VideoCard Type for Retry Tracking
Update `src/types/videoCard.ts`:
```typescript
export type VideoStatus = "pending" | "generating" | "complete" | "error";

export interface VideoCard {
  id: string;
  prompt: string;
  model: string;
  status: VideoStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  isFavorite: boolean;
  labels: string[];
  createdAt: number;
  errorMessage?: string;
  retryCount?: number; // Add this field
  predictionId?: string; // Add this to track Replicate prediction
}
```

### 2. Update Video Generation Hook with Retry
Update `src/hooks/useVideoGeneration.ts`:
```typescript
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { VideoCard } from '../types';
import { replicateClient } from '../services/replicateClient';
import { pollPrediction } from '../services/polling';

interface GenerateOptions {
  prompt: string;
  model: string;
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
    onCardCreate,
    onCardUpdate,
    cardId,
    retryCount = 0,
  }: GenerateOptions) => {
    const id = cardId || uuidv4();
    const isRetry = Boolean(cardId);

    // Create initial card (only if not retry)
    if (!isRetry && onCardCreate) {
      const initialCard: VideoCard = {
        id,
        prompt,
        model,
        status: 'pending',
        isFavorite: false,
        labels: [],
        createdAt: Date.now(),
        retryCount: 0,
      };
      onCardCreate(initialCard);
    }

    setGenerating(prev => new Set(prev).add(id));

    try {
      // Start prediction
      onCardUpdate(id, {
        status: 'generating',
        errorMessage: undefined,
        retryCount,
      });

      const prediction = await replicateClient.createPrediction(model, prompt);

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
      const videoUrl = Array.isArray(result.output)
        ? result.output[0]
        : result.output;

      if (!videoUrl) {
        throw new Error('No video URL in response');
      }

      // Update with completed video
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

### 3. Create Error Display Component
Create `src/components/ErrorDisplay.tsx`:
```typescript
interface ErrorDisplayProps {
  errorMessage: string;
  onRetry?: () => void;
  canRetry: boolean;
  isRetrying?: boolean;
}

export function ErrorDisplay({
  errorMessage,
  onRetry,
  canRetry,
  isRetrying = false,
}: ErrorDisplayProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-800 font-medium mb-1">
            Generation Failed
          </p>
          <p className="text-xs text-red-700 break-words">
            {errorMessage}
          </p>

          {canRetry && onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="mt-3 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors"
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}

          {!canRetry && (
            <p className="mt-2 text-xs text-red-600 font-medium">
              Maximum retry attempts reached. Please try again with a new generation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 4. Update VideoCard to Use ErrorDisplay
Update `src/components/VideoCard.tsx`:
```typescript
// Add import
import { ErrorDisplay } from './ErrorDisplay';
import { useVideoGeneration } from '../hooks';

// Update interface
interface VideoCardProps {
  card: VideoCardType;
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCardType>) => void;
}

// In component
export function VideoCard({
  card,
  onToggleFavorite,
  onAddLabel,
  onRemoveLabel,
  onThumbnailGenerated,
  onCardUpdate,
}: VideoCardProps) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const { getColorForLabel } = useLabelColors();
  const { retry, generatingIds } = useVideoGeneration();

  const isRetrying = generatingIds.includes(card.id);
  const canRetry = (card.retryCount || 0) < 3;

  // ... existing code ...

  // Replace the error message section with:
  {/* Error Message */}
  {card.status === 'error' && card.errorMessage && (
    <ErrorDisplay
      errorMessage={card.errorMessage}
      onRetry={() => retry(card, onCardUpdate)}
      canRetry={canRetry}
      isRetrying={isRetrying}
    />
  )}
}
```

### 5. Update Component Index
Update `src/components/index.ts`:
```typescript
export * from './PromptInputPanel';
export * from './VideoCard';
export * from './VideoPlayer';
export * from './VideoPlaceholder';
export * from './StatusBadge';
export * from './CardGrid';
export * from './SectionHeader';
export * from './LabelBadge';
export * from './AddLabelModal';
export * from './CopyButton';
export * from './FilterControls';
export * from './ActiveFilters';
export * from './ErrorDisplay';
```

### 6. Update CardGrid
Update `src/components/CardGrid.tsx`:
```typescript
// Update interface
interface CardGridProps {
  cards: VideoCardType[];
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCardType>) => void;
}

// Update VideoCard call
<VideoCard
  key={card.id}
  card={card}
  onToggleFavorite={onToggleFavorite}
  onAddLabel={onAddLabel}
  onRemoveLabel={onRemoveLabel}
  onThumbnailGenerated={onThumbnailGenerated}
  onCardUpdate={onCardUpdate}
/>
```

### 7. Update App.tsx
Update `src/App.tsx`:
```typescript
// CardGrid already gets updateCard via onThumbnailGenerated handler,
// now also pass it explicitly for retry:

<CardGrid
  cards={filteredCards}
  onToggleFavorite={toggleFavorite}
  onAddLabel={addLabel}
  onRemoveLabel={removeLabel}
  onThumbnailGenerated={handleThumbnailGenerated}
  onCardUpdate={updateCard}
/>
```

## Acceptance Criteria
- [ ] Error cards show detailed error message
- [ ] Retry button appears on error cards
- [ ] Clicking retry attempts generation again
- [ ] Retry count shows in error message (Attempt 1/3, etc.)
- [ ] Maximum 3 retry attempts enforced
- [ ] After max retries, retry button is disabled
- [ ] Exponential backoff delays between retries
- [ ] Retry shows loading state
- [ ] Successful retry updates same card (doesn't create new one)
- [ ] Card preserves favorites and labels through retry

## Files to Create/Modify
- `src/types/videoCard.ts` (update)
- `src/hooks/useVideoGeneration.ts` (update)
- `src/components/ErrorDisplay.tsx`
- `src/components/VideoCard.tsx` (update)
- `src/components/CardGrid.tsx` (update)
- `src/components/index.ts` (update)
- `src/App.tsx` (update)

## Testing
### Manual Testing Steps:
1. Force an error (disconnect internet or use invalid model ID)
2. Verify error card shows with message
3. Click "Retry" button
4. Verify card updates to "generating" state
5. Let it fail again
6. Verify retry count increments (Attempt 2/3)
7. Retry 3 times total
8. Verify retry button disables after 3rd attempt
9. Test successful retry (fix connection and retry)
10. Verify successful retry updates the same card

### Error Scenarios to Test:
- Network error (no internet)
- API error (invalid API key)
- Timeout error (very long generation)
- Invalid model ID
- Replicate service down
- Rate limit exceeded

### Edge Cases:
- Retry while another video is generating
- Favorite a card, retry it, verify favorite persists
- Add labels, retry, verify labels persist
- Retry multiple cards simultaneously

## Notes for Junior Engineers
- `Math.pow(2, n)` is exponential growth (1, 2, 4, 8, 16...)
- Exponential backoff: wait 1s, then 2s, then 4s, then 8s between retries
- `Math.min()` caps the delay at 10 seconds maximum
- `Boolean(value)` converts any value to true/false
- The `?` after property means "optional" - might be undefined
- `|| 0` provides a default value if retryCount is undefined
- Retry preserves the card ID so we update the same card
- Breaking the error message into multiple lines makes it more readable
- `flex-shrink-0` prevents the icon from shrinking in flex layout
- `break-words` wraps long error messages to prevent overflow
- Always provide user feedback during async operations (loading states!)
