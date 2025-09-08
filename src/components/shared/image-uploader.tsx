
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { app } from '@/lib/firebase';

const storage = getStorage(app);

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  className?: string;
}

export function ImageUploader({ folder, currentImageUrl, onUpload, onRemove, className }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

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
    
    setIsUploading(true);

    try {
        const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
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
            description: "Hubo un problema al subir la imagen. Revisa la consola para más detalles.",
        });
    } finally {
        setIsUploading(false);
    }

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
