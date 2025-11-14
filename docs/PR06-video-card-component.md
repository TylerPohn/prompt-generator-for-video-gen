# PR06: Video Card Component - Basic Structure

## Dependencies
- PR01 (Project Setup)
- PR02 (Data Model) - for VideoCard type
- PR03 (LocalStorage) - for useVideoCards hook

## Overview
Create the VideoCard component that displays generated videos with their metadata. This PR focuses on the basic card structure, displaying different states (pending, generating, complete, error), and showing the video player.

Note: Copy prompt functionality (PR09), labeling (PR08), and thumbnail generation (PR10) will be added in separate PRs.

## Objectives
- Create card component with all status states
- Display video when complete
- Show model badge
- Display prompt text
- Add favorite star toggle
- Show loading states appropriately
- Display placeholder when video not ready

## Technical Decisions
- Use HTML5 `<video>` element for playback
- Show different UI for each status state
- Use icons for star (can use Unicode or emoji for now)
- Truncate long prompts with expand option
- Card has fixed aspect ratio for thumbnails

## Tasks

### 1. Create Status Badge Component
Create `src/components/StatusBadge.tsx`:
```typescript
import { VideoStatus } from '../types';

interface StatusBadgeProps {
  status: VideoStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: {
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-800',
    },
    generating: {
      label: 'Generating',
      className: 'bg-blue-100 text-blue-800',
    },
    complete: {
      label: 'Complete',
      className: 'bg-green-100 text-green-800',
    },
    error: {
      label: 'Error',
      className: 'bg-red-100 text-red-800',
    },
  };

  const { label, className } = config[status];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
```

### 2. Create Video Player Component
Create `src/components/VideoPlayer.tsx`:
```typescript
interface VideoPlayerProps {
  videoUrl: string;
  alt?: string;
}

export function VideoPlayer({ videoUrl, alt = 'Generated video' }: VideoPlayerProps) {
  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden">
      <video
        src={videoUrl}
        controls
        className="w-full h-full"
        preload="metadata"
      >
        <track kind="captions" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
```

### 3. Create Video Placeholder Component
Create `src/components/VideoPlaceholder.tsx`:
```typescript
import { VideoStatus } from '../types';

interface VideoPlaceholderProps {
  status: VideoStatus;
}

export function VideoPlaceholder({ status }: VideoPlaceholderProps) {
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

### 4. Create Main VideoCard Component
Create `src/components/VideoCard.tsx`:
```typescript
import { useState } from 'react';
import { VideoCard as VideoCardType } from '../types';
import { StatusBadge } from './StatusBadge';
import { VideoPlayer } from './VideoPlayer';
import { VideoPlaceholder } from './VideoPlaceholder';

interface VideoCardProps {
  card: VideoCardType;
  onToggleFavorite: (id: string) => void;
}

export function VideoCard({ card, onToggleFavorite }: VideoCardProps) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const promptPreviewLength = 150;
  const needsTruncation = card.prompt.length > promptPreviewLength;

  const displayPrompt = isPromptExpanded
    ? card.prompt
    : card.prompt.slice(0, promptPreviewLength) + (needsTruncation ? '...' : '');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Video/Placeholder */}
      <div className="p-4 pb-3">
        {card.status === 'complete' && card.videoUrl ? (
          <VideoPlayer videoUrl={card.videoUrl} />
        ) : (
          <VideoPlaceholder status={card.status} />
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
          {/* Labels will be added in PR08 */}
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
          <div className="bg-red-50 border border-red-200 rounded p-2">
            <p className="text-xs text-red-800">{card.errorMessage}</p>
            {/* Retry button will be added in PR12 */}
          </div>
        )}

        {/* Actions Row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            onClick={() => onToggleFavorite(card.id)}
            className="text-2xl hover:scale-110 transition-transform"
            aria-label={card.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {card.isFavorite ? '⭐' : '☆'}
          </button>

          <div className="flex gap-2">
            {/* Copy prompt button will be added in PR09 */}
            {/* Add label button will be added in PR08 */}
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-gray-400">
          {new Date(card.createdAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
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
```

### 6. Add VideoCard to App (Temporary Test)
Update `src/App.tsx` to show cards:
```typescript
import { PromptInputPanel, VideoCard } from './components';
import { useVideoCards } from './hooks';

function App() {
  const { cards, toggleFavorite } = useVideoCards();

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

        <div className="mb-8">
          <PromptInputPanel />
        </div>

        {/* Temporary simple layout - will be replaced by CardGrid in PR07 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <VideoCard
              key={card.id}
              card={card}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>

        {cards.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No videos yet. Generate your first video above!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
```

## Acceptance Criteria
- [ ] Card displays all status states correctly
- [ ] Video plays when status is complete
- [ ] Placeholder shows during pending/generating states
- [ ] Model badge displays correctly
- [ ] Prompt text displays with truncation
- [ ] "Show more/less" works for long prompts
- [ ] Favorite star toggles between ⭐ and ☆
- [ ] Error messages display when status is error
- [ ] Timestamp displays in readable format
- [ ] Component is fully typed with TypeScript

## Files to Create/Modify
- `src/components/VideoCard.tsx`
- `src/components/VideoPlayer.tsx`
- `src/components/VideoPlaceholder.tsx`
- `src/components/StatusBadge.tsx`
- `src/components/index.ts` (update)
- `src/App.tsx` (update)

## Testing
### Manual Testing Steps:
1. Generate a video and watch it progress through states:
   - Pending → Generating → Complete
2. Click the star to favorite/unfavorite
3. Test with a long prompt (>150 chars) and verify truncation
4. Click "Show more" / "Show less"
5. Test error state (use invalid model or disconnect internet)
6. Verify video plays when complete
7. Check responsive layout on mobile

### Visual Testing:
- Card should have consistent spacing
- Video should maintain 16:9 aspect ratio
- Loading spinner should be centered and animated
- All badges should be readable
- Colors should match design (blue for generating, green for complete, etc.)

## Notes for Junior Engineers
- `aspect-video` is a Tailwind utility that maintains 16:9 ratio
- The `<track>` element in video is for accessibility (closed captions)
- `preload="metadata"` loads video info but not the full video initially
- `whitespace-pre-wrap` preserves line breaks in the prompt text
- `aria-label` helps screen readers understand button purpose
- The star uses Unicode characters: ⭐ (filled) and ☆ (outline)
- `toLocaleString()` formats the timestamp based on user's locale
- Controlled expansion state (`isPromptExpanded`) lets us toggle the view
- The `?` in `card.videoUrl?` is optional chaining - safe even if videoUrl is undefined
