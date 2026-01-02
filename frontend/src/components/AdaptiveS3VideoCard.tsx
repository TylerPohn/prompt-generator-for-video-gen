import { useState, useEffect } from 'react';
import { AdaptiveVideoPlayer } from './AdaptiveVideoPlayer';
import { HeartIcon } from './HeartIcon';

interface AdaptiveS3VideoCardProps {
  videoKey: string;
  url: string;
  size: number;
  lastModified: string;
  upvotes: number;
  isUpvoted: boolean;
  isPending: boolean;
  onToggleUpvote: () => void;
  forceAspect?: 'adaptive' | 'landscape' | 'portrait';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(isoString: string): string {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

export function AdaptiveS3VideoCard({
  videoKey,
  url,
  size,
  lastModified,
  upvotes,
  isUpvoted,
  isPending,
  onToggleUpvote,
  forceAspect
}: AdaptiveS3VideoCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayUpvotes, setDisplayUpvotes] = useState(upvotes);
  const filename = videoKey.split('/').pop() || videoKey;

  // Update display when props change
  useEffect(() => {
    setDisplayUpvotes(upvotes);
  }, [upvotes]);

  const handleUpvoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic UI update
    setDisplayUpvotes(prev => isUpvoted ? Math.max(0, prev - 1) : prev + 1);
    onToggleUpvote();
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg break-inside-avoid mb-6">
      <AdaptiveVideoPlayer videoUrl={url} forceAspect={forceAspect} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-1 text-left min-w-0"
          >
            <p className="text-sm font-medium text-gray-200 truncate" title={filename}>
              {filename}
            </p>
          </button>

          {/* Upvote Button */}
          <button
            onClick={handleUpvoteClick}
            disabled={isPending}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
              isUpvoted
                ? 'text-red-500 hover:text-red-400'
                : 'text-gray-400 hover:text-red-400'
            } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isUpvoted ? 'Remove upvote' : 'Upvote'}
          >
            <HeartIcon filled={isUpvoted} className="w-4 h-4" />
            <span className="text-xs font-medium">{displayUpvotes}</span>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>{formatFileSize(size)}</span>
          <span>{formatDate(lastModified)}</span>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-500 break-all">
              {videoKey}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
