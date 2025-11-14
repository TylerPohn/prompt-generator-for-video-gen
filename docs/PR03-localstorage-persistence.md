# PR03: LocalStorage Persistence Layer

## Dependencies
- PR01 (Project Setup)
- PR02 (Data Model) - requires VideoCard, LabelColorMap types

## Overview
Implement a localStorage-based persistence layer for storing video cards, labels, favorites, and user preferences. This includes utility functions and custom React hooks for managing state with localStorage.

## Objectives
- Create localStorage utility functions with proper error handling
- Implement hooks for reading/writing video cards
- Add persistence for label colors and last selected model
- Handle serialization/deserialization safely

## Technical Decisions
- Use custom React hooks for localStorage integration
- Namespace all keys with `videoPromptLab:` prefix
- Handle localStorage errors gracefully (quota exceeded, etc.)
- Parse/stringify JSON safely with error handling

## Tasks

### 1. Create LocalStorage Utility
Create `src/utils/localStorage.ts`:
```typescript
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

### 2. Create useVideoCards Hook
Create `src/hooks/useVideoCards.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react';
import { VideoCard } from '../types';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';

export function useVideoCards() {
  const [cards, setCards] = useState<VideoCard[]>(() =>
    getFromStorage<VideoCard[]>(StorageKeys.VIDEO_CARDS, [])
  );

  // Save to localStorage whenever cards change
  useEffect(() => {
    setToStorage(StorageKeys.VIDEO_CARDS, cards);
  }, [cards]);

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

### 3. Create useLabelColors Hook
Create `src/hooks/useLabelColors.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react';
import { LabelColorMap } from '../types';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';

const LABEL_COLORS = [
  '#EF4444', // red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

function getRandomColor(): string {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
}

export function useLabelColors() {
  const [labelColors, setLabelColors] = useState<LabelColorMap>(() =>
    getFromStorage<LabelColorMap>(StorageKeys.LABEL_COLORS, {})
  );

  useEffect(() => {
    setToStorage(StorageKeys.LABEL_COLORS, labelColors);
  }, [labelColors]);

  const getColorForLabel = useCallback((label: string): string => {
    if (labelColors[label]) {
      return labelColors[label];
    }

    // Assign new random color
    const color = getRandomColor();
    setLabelColors(prev => ({ ...prev, [label]: color }));
    return color;
  }, [labelColors]);

  return { labelColors, getColorForLabel };
}
```

### 4. Create useLastModel Hook
Create `src/hooks/useLastModel.ts`:
```typescript
import { useState, useEffect } from 'react';
import { StorageKeys, getFromStorage, setToStorage } from '../utils/localStorage';
import { AVAILABLE_MODELS } from '../types';

export function useLastModel() {
  const [lastModel, setLastModel] = useState<string>(() =>
    getFromStorage<string>(
      StorageKeys.LAST_MODEL,
      AVAILABLE_MODELS[0]?.id || ''
    )
  );

  useEffect(() => {
    if (lastModel) {
      setToStorage(StorageKeys.LAST_MODEL, lastModel);
    }
  }, [lastModel]);

  return { lastModel, setLastModel };
}
```

### 5. Create Hooks Index
Create `src/hooks/index.ts`:
```typescript
export * from './useVideoCards';
export * from './useLabelColors';
export * from './useLastModel';
```

## Acceptance Criteria
- [ ] All localStorage operations have error handling
- [ ] Video cards persist across page refreshes
- [ ] Label colors persist and remain consistent
- [ ] Last selected model persists
- [ ] Hooks work with React strict mode (no double-save issues)
- [ ] QuotaExceeded errors are handled gracefully
- [ ] All hooks are properly typed with TypeScript

## Files to Create
- `src/utils/localStorage.ts`
- `src/hooks/useVideoCards.ts`
- `src/hooks/useLabelColors.ts`
- `src/hooks/useLastModel.ts`
- `src/hooks/index.ts`

## Testing
### Manual Testing Steps:
1. Add a video card using the hook
2. Refresh the page
3. Verify the card is still there
4. Check browser DevTools → Application → Local Storage
5. Verify data is stored with correct keys
6. Try adding labels and verify colors persist

### Edge Cases to Test:
- Empty localStorage (first run)
- Corrupted JSON in localStorage (should fall back to defaults)
- Very large number of cards (test quota limits)

## Notes for Junior Engineers
- `useCallback` prevents functions from changing on every render (performance optimization)
- The arrow function in `useState(() => ...)` is called "lazy initialization" - runs only once
- Always wrap localStorage operations in try/catch - they can fail!
- The spread operator `{ ...card, ...updates }` merges objects - updates override card properties
- Array `.map()` creates a new array - important for React's change detection
- The `[cards]` in `useEffect` is a dependency array - effect runs when cards change
