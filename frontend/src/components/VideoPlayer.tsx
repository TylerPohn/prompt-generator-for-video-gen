import { useEffect, useRef, useState } from 'react';

interface VideoPlayerProps {
  videoUrl: string;
  alt?: string;
  onVisible?: () => void;
}

export function VideoPlayer({ videoUrl, onVisible }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          onVisible?.(); // Trigger callback when visible
          // Once visible, we can disconnect as we don't need to unload
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px', // Start loading slightly before visible
        threshold: 0.1,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [onVisible]);

  return (
    <div ref={containerRef} className="aspect-video bg-black rounded-lg overflow-hidden">
      {isVisible ? (
        <video
          src={videoUrl}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full"
          preload="metadata"
        >
          <track kind="captions" />
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
          Scroll to load video
        </div>
      )}
    </div>
  );
}
