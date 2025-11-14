# PR13: Polish & UX Improvements

## Dependencies
- ALL previous PRs (PR01-PR12) - this is the final polish pass

## Overview
Final polish pass to improve user experience, add animations, enhance accessibility, improve responsive design, and fix any remaining UX issues.

## Objectives
- Add smooth animations and transitions
- Improve loading states and feedback
- Enhance accessibility (keyboard navigation, ARIA labels, focus management)
- Polish responsive design for all screen sizes
- Add helpful tooltips where needed
- Improve empty states
- Add keyboard shortcuts (optional)
- Performance optimizations

## Technical Decisions
- Use CSS transitions for smooth animations
- Add `framer-motion` for complex animations (optional)
- Follow WCAG 2.1 AA accessibility standards
- Use `prefers-reduced-motion` for accessibility
- Optimize localStorage writes (debounce if needed)
- Add meta tags for PWA support (optional)

## Tasks

### 1. Add Smooth Animations
Create `src/styles/animations.css`:
```css
/* Fade in animation */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Skeleton loader */
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite;
}
```

Import in `src/index.css`:
```css
@import './styles/animations.css';
```

### 2. Add Card Delete Functionality
Create `src/components/DeleteButton.tsx`:
```typescript
import { useState } from 'react';

interface DeleteButtonProps {
  onDelete: () => void;
  itemName?: string;
}

export function DeleteButton({ onDelete, itemName = 'item' }: DeleteButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (showConfirm) {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => {
            onDelete();
            setShowConfirm(false);
          }}
          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
        >
          Confirm
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="text-gray-400 hover:text-red-600 transition-colors"
      aria-label={`Delete ${itemName}`}
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
    </button>
  );
}
```

### 3. Add Keyboard Shortcuts Hook
Create `src/hooks/useKeyboardShortcuts.ts`:
```typescript
import { useEffect } from 'react';

interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      shortcuts.forEach(({ key, ctrlKey, metaKey, shiftKey, action }) => {
        const matchesKey = e.key.toLowerCase() === key.toLowerCase();
        const matchesCtrl = ctrlKey === undefined || e.ctrlKey === ctrlKey;
        const matchesMeta = metaKey === undefined || e.metaKey === metaKey;
        const matchesShift = shiftKey === undefined || e.shiftKey === shiftKey;

        if (matchesKey && matchesCtrl && matchesMeta && matchesShift) {
          e.preventDefault();
          action();
        }
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
```

### 4. Add Loading Skeleton Component
Create `src/components/LoadingSkeleton.tsx`:
```typescript
export function VideoCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 pb-3">
        <div className="aspect-video bg-gray-200 rounded-lg skeleton"></div>
      </div>
      <div className="px-4 pb-4 space-y-3">
        <div className="flex gap-2">
          <div className="h-6 w-20 bg-gray-200 rounded-full skeleton"></div>
          <div className="h-6 w-32 bg-gray-200 rounded-full skeleton"></div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded skeleton"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4 skeleton"></div>
        </div>
      </div>
    </div>
  );
}
```

### 5. Add Tooltips Component
Create `src/components/Tooltip.tsx`:
```typescript
import { ReactNode, useState } from 'react';

interface TooltipProps {
  children: ReactNode;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ children, text, position = 'top' }: TooltipProps) {
  const [show, setShow] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap ${positionClasses[position]}`}
        >
          {text}
          <div className="absolute w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  );
}
```

### 6. Enhance VideoCard with Animations and Delete
Update `src/components/VideoCard.tsx`:
```typescript
// Add to imports
import { DeleteButton } from './DeleteButton';

// Add to props interface
interface VideoCardProps {
  // ... existing props
  onDelete: (id: string) => void;
}

// Add to component
export function VideoCard({
  // ... existing props
  onDelete,
}: VideoCardProps) {
  // ... existing code ...

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-fadeIn hover:shadow-md transition-shadow">
      {/* ... existing content ... */}

      {/* Add delete button to actions row */}
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

        {/* ... existing buttons ... */}
      </div>
    </div>
  );
}
```

### 7. Add Focus Trap for Modal
Update `src/components/AddLabelModal.tsx`:
```typescript
// Enhance with better focus management
useEffect(() => {
  if (isOpen) {
    // Focus input
    inputRef.current?.focus();

    // Trap focus within modal
    const handleTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Get all focusable elements in modal
        const focusable = document.querySelectorAll(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }

      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }
}, [isOpen, onClose]);
```

### 8. Add Better Empty States
Create `src/components/EmptyState.tsx`:
```typescript
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-4">
      <div className="mb-4 flex justify-center">{icon}</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-6 max-w-md mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
