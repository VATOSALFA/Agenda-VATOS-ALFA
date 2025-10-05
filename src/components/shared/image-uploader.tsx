
'use client';

import { UploadCloud } from 'lucide-react';
import { Button } from '../ui/button';

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
  onUpload?: (url: string) => void;
  onRemove?: () => void;
  onUploadStateChange?: (isUploading: boolean) => void;
  className?: string;
}

/**
 * A placeholder component for image uploads.
 * All upload logic has been temporarily removed.
 */
export function ImageUploader({ 
  currentImageUrl, 
  className,
}: ImageUploaderProps) {
  
  if (currentImageUrl) {
    return (
        <div className={`relative w-32 h-32 rounded-full overflow-hidden group ${className}`}>
            {/* Displaying a placeholder as the image might be cached or from a stale URL */}
            <div className="w-full h-full bg-muted flex items-center justify-center">
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
            </div>
        </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-full text-center h-32 w-32 cursor-not-allowed ${className}`}
    >
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-xs text-muted-foreground">Subida deshabilitada</p>
    </div>
  );
}
