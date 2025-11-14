# PR07: Card Grid Layout

## Dependencies
- PR01 (Project Setup)
- PR06 (Video Card Component) - requires VideoCard component

## Overview
Create a responsive grid layout component for displaying video cards. Replace the temporary grid in App.tsx with a proper CardGrid component that handles responsive breakpoints and empty states.

## Objectives
- Create dedicated CardGrid component
- Implement responsive grid layout
- Add empty state messaging
- Ensure proper spacing and alignment
- Handle sorting (newest first)

## Technical Decisions
- Use CSS Grid with Tailwind utilities
- Responsive breakpoints: 1 column (mobile), 2 (tablet), 3 (desktop)
- Cards displayed newest first (already handled by useVideoCards)
- Simple grid layout (masonry can be added later as stretch feature)

## Tasks

### 1. Create CardGrid Component
Create `src/components/CardGrid.tsx`:
```typescript
import { VideoCard as VideoCardType } from '../types';
import { VideoCard } from './VideoCard';

interface CardGridProps {
  cards: VideoCardType[];
  onToggleFavorite: (id: string) => void;
}

export function CardGrid({ cards, onToggleFavorite }: CardGridProps) {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card) => (
        <VideoCard
          key={card.id}
          card={card}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
```

### 2. Create Section Header Component
Create `src/components/SectionHeader.tsx`:
```typescript
interface SectionHeaderProps {
  title: string;
  count?: number;
  children?: React.ReactNode;
}

export function SectionHeader({ title, count, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-lg font-normal text-gray-500">
              ({count})
            </span>
          )}
        </h2>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

### 3. Update Component Index
Update `src/components/index.ts`:
```typescript
export * from './PromptInputPanel';
export * from './VideoCard';
export * from './VideoPlayer';
export * from './VideoPlaceholder';
export * from './StatusBadge';
export * from './CardGrid';
export * from './SectionHeader';
```

### 4. Update App.tsx to Use CardGrid
Update `src/App.tsx`:
```typescript
import { PromptInputPanel, CardGrid, SectionHeader } from './components';
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

        <div className="mt-12">
          <SectionHeader title="Generated Videos" count={cards.length}>
            {/* Filter controls will be added in PR11 */}
          </SectionHeader>

          <CardGrid cards={cards} onToggleFavorite={toggleFavorite} />
        </div>
      </div>
    </div>
  );
}

export default App;
```

### 5. Add Responsive Container Adjustments (Optional)
If needed, adjust max-width for better layout:
```typescript
// In App.tsx, can change max-w-7xl to:
// max-w-6xl for tighter layout
// max-w-screen-2xl for wider layout
```

## Acceptance Criteria
- [ ] Grid displays 1 column on mobile (<768px)
- [ ] Grid displays 2 columns on tablet (768px-1024px)
- [ ] Grid displays 3 columns on desktop (>1024px)
- [ ] Empty state shows when no cards exist
- [ ] Cards have consistent spacing between them
- [ ] Section header shows count of videos
- [ ] Layout is centered and responsive
- [ ] Empty state includes helpful icon and message

## Files to Create/Modify
- `src/components/CardGrid.tsx`
- `src/components/SectionHeader.tsx`
- `src/components/index.ts` (update)
- `src/App.tsx` (update)

## Testing
### Manual Testing Steps:
1. Start with no cards - verify empty state shows
2. Generate 1 card - verify it displays properly
3. Generate several cards - verify grid layout
4. Resize browser window to test responsive breakpoints:
   - Mobile view (< 768px): 1 column
   - Tablet view (768-1024px): 2 columns
   - Desktop view (> 1024px): 3 columns
5. Verify card count in header updates correctly

### Visual Testing:
- Check spacing between cards is consistent
- Verify empty state is centered and looks good
- Check that icon in empty state is properly sized
- Ensure no layout shift when cards load
- Test with different numbers of cards (1, 2, 3, 10, etc.)

### Responsive Testing Widths:
- 375px (mobile)
- 768px (tablet)
- 1024px (small desktop)
- 1440px (large desktop)

## Notes for Junior Engineers
- CSS Grid vs Flexbox: Grid is better for 2D layouts (rows AND columns)
- `gap-6` adds spacing between grid items automatically - no need for margins!
- Tailwind's responsive prefixes: `md:` = medium screens (768px+), `lg:` = large (1024px+)
- The empty state uses an SVG icon - this scales perfectly at any size
- `aria-hidden="true"` tells screen readers to ignore the decorative icon
- `strokeLinecap="round"` makes SVG lines have rounded ends (looks smoother)
- The `?` in `count !== undefined` checks if count exists (could be 0!)
- Passing `children` to components lets you add content from the parent
- `React.ReactNode` is the type for anything that can be rendered (text, elements, etc.)
