
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Progress } from '../ui/progress';

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
  onUploadStateChange: (isUploading: boolean) => void;
  onUploadEnd: (url: string) => void;
  onRemove: () => void;
  className?: string;
}

export function ImageUploader({ 
  folder, 
  currentImageUrl, 
  onUploadStateChange, 
  onUploadEnd,
  onRemove,
  className 
}: ImageUploaderProps) {
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const { storage } = useAuth();

  const handleRemoveImage = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentImageUrl) return;

    // Immediately update UI
    onRemove(); 
    
    // Check if it's a Firebase URL before trying to delete
    const isFirebaseUrl = currentImageUrl.includes('firebasestorage.googleapis.com');
    
    if (isFirebaseUrl && storage) {
        try {
            const imageRef = ref(storage, currentImageUrl);
            await deleteObject(imageRef);
            toast({ title: "Imagen eliminada" });
        } catch (error: any) {
            // If the object doesn't exist, it's not a critical error.
            if (error.code !== 'storage/object-not-found') {
                 toast({
                    variant: "destructive",
                    title: "Error al eliminar",
                    description: "No se pudo eliminar la imagen del almacenamiento.",
                });
                // Revert UI change if deletion fails for a real object
                onUploadEnd(currentImageUrl);
            }
        }
    }
  }, [currentImageUrl, onRemove, onUploadEnd, toast, storage]);

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
    
    onUploadStateChange(true);
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
        onUploadStateChange(false);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          onUploadEnd(downloadURL);
          onUploadStateChange(false);
        });
      }
    );

  }, [folder, onUploadEnd, onUploadStateChange, toast, storage]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: false,
  });
  
  if (uploadProgress > 0 && uploadProgress < 100) {
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
