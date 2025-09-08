
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { storage } from '@/lib/firebase';

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  className?: string;
}

export function ImageUploader({ folder, currentImageUrl, onUpload, onRemove, className }: ImageUploaderProps) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) { // 3MB limit
        toast({
            variant: "destructive",
            title: "Archivo demasiado grande",
            description: "El tamaño máximo de la imagen es de 3MB.",
        });
        return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);

    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Upload error:", error);
        toast({
            variant: "destructive",
            title: "Error al subir",
            description: "Hubo un problema al subir la imagen. Inténtalo de nuevo.",
        });
        setIsUploading(false);
        setUploadProgress(null);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          onUpload(downloadURL);
          setIsUploading(false);
          setUploadProgress(null);
          toast({
            title: "¡Éxito!",
            description: "La imagen se ha subido correctamente.",
          });
        });
      }
    );
  }, [folder, onUpload, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: false,
  });
  
  const handleRemoveImage = (e: React.MouseEvent) => {
      e.stopPropagation();
      if(onRemove) {
        onRemove();
      } else {
        onUpload('');
      }
  }

  if (currentImageUrl) {
    return (
      <div className={`relative w-48 h-48 rounded-lg overflow-hidden group ${className}`}>
        <Image src={currentImageUrl} alt="Preview" layout="fill" objectFit="cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button variant="destructive" size="icon" onClick={handleRemoveImage}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (isUploading) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-48 w-48 ${className}`}>
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground mb-3">Subiendo...</p>
        <Progress value={uploadProgress} className="w-full" />
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-48 w-48 cursor-pointer hover:border-primary transition-colors ${isDragActive ? 'border-primary bg-primary/10' : ''} ${className}`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="h-10 w-10 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">Arrastra o selecciona la imagen</p>
    </div>
  );
}
