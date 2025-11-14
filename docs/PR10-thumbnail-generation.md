# PR10: Thumbnail Generation

## Dependencies
- PR06 (Video Card Component) - requires VideoCard and VideoPlayer components

## Overview
Automatically extract a thumbnail image from completed videos using HTML5 video element and canvas. Store thumbnail as data URL in localStorage for persistence.

## Objectives
- Capture first frame of video as thumbnail
- Store thumbnail in VideoCard data
- Display thumbnail in placeholder/card preview
- Handle thumbnail extraction errors gracefully
- Update VideoCard when thumbnail is generated

## Technical Decisions
- Use HTML5 `<video>` + `<canvas>` for frame capture
- Capture frame at 0.1 seconds (not exactly 0, which is often black)
- Store as data URL (base64 encoded image)
- Generate thumbnail after video loads
- Fallback to placeholder if thumbnail fails

## Tasks

### 1. Create Thumbnail Utility
Create `src/utils/thumbnail.ts`:
```typescript
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

### 2. Create useThumbnailGeneration Hook
Create `src/hooks/useThumbnailGeneration.ts`:
```typescript
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

### 3. Update VideoPlaceholder to Show Thumbnail
Update `src/components/VideoPlaceholder.tsx`:
```typescript
import { VideoStatus } from '../types';

interface VideoPlaceholderProps {
  status: VideoStatus;
  thumbnailUrl?: string;
}

export function VideoPlaceholder({ status, thumbnailUrl }: VideoPlaceholderProps) {
  const getMessage = () => {
    switch (status) {
      case 'pending':
        return 'Queued...';
      case 'generating':
        return 'Generating video...';
      case 'error':
        return 'Failed to generate';
      default:
        return 'Loading...';
    }
  };

  // If we have a thumbnail, show it with overlay
  if (thumbnailUrl) {
    return (
      <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden relative">
        <img
          src={thumbnailUrl}
          alt="Video thumbnail"
          className="w-full h-full object-cover"
        />
        {status === 'generating' && (
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-3">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
              </div>
              <p className="text-white text-sm font-medium">{getMessage()}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // No thumbnail - show regular placeholder
  return (
    <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
      <div className="text-center">
        {status === 'generating' && (
          <div className="mb-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}
        <p className="text-gray-600 text-sm">{getMessage()}</p>
      </div>
    </div>
  );
}
```

### 4. Update VideoCard Component
Update `src/components/VideoCard.tsx`:
```typescript
// Add import
import { useThumbnailGeneration } from '../hooks/useThumbnailGeneration';

// Update interface
interface VideoCardProps {
  card: VideoCardType;
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
}

// In the component
export function VideoCard({
  card,
  onToggleFavorite,
  onAddLabel,
  onRemoveLabel,
  onThumbnailGenerated,
}: VideoCardProps) {
  // ... existing state ...

  // Generate thumbnail when video completes
  useThumbnailGeneration({
    videoUrl: card.videoUrl,
    cardId: card.id,
    onThumbnailGenerated,
  });

  // ... rest of component ...

  // Update the placeholder to pass thumbnailUrl:
  <VideoPlaceholder status={card.status} thumbnailUrl={card.thumbnailUrl} />
}
```

### 5. Update CardGrid Component
Update `src/components/CardGrid.tsx`:
```typescript
// Update interface
interface CardGridProps {
  cards: VideoCardType[];
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
}

// Update VideoCard call
<VideoCard
  key={card.id}
  card={card}
  onToggleFavorite={onToggleFavorite}
  onAddLabel={onAddLabel}
  onRemoveLabel={onRemoveLabel}
  onThumbnailGenerated={onThumbnailGenerated}
/>
```

### 6. Update App.tsx
Update `src/App.tsx`:
```typescript
// Add to useVideoCards destructuring
const { cards, toggleFavorite, addLabel, removeLabel, updateCard } = useVideoCards();

// Create thumbnail handler
const handleThumbnailGenerated = (id: string, thumbnailUrl: string) => {
  updateCard(id, { thumbnailUrl });
};

// Update CardGrid call
<CardGrid
  cards={cards}
  onToggleFavorite={toggleFavorite}
  onAddLabel={addLabel}
  onRemoveLabel={removeLabel}
  onThumbnailGenerated={handleThumbnailGenerated}
/>
```

### 7. Update Hooks and Utils Index Files
Update `src/hooks/index.ts`:
```typescript
export * from './useVideoCards';
export * from './useLabelColors';
export * from './useLastModel';
export * from './useVideoGeneration';
export * from './useCopyToClipboard';
export * from './useThumbnailGeneration';
```

Create `src/utils/index.ts`:
```typescript
export * from './localStorage';
export * from './thumbnail';
```

## Acceptance Criteria
- [ ] Thumbnail automatically generates when video completes
- [ ] Thumbnail shows first frame of video (at ~0.1s)
- [ ] Thumbnail persists across page refreshes
- [ ] Thumbnail displays in placeholder while video is loading
- [ ] Fallback to regular placeholder if thumbnail fails
- [ ] No errors when thumbnail generation fails
- [ ] Thumbnail maintains aspect ratio
- [ ] Works with various video formats

## Files to Create/Modify
- `src/utils/thumbnail.ts`
- `src/utils/index.ts` (create)
- `src/hooks/useThumbnailGeneration.ts`
- `src/hooks/index.ts` (update)
- `src/components/VideoPlaceholder.tsx` (update)
- `src/components/VideoCard.tsx` (update)
- `src/components/CardGrid.tsx` (update)
- `src/App.tsx` (update)

## Testing
### Manual Testing Steps:
1. Generate a video
2. Wait for video to complete
3. Verify thumbnail appears automatically
4. Refresh the page
5. Verify thumbnail is still there (persisted)
6. Generate multiple videos - verify each gets thumbnail
7. Check that thumbnails show meaningful frames (not black screens)

### Edge Cases:
- Very short videos (< 0.1s)
- Videos that fail to load
- Videos with CORS restrictions
- Large videos (check performance)

### Visual Testing:
- Thumbnail should be sharp and clear
- Should maintain proper aspect ratio
- Should show a representative frame
- Should work with different video resolutions

## Notes for Junior Engineers
- `<canvas>` is an HTML element for drawing graphics with JavaScript
- `drawImage()` can draw a video frame onto canvas
- `toDataURL()` converts canvas to base64 image string
- Data URLs are strings like `data:image/jpeg;base64,/9j/4AAQ...`
- Data URLs can be stored in localStorage (they're just strings!)
- `crossOrigin="anonymous"` allows canvas to capture frames from external videos
- Some video hosts block CORS - thumbnail may fail for those
- `seeked` event fires when video jumps to a specific time
- `loadedmetadata` event fires when video dimensions are known
- JPEG quality 0.8 (80%) is good balance of size vs quality
- Using 0.1s instead of 0s avoids black frames that are often at the start
- The Promise pattern lets us wait for async video operations
- Always clean up: set `video.src = ''` to free memory
