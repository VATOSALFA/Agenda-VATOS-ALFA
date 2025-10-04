
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { storage } from '@/lib/firebase-client';
import { Progress } from '../ui/progress';

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
  onUpload?: (url: string) => void;
  onRemove?: () => void;
  className?: string;
  onUploadStateChange?: (isUploading: boolean) => void;
  onUploadEnd?: (url: string) => void;
}

export function ImageUploader({ 
  folder, 
  currentImageUrl, 
  onUpload,
  onRemove,
  className,
  onUploadStateChange,
  onUploadEnd
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const handleRemoveImage = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentImageUrl || !storage) return;

    const isFirebaseUrl = currentImageUrl.includes('firebasestorage.googleapis.com');
    if (!isFirebaseUrl) {
      if (onRemove) onRemove();
      return;
    }

    try {
        const imageRef = ref(storage, currentImageUrl);
        await deleteObject(imageRef);
        if (onRemove) onRemove();
        toast({ title: "Imagen eliminada" });
    } catch (error: any) {
        if (error.code !== 'storage/object-not-found') {
             toast({
                variant: "destructive",
                title: "Error al eliminar",
                description: "No se pudo eliminar la imagen del almacenamiento.",
            });
        } else {
             if (onRemove) onRemove(); // Remove from UI even if it's already gone from storage
        }
    }
  }, [currentImageUrl, onRemove, storage, toast]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!storage) {
      toast({ variant: 'destructive', title: 'Error', description: 'El servicio de almacenamiento no está disponible.' });
      return;
    }

    if (file.size > 3 * 1024 * 1024) { // 3MB limit
        toast({
            variant: "destructive",
            title: "Archivo demasiado grande",
            description: "El tamaño máximo de la imagen es de 3MB.",
        });
        return;
    }
    
    setIsUploading(true);
    onUploadStateChange?.(true);
    setUploadProgress(0);

    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Upload error:", error);
        toast({
            variant: "destructive",
            title: "Error al subir",
            description: `Hubo un problema al subir la imagen. Código: ${error.code}`,
        });
        setIsUploading(false);
        onUploadStateChange?.(false);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          if(onUpload) onUpload(downloadURL);
          if(onUploadEnd) onUploadEnd(downloadURL);
          setIsUploading(false);
          onUploadStateChange?.(false);
          setUploadProgress(0);
        });
      }
    );

  }, [folder, onUpload, toast, storage, onUploadStateChange, onUploadEnd]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: false,
  });
  
  if (isUploading) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-full text-center h-32 w-32 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm mt-2">Subiendo...</p>
        <Progress value={uploadProgress} className="w-[80%] h-1 mt-2" />
      </div>
    );
  }

  if (currentImageUrl) {
    return (
      <div className={`relative w-32 h-32 rounded-full overflow-hidden group ${className}`}>
        <Image src={currentImageUrl} alt="Preview" layout="fill" objectFit="cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleRemoveImage}>
              <X className="h-4 w-4" />
            </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-full text-center h-32 w-32 cursor-pointer hover:border-primary transition-colors ${isDragActive ? 'border-primary bg-primary/10' : ''} ${className}`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-xs text-muted-foreground">Subir foto</p>
    </div>
  );
}
