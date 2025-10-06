
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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

  const handleUpload = useCallback(async (file: File) => {
    if (!storage) {
        toast({ variant: 'destructive', title: 'Error', description: 'El servicio de almacenamiento no está disponible.' });
        return;
    }
    
    setIsUploading(true);
    if(onUploadStateChange) onUploadStateChange(true);

    try {
        if (currentImageUrl) {
            try {
                const oldImageRef = ref(storage, currentImageUrl);
                await deleteObject(oldImageRef).catch(error => {
                   if (error.code !== 'storage/object-not-found') {
                     throw error;
                   }
                   console.log("La imagen anterior no se encontró, continuando con la subida.");
                });
            } catch (error: any) {
                console.warn("No se pudo borrar la imagen anterior, puede que ya no exista:", error);
            }
        }

        const storageRef = ref(storage, `${folder}/${Date.now()}-${file.name}`);
        const uploadTask = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(uploadTask.ref);

        if (onUpload) {
            onUpload(downloadURL);
        }
        if (onUploadEnd) {
            onUploadEnd(downloadURL);
        }

        toast({ title: '¡Éxito!', description: 'La imagen ha sido subida correctamente.' });
        
    } catch (error: any) {
        console.error("Error al subir imagen:", error);
        toast({ variant: 'destructive', title: 'Error de subida', description: `Hubo un problema al subir la imagen: ${error.code}` });
    } finally {
        setIsUploading(false);
        if(onUploadStateChange) onUploadStateChange(false);
    }
  }, [folder, currentImageUrl, onUpload, onUploadEnd, onUploadStateChange, toast]);

  const handleRemove = async () => {
    if (!currentImageUrl || !storage) return;
    
    setIsUploading(true); // Reuse uploading state to show loading
    if(onUploadStateChange) onUploadStateChange(true);

    try {
      const imageRef = ref(storage, currentImageUrl);
      await deleteObject(imageRef);
      if (onRemove) onRemove();
      toast({ title: 'Imagen eliminada con éxito' });
    } catch (error: any) {
      console.error("Error al eliminar la imagen:", error);
      // Even if deletion fails (e.g., file not found), still clear it from the UI.
      if (onRemove) onRemove();
      if (error.code === 'storage/object-not-found') {
        toast({ variant: 'default', title: 'Limpiado', description: 'La imagen ya no existía en el almacenamiento y se ha limpiado la referencia.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la imagen.' });
      }
    } finally {
        setIsUploading(false);
        if(onUploadStateChange) onUploadStateChange(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => handleUpload(acceptedFiles[0]),
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: false
  });

  if (isUploading) {
    return (
        <div className={cn('flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-40 w-40', className)}>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Procesando...</p>
        </div>
    );
  }
  
  if (currentImageUrl) {
    return (
        <div className={cn('relative w-40 h-40 rounded-lg overflow-hidden group', className)}>
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
      className={cn('flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-40 w-40 cursor-pointer hover:border-primary transition-colors', className, {
        'border-primary bg-primary/5': isDragActive,
      })}
    >
      <input {...getInputProps()} />
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground text-center">Arrastra o haz clic para subir</p>
    </div>
  );
}
