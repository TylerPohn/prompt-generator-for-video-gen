import React, { useCallback, useState } from 'react';

interface ImageUploaderProps {
  onImageSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export function ImageUploader({ onImageSelect, selectedFile, disabled }: ImageUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = useCallback((file: File | null) => {
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('Please upload a JPEG, PNG, or WebP image.');
        return;
      }

      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB.');
        return;
      }

      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onImageSelect(file);
    } else {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      onImageSelect(null);
    }
  }, [onImageSelect, previewUrl]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    handleFile(null);
  }, [handleFile]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Input Image (optional)
      </label>

      {selectedFile && previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Selected input"
            className="w-full h-32 object-cover rounded-lg border border-gray-300"
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="text-xs text-gray-500 mt-1">{selectedFile.name}</p>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center cursor-pointer
            transition-colors duration-200
            ${dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleChange}
            disabled={disabled}
            className="hidden"
            id="image-upload"
          />
          <label
            htmlFor="image-upload"
            className={`cursor-pointer ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="mt-1 text-sm text-gray-500">
              Drop an image or click to upload
            </p>
            <p className="text-xs text-gray-400">
              JPEG, PNG, WebP up to 5MB
            </p>
          </label>
        </div>
      )}
    </div>
  );
}
