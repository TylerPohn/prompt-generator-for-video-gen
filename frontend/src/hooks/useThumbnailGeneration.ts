import { useEffect } from 'react';
import { generateAndStoreThumbnail } from '../utils/thumbnail';

interface UseThumbnailGenerationProps {
  videoUrl?: string;
  cardId: string;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
}

export function useThumbnailGeneration({
  videoUrl,
  cardId,
  onThumbnailGenerated,
}: UseThumbnailGenerationProps) {
  useEffect(() => {
    if (!videoUrl) return;

    // Generate thumbnail when video URL becomes available
    generateAndStoreThumbnail(videoUrl, (thumbnailUrl) => {
      onThumbnailGenerated(cardId, thumbnailUrl);
    });
  }, [videoUrl, cardId, onThumbnailGenerated]);
}
