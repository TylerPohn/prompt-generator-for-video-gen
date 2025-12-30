import { getAwsVideoClient } from '../services/awsVideoClient';

export interface UploadResult {
  s3Url: string;
}

/**
 * Upload an image file to S3 via presigned URL.
 *
 * @param file - The image file to upload
 * @returns The S3 URL of the uploaded image
 */
export async function uploadImageToS3(file: File): Promise<UploadResult> {
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload a JPEG, PNG, or WebP image.');
  }

  // Validate file size (5MB max)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 5MB.');
  }

  // Get presigned upload URL
  const awsClient = getAwsVideoClient();
  const { uploadUrl, s3Url } = await awsClient.getUploadUrl(file.type);

  // Upload file directly to S3
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload image: ${uploadResponse.status}`);
  }

  return { s3Url };
}
