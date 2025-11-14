# PR09: Copy Prompt Functionality

## Dependencies
- PR06 (Video Card Component) - requires VideoCard component

## Overview
Add a "Copy Prompt" button to video cards that copies the prompt text to the user's clipboard. Show visual feedback when text is copied successfully.

## Objectives
- Add copy button to video cards
- Implement clipboard API functionality
- Show success feedback (temporary "Copied!" message)
- Handle clipboard API errors gracefully
- Work regardless of video generation status

## Technical Decisions
- Use modern Clipboard API (`navigator.clipboard.writeText`)
- Show "Copied!" confirmation for 2 seconds
- Button available immediately (works even while video is generating)
- Fallback for browsers without Clipboard API

## Tasks

### 1. Create useCopyToClipboard Hook
Create `src/hooks/useCopyToClipboard.ts`:
```typescript
import { useState, useCallback } from 'react';

interface CopyState {
  isCopied: boolean;
  error: Error | null;
}

export function useCopyToClipboard(resetDelay = 2000) {
  const [state, setState] = useState<CopyState>({
    isCopied: false,
    error: null,
  });

  const copy = useCallback(
    async (text: string) => {
      try {
        // Check if clipboard API is available
        if (!navigator.clipboard) {
          throw new Error('Clipboard API not supported');
        }

        await navigator.clipboard.writeText(text);
        setState({ isCopied: true, error: null });

        // Reset after delay
        setTimeout(() => {
          setState({ isCopied: false, error: null });
        }, resetDelay);
      } catch (error) {
        console.error('Failed to copy text:', error);
        setState({
          isCopied: false,
          error: error instanceof Error ? error : new Error('Copy failed'),
        });
      }
    },
    [resetDelay]
  );

  return { ...state, copy };
}
```

### 2. Create CopyButton Component
Create `src/components/CopyButton.tsx`:
```typescript
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface CopyButtonProps {
  text: string;
  label?: string;
}

export function CopyButton({ text, label = 'Copy Prompt' }: CopyButtonProps) {
  const { isCopied, copy } = useCopyToClipboard();

  return (
    <button
      onClick={() => copy(text)}
      className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors relative"
      aria-label={label}
    >
      {isCopied ? (
        <span className="flex items-center gap-1">
          <svg
            className="w-4 h-4 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          Copied!
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          Copy
        </span>
      )}
    </button>
  );
}
```

### 3. Update VideoCard Component
Update `src/components/VideoCard.tsx` to include the copy button:
```typescript
// Add import at top
import { CopyButton } from './CopyButton';

// In the Actions Row section, add CopyButton:
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
    <CopyButton text={card.prompt} />
    <button
      onClick={() => setIsLabelModalOpen(true)}
      className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
    >
      + Label
    </button>
  </div>
</div>
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
```

### 5. Update Hooks Index
Update `src/hooks/index.ts`:
```typescript
export * from './useVideoCards';
export * from './useLabelColors';
export * from './useLastModel';
export * from './useVideoGeneration';
export * from './useCopyToClipboard';
```

### 6. Add Fallback for Unsupported Browsers (Optional)
Create `src/utils/clipboard.ts` for legacy fallback:
```typescript
/**
 * Fallback copy method for browsers without Clipboard API
 */
export function fallbackCopy(text: string): boolean {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    document.body.removeChild(textArea);
    return false;
  }
}
```

Then update `useCopyToClipboard.ts` to use fallback:
```typescript
// In the copy function, update the catch to try fallback:
if (!navigator.clipboard) {
  // Try fallback method
  const success = fallbackCopy(text);
  if (success) {
    setState({ isCopied: true, error: null });
    setTimeout(() => {
      setState({ isCopied: false, error: null });
    }, resetDelay);
    return;
  }
  throw new Error('Clipboard API not supported and fallback failed');
}
```

## Acceptance Criteria
- [ ] Copy button appears on every video card
- [ ] Clicking button copies prompt to clipboard
- [ ] Button shows "Copied!" confirmation with checkmark
- [ ] Confirmation disappears after 2 seconds
- [ ] Button returns to normal "Copy" state after confirmation
- [ ] Works regardless of video generation status
- [ ] Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- [ ] Handles errors gracefully if clipboard access denied

## Files to Create/Modify
- `src/hooks/useCopyToClipboard.ts`
- `src/components/CopyButton.tsx`
- `src/components/VideoCard.tsx` (update)
- `src/components/index.ts` (update)
- `src/hooks/index.ts` (update)
- `src/utils/clipboard.ts` (optional fallback)

## Testing
### Manual Testing Steps:
1. Generate a video card
2. Click "Copy" button
3. Verify button shows "Copied!" with checkmark
4. Paste somewhere (Ctrl/Cmd+V) - verify prompt text appears
5. Wait 2 seconds - verify button returns to "Copy"
6. Try copying from a card in "pending" status - should work
7. Try copying from a card in "error" status - should work
8. Copy multiple different prompts - verify each copies correctly

### Browser Testing:
- Chrome (clipboard API supported)
- Firefox (clipboard API supported)
- Safari (clipboard API supported)
- Edge (clipboard API supported)

### Permission Testing:
- Some browsers may ask for clipboard permission - accept it
- Test denial scenario if possible

### Accessibility Testing:
- Tab to the button and press Enter - should copy
- Screen reader should announce "Copy Prompt" and "Copied!" states

## Notes for Junior Engineers
- `navigator.clipboard` is a modern browser API - doesn't work in very old browsers
- The `writeText` method is asynchronous (returns a Promise)
- `setTimeout` schedules code to run after a delay (in milliseconds)
- The checkmark SVG changes when `isCopied` is true
- `aria-label` helps screen readers describe the button
- `execCommand('copy')` is the old way (deprecated but works as fallback)
- Creating an offscreen textarea is a hack for old clipboard access
- `-999999px` position puts element far offscreen (invisible but still in DOM)
- `document.execCommand` is synchronous (no await needed)
- Modern way (Clipboard API) is better but requires user permission
