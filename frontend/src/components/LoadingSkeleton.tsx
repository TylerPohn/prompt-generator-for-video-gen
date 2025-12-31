export function VideoCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 pb-3">
        <div className="aspect-video bg-gray-200 rounded-lg skeleton"></div>
      </div>
      <div className="px-4 pb-4 space-y-3">
        <div className="flex gap-2">
          <div className="h-6 w-20 bg-gray-200 rounded-full skeleton"></div>
          <div className="h-6 w-32 bg-gray-200 rounded-full skeleton"></div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded skeleton"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4 skeleton"></div>
        </div>
      </div>
    </div>
  );
}

export function AdaptiveVideoCardSkeleton({ isPortrait = false }: { isPortrait?: boolean }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg break-inside-avoid mb-6 animate-pulse">
      <div className={`${isPortrait ? 'aspect-[9/16]' : 'aspect-video'} bg-gray-700`} />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-gray-700 rounded w-3/4" />
        <div className="h-3 bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  );
}
