import { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';

interface S3VideoCardProps {
  videoKey: string;
  url: string;
  size: number;
  lastModified: string;
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

export function S3VideoCard({ videoKey, url, size, lastModified }: S3VideoCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract filename from key (e.g., "generated-videos/abc123.mp4" -> "abc123.mp4")
  const filename = videoKey.split('/').pop() || videoKey;

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
      <div className="aspect-video">
        <VideoPlayer videoUrl={url} />
      </div>

      <div className="p-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left"
        >
          <p className="text-sm font-medium text-gray-200 truncate" title={filename}>
            {filename}
          </p>
        </button>

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
