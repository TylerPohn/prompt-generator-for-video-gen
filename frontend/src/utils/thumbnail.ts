/**
 * Generates a thumbnail from a video URL
 * @param videoUrl - URL of the video
 * @param seekTime - Time in seconds to capture frame (default 0.1)
 * @returns Promise resolving to data URL of thumbnail image
 */
export async function generateThumbnail(
  videoUrl: string,
  seekTime = 0.1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    // When metadata loads, we know the video dimensions
    video.addEventListener('loadedmetadata', () => {
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Seek to specific time
      video.currentTime = Math.min(seekTime, video.duration);
    });

    // When seeked to the right time, capture the frame
    video.addEventListener('seeked', () => {
      try {
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        // Clean up - fully remove elements from memory
        video.src = '';
        video.remove();
        canvas.remove();
        resolve(dataUrl);
      } catch (error) {
        // Clean up on error too
        video.src = '';
        video.remove();
        canvas.remove();
        reject(error);
      }
    });

    video.addEventListener('error', () => {
      // Clean up on error
      video.src = '';
      video.remove();
      canvas.remove();
      reject(new Error('Failed to load video for thumbnail'));
    });

    // Start loading the video
    video.load();
  });
}

/**
 * Hook to generate thumbnail when video URL is available
 */
export async function generateAndStoreThumbnail(
  videoUrl: string,
  onThumbnail: (thumbnailUrl: string) => void
): Promise<void> {
  try {
    const thumbnail = await generateThumbnail(videoUrl);
    onThumbnail(thumbnail);
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    // Don't throw - thumbnails are optional
  }
}
