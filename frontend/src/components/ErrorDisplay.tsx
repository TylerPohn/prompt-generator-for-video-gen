interface ErrorDisplayProps {
  errorMessage: string;
  onRetry?: () => void;
  canRetry: boolean;
  isRetrying?: boolean;
}

export function ErrorDisplay({
  errorMessage,
  onRetry,
  canRetry,
  isRetrying = false,
}: ErrorDisplayProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-800 font-medium mb-1">
            Generation Failed
          </p>
          <p className="text-xs text-red-700 break-words">
            {errorMessage}
          </p>

          {canRetry && onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="mt-3 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors"
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}

          {!canRetry && (
            <p className="mt-2 text-xs text-red-600 font-medium">
              Maximum retry attempts reached. Please try again with a new generation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
