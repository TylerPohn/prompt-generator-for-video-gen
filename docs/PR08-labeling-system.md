# PR08: Labeling System

## Dependencies
- PR03 (LocalStorage) - for useLabelColors hook
- PR06 (Video Card Component) - requires VideoCard component

## Overview
Add the ability to create, display, and remove custom labels on video cards. Each label gets a persistent random color. Labels appear as colored badges on cards.

## Objectives
- Create label badge component with colors
- Add "Add Label" button and modal/input
- Display labels on cards
- Allow removing labels
- Persist label colors in localStorage
- Integrate with VideoCard component

## Technical Decisions
- Simple modal/dialog for adding labels
- Click X to remove a label from card
- Label colors assigned randomly from predefined palette
- Colors persist in localStorage (same label = same color always)
- Labels are case-sensitive

## Tasks

### 1. Create Label Badge Component
Create `src/components/LabelBadge.tsx`:
```typescript
interface LabelBadgeProps {
  label: string;
  color: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export function LabelBadge({ label, color, onRemove, size = 'sm' }: LabelBadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: color + '20', // 20% opacity
        color: color,
        borderColor: color,
        borderWidth: '1px',
      }}
    >
      {label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove ${label} label`}
        >
          ×
        </button>
      )}
    </span>
  );
}
```

### 2. Create Add Label Modal Component
Create `src/components/AddLabelModal.tsx`:
```typescript
import { useState, FormEvent, useEffect, useRef } from 'react';

interface AddLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (label: string) => void;
  existingLabels: string[];
}

export function AddLabelModal({ isOpen, onClose, onAdd, existingLabels }: AddLabelModalProps) {
  const [labelText, setLabelText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = labelText.trim();

    if (!trimmed) return;

    if (existingLabels.includes(trimmed)) {
      alert('This label already exists on this card');
      return;
    }

    onAdd(trimmed);
    setLabelText('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Add Label</h3>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            placeholder="Enter label name..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            maxLength={30}
          />

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!labelText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Add Label
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### 3. Update VideoCard to Include Labels
Update `src/components/VideoCard.tsx`:
```typescript
// Add these imports at the top
import { LabelBadge } from './LabelBadge';
import { AddLabelModal } from './AddLabelModal';
import { useLabelColors } from '../hooks';

// Update VideoCardProps interface
interface VideoCardProps {
  card: VideoCardType;
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
}

// Inside VideoCard component, add:
export function VideoCard({
  card,
  onToggleFavorite,
  onAddLabel,
  onRemoveLabel,
}: VideoCardProps) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const { getColorForLabel } = useLabelColors();

  // ... rest of existing code ...

  // Update the badges row section to include labels:
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

  // Update the actions row to add the "Add Label" button:
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
      <button
        onClick={() => setIsLabelModalOpen(true)}
        className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
      >
        + Label
      </button>
      {/* Copy prompt button will be added in PR09 */}
    </div>
  </div>

  // Add modal at the end, before closing </div>:
  <AddLabelModal
    isOpen={isLabelModalOpen}
    onClose={() => setIsLabelModalOpen(false)}
    onAdd={(label) => onAddLabel(card.id, label)}
    existingLabels={card.labels}
  />
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
```

### 5. Update App.tsx and CardGrid
Update `src/App.tsx`:
```typescript
// Update the useVideoCards destructuring
const { cards, toggleFavorite, addLabel, removeLabel } = useVideoCards();

// Update CardGrid call to pass label handlers
<CardGrid
  cards={cards}
  onToggleFavorite={toggleFavorite}
  onAddLabel={addLabel}
  onRemoveLabel={removeLabel}
/>
```

Update `src/components/CardGrid.tsx`:
```typescript
// Update interface
interface CardGridProps {
  cards: VideoCardType[];
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
}

// Update component
export function CardGrid({
  cards,
  onToggleFavorite,
  onAddLabel,
  onRemoveLabel,
}: CardGridProps) {
  // ... existing code ...

  // Update VideoCard in the map:
  <VideoCard
    key={card.id}
    card={card}
    onToggleFavorite={onToggleFavorite}
    onAddLabel={onAddLabel}
    onRemoveLabel={onRemoveLabel}
  />
}
```

## Acceptance Criteria
- [ ] "Add Label" button opens modal
- [ ] Modal input is auto-focused when opened
- [ ] Can type and submit label name
- [ ] Label appears as colored badge on card
- [ ] Same label always has same color across all cards
- [ ] Can remove label by clicking X on badge
- [ ] Cannot add duplicate labels to same card
- [ ] Labels persist across page refreshes
- [ ] Modal closes on submit or cancel
- [ ] Clicking outside modal closes it

## Files to Create/Modify
- `src/components/LabelBadge.tsx`
- `src/components/AddLabelModal.tsx`
- `src/components/VideoCard.tsx` (update)
- `src/components/CardGrid.tsx` (update)
- `src/components/index.ts` (update)
- `src/App.tsx` (update)

## Testing
### Manual Testing Steps:
1. Click "+ Label" button on a card
2. Verify modal opens and input is focused
3. Type a label name and press Enter (or click Add)
4. Verify label appears as colored badge
5. Add same label to another card - verify color matches
6. Click X on label badge - verify it's removed
7. Try adding duplicate label - verify warning/prevention
8. Click outside modal - verify it closes
9. Refresh page - verify labels and colors persist

### Edge Cases:
- Empty label (should be blocked)
- Very long label (should have maxLength)
- Special characters in label
- Multiple labels on one card
- Clicking X should not trigger other card actions

## Notes for Junior Engineers
- `e.stopPropagation()` prevents click events from bubbling up to parent elements
- `useRef` gives you direct access to a DOM element (for focus)
- `?.` is optional chaining - safe even if ref is null
- The modal overlay uses `fixed inset-0` to cover the entire screen
- `z-50` ensures modal appears above other content
- Adding `20` to hex color creates 20% opacity (e.g., `#EF444420`)
- Inline styles with `style={{}}` for dynamic colors (can't use Tailwind for this)
- `maxLength` attribute limits input characters
- Modal pattern: dark overlay + centered white box
- Accessibility: `aria-label` on remove button, auto-focus on input
