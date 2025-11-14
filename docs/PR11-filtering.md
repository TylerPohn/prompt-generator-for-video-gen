# PR11: Filtering & Search

## Dependencies
- PR07 (Card Grid Layout) - requires CardGrid and SectionHeader components
- PR08 (Labeling System) - needs labels to filter by

## Overview
Add filtering controls to allow users to filter video cards by favorites and by label. Display active filters clearly and update the grid dynamically.

## Objectives
- Add "Show Favorites Only" toggle
- Add label filter dropdown
- Filter cards based on active filters
- Show filtered count
- Persist filter state (optional)
- Clear/reset filters easily

## Technical Decisions
- Client-side filtering (all filtering happens in browser)
- Combine multiple filters (favorites AND label)
- Show all cards when no filters active
- Label dropdown shows only labels that exist in current cards
- Filters persist in component state (not localStorage - user preference)

## Tasks

### 1. Create useFilters Hook
Create `src/hooks/useFilters.ts`:
```typescript
import { useState, useMemo } from 'react';
import { VideoCard, FilterState } from '../types';

export function useFilters(cards: VideoCard[]) {
  const [filters, setFilters] = useState<FilterState>({
    showFavoritesOnly: false,
    selectedLabel: null,
  });

  // Get all unique labels from cards
  const availableLabels = useMemo(() => {
    const labelSet = new Set<string>();
    cards.forEach(card => {
      card.labels.forEach(label => labelSet.add(label));
    });
    return Array.from(labelSet).sort();
  }, [cards]);

  // Filter cards based on active filters
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // Filter by favorites
      if (filters.showFavoritesOnly && !card.isFavorite) {
        return false;
      }

      // Filter by label
      if (filters.selectedLabel && !card.labels.includes(filters.selectedLabel)) {
        return false;
      }

      return true;
    });
  }, [cards, filters]);

  const toggleFavoritesFilter = () => {
    setFilters(prev => ({
      ...prev,
      showFavoritesOnly: !prev.showFavoritesOnly,
    }));
  };

  const setLabelFilter = (label: string | null) => {
    setFilters(prev => ({
      ...prev,
      selectedLabel: label,
    }));
  };

  const clearFilters = () => {
    setFilters({
      showFavoritesOnly: false,
      selectedLabel: null,
    });
  };

  const hasActiveFilters = filters.showFavoritesOnly || filters.selectedLabel !== null;

  return {
    filters,
    filteredCards,
    availableLabels,
    toggleFavoritesFilter,
    setLabelFilter,
    clearFilters,
    hasActiveFilters,
  };
}
```

### 2. Create FilterControls Component
Create `src/components/FilterControls.tsx`:
```typescript
import { FilterState } from '../types';

interface FilterControlsProps {
  filters: FilterState;
  availableLabels: string[];
  onToggleFavorites: () => void;
  onSelectLabel: (label: string | null) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function FilterControls({
  filters,
  availableLabels,
  onToggleFavorites,
  onSelectLabel,
  onClearFilters,
  hasActiveFilters,
}: FilterControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Favorites Toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.showFavoritesOnly}
          onChange={onToggleFavorites}
          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">
          ⭐ Favorites Only
        </span>
      </label>

      {/* Label Filter Dropdown */}
      {availableLabels.length > 0 && (
        <select
          value={filters.selectedLabel || ''}
          onChange={(e) => onSelectLabel(e.target.value || null)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Labels</option>
          {availableLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      )}

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}
```

