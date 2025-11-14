import { useState, useCallback } from 'react';
import { fallbackCopy } from '../utils/clipboard';

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
