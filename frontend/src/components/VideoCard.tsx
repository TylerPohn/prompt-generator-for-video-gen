import { useState, useRef } from 'react';
import type { VideoCard as VideoCardType } from '../types';
import { StatusBadge } from './StatusBadge';
import { VideoPlayer } from './VideoPlayer';
import { VideoPlaceholder } from './VideoPlaceholder';
import { CopyButton } from './CopyButton';
import { LabelBadge } from './LabelBadge';
import { AddLabelModal } from './AddLabelModal';
import { ErrorDisplay } from './ErrorDisplay';
import { DeleteButton } from './DeleteButton';
import { useLabelColors } from '../hooks';
import { useVideoGeneration } from '../hooks';
import { generateAndStoreThumbnail } from '../utils/thumbnail';
import { ENABLE_VIDEO_GEN } from '../services/config';

interface VideoCardProps {
  card: VideoCardType;
  onToggleFavorite: (id: string) => void;
  onToggleMarkedForDeletion: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCardType>) => void;
  onDelete: (id: string) => void;
}

export function VideoCard({
  card,
  onToggleFavorite,
  onToggleMarkedForDeletion,
  onAddLabel,
  onRemoveLabel,
  onThumbnailGenerated,
  onCardUpdate,
  onDelete,
}: VideoCardProps) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const { getColorForLabel } = useLabelColors();
  const { retry, generatingIds } = useVideoGeneration();
  const promptPreviewLength = 150;
  const needsTruncation = card.prompt.length > promptPreviewLength;
  const thumbnailGeneratedRef = useRef(false);

  const isRetrying = generatingIds.includes(card.id);
  const canRetry = (card.retryCount || 0) < 3;

  // Generate thumbnail ONLY when video becomes visible (lazy loading)
  const handleVideoVisible = () => {
    if (card.videoUrl && !card.thumbnailUrl && !thumbnailGeneratedRef.current) {
      thumbnailGeneratedRef.current = true;
      generateAndStoreThumbnail(card.videoUrl, (thumbnailUrl) => {
        onThumbnailGenerated(card.id, thumbnailUrl);
      });
    }
  };

  const displayPrompt = isPromptExpanded
    ? card.prompt
    : card.prompt.slice(0, promptPreviewLength) + (needsTruncation ? '...' : '');

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-fadeIn hover:shadow-md transition-shadow ${
      card.markedForDeletion ? 'ring-2 ring-red-400 opacity-75' : ''
    }`}>
      {/* Video/Placeholder */}
      <div className="p-4 pb-3">
        {card.status === 'complete' && card.videoUrl ? (
          <VideoPlayer videoUrl={card.videoUrl} onVisible={handleVideoVisible} />
        ) : (
          <VideoPlaceholder status={card.status} thumbnailUrl={card.thumbnailUrl} />
        )}
      </div>

      {/* Card Content */}
      <div className="px-4 pb-4 space-y-3">
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

        {/* Prompt */}
        <div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {displayPrompt}
          </p>
          {needsTruncation && (
            <button
              onClick={() => setIsPromptExpanded(!isPromptExpanded)}
              className="text-xs text-blue-600 hover:text-blue-800 mt-1"
            >
              {isPromptExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Error Message */}
        {card.status === 'error' && card.errorMessage && (
          <ErrorDisplay
            errorMessage={card.errorMessage}
            onRetry={() => retry(card, onCardUpdate)}
            canRetry={canRetry}
            isRetrying={isRetrying}
          />
        )}

        {/* Actions Row */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleFavorite(card.id)}
              className="text-2xl hover:scale-110 transition-transform"
              aria-label={card.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {card.isFavorite ? '⭐' : '☆'}
            </button>

            {/* Delete Button - only when video gen is enabled */}
            {ENABLE_VIDEO_GEN && (
              <DeleteButton
                onDelete={() => onDelete(card.id)}
                itemName="video card"
              />
            )}

            {/* Mark for Deletion Button - only when video gen is enabled */}
            {ENABLE_VIDEO_GEN && (
              <button
                onClick={() => onToggleMarkedForDeletion(card.id)}
                className={`text-xl hover:scale-110 transition-transform ${
                  card.markedForDeletion ? 'text-red-500' : 'text-gray-400 hover:text-red-400'
                }`}
                aria-label={card.markedForDeletion ? 'Unmark for deletion' : 'Mark for deletion'}
                title={card.markedForDeletion ? 'Unmark for deletion' : 'Mark for deletion'}
              >
                {card.markedForDeletion ? '🗑️' : '🗑'}
              </button>
            )}
          </div>

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

        {/* Timestamp */}
        <div className="text-xs text-gray-400">
          {new Date(card.createdAt).toLocaleString()}
        </div>
      </div>

      <AddLabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        onAdd={(label) => onAddLabel(card.id, label)}
        existingLabels={card.labels}
      />
    </div>
  );
}
