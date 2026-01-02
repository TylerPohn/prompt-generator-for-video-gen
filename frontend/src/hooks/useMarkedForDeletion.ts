import { useState, useCallback } from 'react';
import { getAwsVideoClient } from '../services/awsVideoClient';

// Local cache for optimistic UI updates while API calls are in progress
// This is temporary state - the source of truth is the backend
const STORAGE_KEY = 'marked-for-deletion-cache';

interface MarkedVideos {
  [videoKey: string]: boolean;
}

function getMarkedVideosCache(): MarkedVideos {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setMarkedVideosCache(marked: MarkedVideos): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(marked));
}

export function useMarkedForDeletion() {
  // Local cache for optimistic UI updates
  const [markedVideos, setMarkedVideosState] = useState<MarkedVideos>(() => getMarkedVideosCache());
  const [pendingHides, setPendingHides] = useState<Set<string>>(new Set());

  const isMarked = useCallback((videoKey: string): boolean => {
    return markedVideos[videoKey] === true;
  }, [markedVideos]);

  const toggleMarked = useCallback(async (videoKey: string): Promise<void> => {
    // Prevent double-clicks
    if (pendingHides.has(videoKey)) return;

    const wasMarked = markedVideos[videoKey] === true;
    const newHiddenState = !wasMarked;

    // Optimistic update
    const newMarkedVideos = { ...markedVideos };
    if (wasMarked) {
      delete newMarkedVideos[videoKey];
    } else {
      newMarkedVideos[videoKey] = true;
    }
    setMarkedVideosState(newMarkedVideos);
    setMarkedVideosCache(newMarkedVideos);

    // Mark as pending
    setPendingHides(prev => new Set(prev).add(videoKey));

    try {
      const client = getAwsVideoClient();
      await client.hideVideo(videoKey, newHiddenState);
    } catch (error) {
      console.error('Failed to hide video:', error);
      // Revert on failure
      setMarkedVideosState(markedVideos);
      setMarkedVideosCache(markedVideos);
    } finally {
      setPendingHides(prev => {
        const next = new Set(prev);
        next.delete(videoKey);
        return next;
      });
    }
  }, [markedVideos, pendingHides]);

  const isPending = useCallback((videoKey: string): boolean => {
    return pendingHides.has(videoKey);
  }, [pendingHides]);

  const getMarkedCount = useCallback((): number => {
    return Object.keys(markedVideos).length;
  }, [markedVideos]);

  const getMarkedKeys = useCallback((): string[] => {
    return Object.keys(markedVideos);
  }, [markedVideos]);

  const clearAllMarked = useCallback((): void => {
    setMarkedVideosState({});
    setMarkedVideosCache({});
  }, []);

  return {
    isMarked,
    toggleMarked,
    isPending,
    getMarkedCount,
    getMarkedKeys,
    clearAllMarked,
  };
}
