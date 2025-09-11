
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { storage } from '@/lib/firebase';
import { Progress } from '../ui/progress';

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
  onUpload: (url: string) => void;
  onRemove: () => void;
  className?: string;
}

export function ImageUploader({ folder, currentImageUrl, onUpload, onRemove, className }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const handleRemoveImage = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentImageUrl) return;

    const isFirebaseUrl = currentImageUrl.includes('firebasestorage.googleapis.com');
    if (isFirebaseUrl) {
      try {
        const imageRef = ref(storage, currentImageUrl);
        await deleteObject(imageRef);
        toast({ title: "Imagen eliminada" });
      } catch (error: any) {
        console.error("Error eliminando imagen de Firebase Storage: ", error);
        if (error.code !== 'storage/object-not-found') {
          toast({
            variant: "destructive",
            title: "Error al eliminar",
            description: "No se pudo eliminar la imagen del almacenamiento.",
          });
          // Do not proceed with state update if deletion fails for a real object
          return;
        }
      }
    }
    onRemove();
  }, [currentImageUrl, onRemove, toast]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
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

    // If there is an image, remove it first.
    if (currentImageUrl) {
        await handleRemoveImage();
    }
    
    setIsUploading(true);
    setUploadProgress(0); // Reset progress

    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);

    try {
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        onUpload(downloadURL);
        toast({
            title: "¡Éxito!",
            description: "La imagen se ha subido correctamente.",
        });
    } catch (error) {
        console.error("Upload error:", error);
        toast({
            variant: "destructive",
            title: "Error al subir",
            description: "Hubo un problema al subir la imagen. Revisa los permisos de almacenamiento.",
        });
    } finally {
        setIsUploading(false);
    }

  }, [folder, currentImageUrl, handleRemoveImage, onUpload, toast]);

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