### 3. Create Active Filters Display Component
Create `src/components/ActiveFilters.tsx`:
```typescript
import { FilterState } from '../types';

interface ActiveFiltersProps {
  filters: FilterState;
  onRemoveFavoriteFilter: () => void;
  onRemoveLabelFilter: () => void;
}

export function ActiveFilters({
  filters,
  onRemoveFavoriteFilter,
  onRemoveLabelFilter,
}: ActiveFiltersProps) {
  const hasFilters = filters.showFavoritesOnly || filters.selectedLabel;

  if (!hasFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-sm text-gray-600">Active filters:</span>

      {filters.showFavoritesOnly && (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
          ⭐ Favorites
          <button
            onClick={onRemoveFavoriteFilter}
            className="hover:text-blue-900"
            aria-label="Remove favorites filter"
          >
            ×
          </button>
        </span>
      )}

      {filters.selectedLabel && (
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
          Label: {filters.selectedLabel}
          <button
            onClick={onRemoveLabelFilter}
            className="hover:text-purple-900"
            aria-label="Remove label filter"
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}
```

### 4. Update Component Index
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
```

### 5. Update Hooks Index
Update `src/hooks/index.ts`:
```typescript
export * from './useVideoCards';
export * from './useLabelColors';
export * from './useLastModel';
export * from './useVideoGeneration';
export * from './useCopyToClipboard';
export * from './useThumbnailGeneration';
export * from './useFilters';
```

### 6. Update App.tsx to Use Filters
Update `src/App.tsx`:
```typescript
import {
  PromptInputPanel,
  CardGrid,
  SectionHeader,
  FilterControls,
  ActiveFilters,
} from './components';
import { useVideoCards, useFilters } from './hooks';

function App() {
  const { cards, toggleFavorite, addLabel, removeLabel, updateCard } = useVideoCards();

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

        <div className="mb-8">
          <PromptInputPanel />
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
          />
        </div>
      </div>
    </div>
  );
}

export default App;
```

## Acceptance Criteria
- [ ] "Favorites Only" checkbox filters to show only favorited cards
- [ ] Label dropdown shows all labels currently in use
- [ ] Selecting a label filters to show only cards with that label
- [ ] Both filters can be active simultaneously (AND logic)
- [ ] Filtered count updates correctly in section header
- [ ] Active filters display as dismissible badges
- [ ] Clicking X on active filter badge removes that filter
- [ ] "Clear Filters" button removes all filters
- [ ] Empty state shows when filters result in no cards
- [ ] Filter controls are responsive on mobile

## Files to Create/Modify
- `src/hooks/useFilters.ts`
- `src/components/FilterControls.tsx`
- `src/components/ActiveFilters.tsx`
- `src/components/index.ts` (update)
- `src/hooks/index.ts` (update)
- `src/App.tsx` (update)

## Testing
### Manual Testing Steps:
1. Generate several videos and favorite some of them
2. Add different labels to different cards
3. Click "Favorites Only" checkbox - verify only favorites show
4. Uncheck "Favorites Only" - verify all cards return
5. Select a label from dropdown - verify only cards with that label show
6. Combine favorites + label filter - verify both apply
7. Click X on active filter badge - verify that filter is removed
8. Click "Clear Filters" - verify all filters are removed
9. Remove all labels from cards - verify label dropdown disappears
10. Check filtered count in header matches visible cards

### Edge Cases:
- No cards match filters (empty state)
- All cards match filters
- Removing a label that's currently filtered
- Unfavoriting a card while favorites filter is active
- No labels exist (dropdown should not show)
- Only one label exists

### Visual Testing:
- Filter controls align properly on mobile
- Active filter badges are readable and clickable
- Dropdown is properly styled and accessible
- Checkbox is properly sized and aligned

## Notes for Junior Engineers
- `useMemo` caches computed values - only recalculates when dependencies change
- `Set` is like an array but automatically removes duplicates
- `Array.from(set)` converts a Set back to an array
- `.sort()` alphabetically sorts the labels
- `includes()` checks if an array contains a value
- The `|| ''` in select value handles null (empty string shows "All Labels" option)
- Empty string in option value represents "no filter"
- `&&` before JSX means "only render if condition is true"
- Filtering happens in real-time as cards change (thanks to useMemo)
- The filters are AND logic: favorites AND label (both must match if both active)
- `hasActiveFilters` is a computed boolean - true if any filter is active