```

### 9. Add Meta Tags and PWA Support
Update `index.html`:
```html
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Video Prompt Lab - Experiment with video generation models via Replicate API" />
  <meta name="theme-color" content="#3B82F6" />

  <!-- PWA tags (optional) -->
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icon-192.png" />

  <title>Video Prompt Lab</title>
</head>
```

### 10. Update Component Exports
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
export * from './DeleteButton';
export * from './LoadingSkeleton';
export * from './Tooltip';
export * from './EmptyState';
```

### 11. Update App.tsx with Final Polish
Update `src/App.tsx`:
```typescript
// Add delete handler
const { cards, toggleFavorite, addLabel, removeLabel, updateCard, deleteCard } = useVideoCards();

// Update CardGrid to pass delete handler
<CardGrid
  cards={filteredCards}
  onToggleFavorite={toggleFavorite}
  onAddLabel={addLabel}
  onRemoveLabel={removeLabel}
  onThumbnailGenerated={handleThumbnailGenerated}
  onCardUpdate={updateCard}
  onDelete={deleteCard}
/>
```

### 12. Add README with Setup Instructions
Create `README.md` in project root:
```markdown
# Video Prompt Lab

A local-only application for experimenting with video generation models via the Replicate API.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` file:
   ```
   VITE_REPLICATE_API_KEY=your_api_key_here
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:5173 in your browser

## Features

- Test prompts across multiple Replicate video models
- Organize outputs with favorites and custom labels
- Copy prompts for easy iteration
- Local persistence (no backend required)
- Automatic thumbnail generation
- Filter by favorites and labels
- Retry failed generations

## Tech Stack

- Vite + React + TypeScript
- TailwindCSS
- Replicate API
- LocalStorage for persistence
```

## Acceptance Criteria
- [ ] All animations are smooth and performant
- [ ] Reduced motion is respected for accessibility
- [ ] Keyboard navigation works throughout app
- [ ] Delete functionality works with confirmation
- [ ] Tooltips appear on hover for helpful context
- [ ] Empty states are clear and actionable
- [ ] All interactive elements have focus styles
- [ ] Modal focus is trapped properly
- [ ] ESC key closes modals
- [ ] App is fully responsive (mobile, tablet, desktop)
- [ ] README provides clear setup instructions

## Files to Create/Modify
- `src/styles/animations.css`
- `src/components/DeleteButton.tsx`
- `src/components/Tooltip.tsx`
- `src/components/EmptyState.tsx`
- `src/components/LoadingSkeleton.tsx`
- `src/hooks/useKeyboardShortcuts.ts`
- `src/components/VideoCard.tsx` (update)
- `src/components/AddLabelModal.tsx` (update)
- `src/components/CardGrid.tsx` (update)
- `src/App.tsx` (update)
- `src/index.css` (update)
- `index.html` (update)
- `README.md` (create)
- `src/components/index.ts` (update)

## Testing

### Accessibility Testing:
- [ ] Tab through entire interface - all focusable elements reachable
- [ ] Shift+Tab works in reverse
- [ ] ESC closes modals
- [ ] Screen reader announces all buttons correctly
- [ ] All images have alt text
- [ ] Color contrast meets WCAG AA standards

### Responsive Testing:
- [ ] Test at 375px (mobile)
- [ ] Test at 768px (tablet)
- [ ] Test at 1024px (desktop)
- [ ] Test at 1440px+ (large desktop)

### UX Testing:
- [ ] All hover states work
- [ ] All loading states are clear
- [ ] Animations don't cause jank
- [ ] Delete confirmation prevents accidents
- [ ] Empty states are helpful

## Notes for Junior Engineers
- `prefers-reduced-motion` is a media query for users who prefer less motion (accessibility)
- Focus trap keeps keyboard navigation within modal (prevents focusing elements behind it)
- `z-index` controls stacking order (higher numbers appear on top)
- `whitespace-nowrap` prevents text from wrapping to multiple lines
- Skeleton loaders give users feedback while content loads
- Always test keyboard navigation - many users don't use a mouse!
- ARIA labels help screen readers describe interactive elements
- Tooltips should enhance, not replace, clear UI labels
- Confirmation dialogs prevent accidental destructive actions
- README should be clear enough for a new developer to get started quickly
