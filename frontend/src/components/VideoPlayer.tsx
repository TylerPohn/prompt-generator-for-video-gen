interface VideoPlayerProps {
  videoUrl: string;
  alt?: string;
}

export function VideoPlayer({ videoUrl }: VideoPlayerProps) {
  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden">
      <video
        src={videoUrl}
        controls
        className="w-full h-full"
        preload="metadata"
      >
        <track kind="captions" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
