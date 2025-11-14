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
