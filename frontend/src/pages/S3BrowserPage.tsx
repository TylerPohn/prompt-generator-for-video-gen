import { useEffect, useRef, useCallback, useState } from 'react';
import { EmptyState, S3VideoFilterControls } from '../components';
import { AdaptiveVideoCardSkeleton } from '../components/LoadingSkeleton';
import { AdaptiveS3VideoCard } from '../components/AdaptiveS3VideoCard';
import { useS3Videos } from '../hooks';

type DisplayMode = 'adaptive' | 'landscape' | 'portrait';

export function S3BrowserPage() {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('adaptive');
  const {
    videos,
    isLoading,
    error,
    hasMore,
    totalCount,
    filters,
    setSearchQuery,
    setSortField,
    toggleSortOrder,
    clearFilters,
    hasActiveFilters,
    loadMore,
    loadAll,
    refresh,
  } = useS3Videos();

  // Infinite scroll: observe a sentinel element at the bottom
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoading) {
        loadMore();
      }
    },
    [hasMore, isLoading, loadMore]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleIntersect, {
      root: null,
      rootMargin: '200px', // Trigger 200px before reaching the bottom
      threshold: 0,
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [handleIntersect]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">
              S3 Video Browser
              {videos.length > 0 && (
                <span className="ml-2 text-lg font-normal text-gray-400">
                  ({videos.length} of {totalCount} shown)
                </span>
              )}
            </h2>
            <p className="text-gray-400 mt-1">Browse videos stored in S3</p>
          </div>
          <div className="flex gap-2">
            {hasMore && (
              <button
                onClick={loadAll}
                disabled={isLoading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors"
              >
                {isLoading ? 'Loading...' : 'Load All'}
              </button>
            )}
            <button
              onClick={refresh}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Filter Controls - always shown */}
        <S3VideoFilterControls
          filters={filters}
          onSearchChange={setSearchQuery}
          onSortFieldChange={setSortField}
          onToggleSortOrder={toggleSortOrder}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          totalCount={totalCount}
          filteredCount={videos.length}
          isLoading={isLoading}
        />

        {/* Display Mode Control */}
        <div className="mb-6 flex items-center gap-2 text-sm">
          <span className="text-gray-400">Display:</span>
          <button
            onClick={() => setDisplayMode('adaptive')}
            className={`px-3 py-1 rounded ${displayMode === 'adaptive' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Adaptive
          </button>
          <button
            onClick={() => setDisplayMode('landscape')}
            className={`px-3 py-1 rounded ${displayMode === 'landscape' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Horizontal
          </button>
          <button
            onClick={() => setDisplayMode('portrait')}
            className={`px-3 py-1 rounded ${displayMode === 'portrait' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Vertical
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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
                <p className="text-sm text-red-200 font-medium mb-1">
                  Failed to load videos
                </p>
                <p className="text-xs text-red-300 break-words">
                  {error}
                </p>
                <button
                  onClick={refresh}
                  disabled={isLoading}
                  className="mt-3 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading && videos.length === 0 && (
          <div className="columns-1 md:columns-2 lg:columns-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <AdaptiveVideoCardSkeleton
                key={i}
                isPortrait={displayMode === 'portrait' || (displayMode === 'adaptive' && i % 2 === 1)}
              />
            ))}
          </div>
        )}

        {!isLoading && videos.length === 0 && !error && totalCount === 0 && (
          <EmptyState
            icon={
              <svg
                className="w-16 h-16 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            }
            title="No videos found"
            description="No videos have been generated yet. Go to Video Lab to create some!"
          />
        )}

        {!isLoading && videos.length === 0 && !error && totalCount > 0 && (
          <EmptyState
            icon={
              <svg
                className="w-16 h-16 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            }
            title="No matching videos"
            description="No videos match your search. Try a different search term."
          />
        )}

        {videos.length > 0 && (
          <>
            <div className="columns-1 md:columns-2 lg:columns-3 gap-6">
              {videos.map((video) => (
                <AdaptiveS3VideoCard
                  key={video.key}
                  videoKey={video.key}
                  url={video.url}
                  size={video.size}
                  lastModified={video.lastModified}
                  forceAspect={displayMode}
                />
              ))}
            </div>

            {/* Sentinel element for infinite scroll */}
            <div ref={sentinelRef} className="h-4" />

            {/* Loading indicator for infinite scroll */}
            {isLoading && videos.length > 0 && (
              <div className="mt-4 flex justify-center">
                <div className="flex items-center gap-2 text-gray-400">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-sm">Loading more videos...</span>
                </div>
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && videos.length > 0 && (
              <div className="mt-8 text-center text-gray-500 text-sm">
                All {totalCount} videos loaded
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
