
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase-client';
import { UploadCloud, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
  onUpload?: (url: string) => void;
  onRemove?: () => void;
  className?: string;
}

export function ImageUploader({ 
  folder,
  currentImageUrl, 
  onUpload,
  onRemove,
  className,
}: ImageUploaderProps) {
  
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleUpload = useCallback(async (file: File) => {
    if (!storage) {
        toast({ variant: 'destructive', title: 'Error', description: 'El servicio de almacenamiento no está disponible.' });
        return;
    }
    
    setIsUploading(true);

    try {
        if (currentImageUrl) {
            try {
                const oldImageRef = ref(storage, currentImageUrl);
                await deleteObject(oldImageRef);
            } catch (error: any) {
                if (error.code !== 'storage/object-not-found') {
                    console.warn("No se pudo borrar la imagen anterior, puede que ya no exista:", error);
                }
            }
        }

        const storageRef = ref(storage, `${folder}/${Date.now()}-${file.name}`);
        const uploadTask = await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(uploadTask.ref);

        if (onUpload) {
            onUpload(downloadURL);
        }
        
        toast({ title: '¡Éxito!', description: 'La imagen ha sido subida correctamente.' });

    } catch (error: any) {
        console.error("Error al subir imagen:", error);
        toast({ variant: 'destructive', title: 'Error de subida', description: `Hubo un problema al subir la imagen: ${error.code} - ${error.message}` });
    } finally {
        setIsUploading(false);
    }
  }, [folder, currentImageUrl, onUpload, toast]);

  const handleRemove = async () => {
    if (!currentImageUrl || !storage) return;

    try {
      const imageRef = ref(storage, currentImageUrl);
      await deleteObject(imageRef);
      if (onRemove) onRemove();
      toast({ title: 'Imagen eliminada', description: 'La imagen ha sido eliminada del almacenamiento.' });
    } catch (error: any) {
      console.error("Error al eliminar la imagen:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la imagen. Puede que ya no exista.' });
       // If deletion fails (e.g. file not found), still clear it from the UI.
      if (onRemove) onRemove();
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => handleUpload(acceptedFiles[0]),
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: false
  });

  if (isUploading) {
    return (
        <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-40 w-full ${className}`}>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Subiendo...</p>
        </div>
    );
  }
  
  if (currentImageUrl) {
    return (
        <div className={`relative w-40 h-40 rounded-lg overflow-hidden group ${className}`}>
            <Image src={currentImageUrl} alt="Imagen subida" layout="fill" objectFit="cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button variant="destructive" size="icon" onClick={handleRemove}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-40 w-full cursor-pointer hover:border-primary transition-colors ${className}`, {
        'border-primary bg-primary/5': isDragActive,
      })}
    >
      <input {...getInputProps()} />
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">Arrastra una imagen o haz clic para seleccionarla</p>
    </div>
  );
}
