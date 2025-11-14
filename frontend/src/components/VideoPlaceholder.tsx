import type { VideoStatus } from '../types';

interface VideoPlaceholderProps {
  status: VideoStatus;
  thumbnailUrl?: string;
}

export function VideoPlaceholder({ status, thumbnailUrl }: VideoPlaceholderProps) {
  const getMessage = () => {
    switch (status) {
      case 'pending':
        return 'Queued...';
      case 'generating':
        return 'Generating video...';
      case 'error':
        return 'Failed to generate';
      default:
        return 'Loading...';
    }
  };

  // If we have a thumbnail, show it with overlay
  if (thumbnailUrl) {
    return (
      <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden relative">
        <img
          src={thumbnailUrl}
          alt="Video thumbnail"
          className="w-full h-full object-cover"
        />
        {status === 'generating' && (
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-3">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
              </div>
              <p className="text-white text-sm font-medium">{getMessage()}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // No thumbnail - show regular placeholder
  return (
    <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
      <div className="text-center">
        {status === 'generating' && (
          <div className="mb-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}
        <p className="text-gray-600 text-sm">{getMessage()}</p>
      </div>
    </div>
  );
}
