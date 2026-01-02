import { useState, useCallback, useEffect } from 'react';
import { getAwsVideoClient } from '../services/awsVideoClient';

const STORAGE_KEY = 'video-upvotes';

interface UpvotedVideos {
  [videoKey: string]: boolean;
}

function getUpvotedVideos(): UpvotedVideos {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setUpvotedVideos(upvoted: UpvotedVideos): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(upvoted));
}

export function useVideoUpvotes() {
  const [upvotedVideos, setUpvotedVideosState] = useState<UpvotedVideos>(getUpvotedVideos);
  const [pendingUpvotes, setPendingUpvotes] = useState<Set<string>>(new Set());

  // Sync with localStorage on mount
  useEffect(() => {
    setUpvotedVideosState(getUpvotedVideos());
  }, []);

  const isUpvoted = useCallback((videoKey: string): boolean => {
    return upvotedVideos[videoKey] === true;
  }, [upvotedVideos]);

  const toggleUpvote = useCallback(async (
    videoKey: string,
    _currentUpvotes: number,
    onSuccess?: (newUpvotes: number) => void
  ): Promise<void> => {
    // Prevent double-clicks
    if (pendingUpvotes.has(videoKey)) return;

    const wasUpvoted = upvotedVideos[videoKey] === true;
    const action = wasUpvoted ? 'decrement' : 'increment';

    // Optimistic update
    const newUpvotedVideos = { ...upvotedVideos };
    if (wasUpvoted) {
      delete newUpvotedVideos[videoKey];
    } else {
      newUpvotedVideos[videoKey] = true;
    }
    setUpvotedVideosState(newUpvotedVideos);
    setUpvotedVideos(newUpvotedVideos);

    // Mark as pending
    setPendingUpvotes(prev => new Set(prev).add(videoKey));

    try {
      const client = getAwsVideoClient();
      const result = await client.upvoteVideo(videoKey, action);
      onSuccess?.(result.upvotes);
    } catch (error) {
      console.error('Failed to toggle upvote:', error);
      // Revert on failure
      setUpvotedVideosState(upvotedVideos);
      setUpvotedVideos(upvotedVideos);
    } finally {
      setPendingUpvotes(prev => {
        const next = new Set(prev);
        next.delete(videoKey);
        return next;
      });
    }
  }, [upvotedVideos, pendingUpvotes]);

  const isPending = useCallback((videoKey: string): boolean => {
    return pendingUpvotes.has(videoKey);
  }, [pendingUpvotes]);

  return {
    isUpvoted,
    toggleUpvote,
    isPending,
  };
}
