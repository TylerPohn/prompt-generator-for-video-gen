import type { VideoCard as VideoCardType } from '../types';
import { VideoCard } from './VideoCard';

interface CardGridProps {
  cards: VideoCardType[];
  onToggleFavorite: (id: string) => void;
  onAddLabel: (id: string, label: string) => void;
  onRemoveLabel: (id: string, label: string) => void;
  onThumbnailGenerated: (id: string, thumbnailUrl: string) => void;
  onCardUpdate: (id: string, updates: Partial<VideoCardType>) => void;
  onDelete: (id: string) => void;
}

export function CardGrid({
  cards,
  onToggleFavorite,
  onAddLabel,
  onRemoveLabel,
  onThumbnailGenerated,
  onCardUpdate,
  onDelete,
}: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mb-4">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No videos yet
        </h3>
        <p className="text-gray-500">
          Generate your first video using the prompt above!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {cards.map((card) => (
        <VideoCard
          key={card.id}
          card={card}
          onToggleFavorite={onToggleFavorite}
          onAddLabel={onAddLabel}
          onRemoveLabel={onRemoveLabel}
          onThumbnailGenerated={onThumbnailGenerated}
          onCardUpdate={onCardUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
