import { useEffect, useRef, useState } from 'react';

interface AdaptiveVideoPlayerProps {
  videoUrl: string;
  onVisible?: () => void;
  forceAspect?: 'adaptive' | 'landscape' | 'portrait';
}

type AspectRatio = 'landscape' | 'portrait' | 'square' | 'unknown';

export function AdaptiveVideoPlayer({ videoUrl, onVisible, forceAspect = 'adaptive' }: AdaptiveVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('unknown');

  // Intersection observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          onVisible?.();
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px',
        threshold: 0.1,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [onVisible]);

  // Detect aspect ratio from video metadata
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      const { videoWidth, videoHeight } = video;
      const ratio = videoWidth / videoHeight;

      if (ratio > 1.2) {
        setAspectRatio('landscape');
      } else if (ratio < 0.8) {
        setAspectRatio('portrait');
      } else {
        setAspectRatio('square');
      }
    }
  };

  // Dynamic aspect ratio class
  const getAspectClass = () => {
    // If forced mode, use that regardless of detected aspect
    if (forceAspect === 'landscape') return 'aspect-video';
    if (forceAspect === 'portrait') return 'aspect-[9/16]';

    // Otherwise use detected aspect ratio
    switch (aspectRatio) {
      case 'portrait':
        return 'aspect-[9/16]'; // 9:16 for vertical
      case 'square':
        return 'aspect-square';
      case 'landscape':
      default:
        return 'aspect-video'; // 16:9 for horizontal
    }
  };

  return (
    <div
      ref={containerRef}
      className={`${getAspectClass()} bg-black rounded-lg overflow-hidden transition-all duration-300`}
    >
      {isVisible ? (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full h-full object-contain"
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
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
