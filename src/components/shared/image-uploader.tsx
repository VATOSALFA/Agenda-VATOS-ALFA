
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytes, getDownloadURL, deleteObject, getMetadata } from 'firebase/storage';
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { storage } from '@/lib/firebase-client';

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

  const handleRemoveImage = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentImageUrl) return;

    if (!storage) {
        toast({
            variant: "destructive",
            title: "Error de Configuración",
            description: "El servicio de almacenamiento no está disponible.",
        });
        return;
    }

    try {
        const imageRef = ref(storage, currentImageUrl);
        // Check if the file exists before trying to delete it
        await getMetadata(imageRef);
        await deleteObject(imageRef);
        toast({ title: "Imagen eliminada" });
    } catch (error: any) {
        if (error.code === 'storage/object-not-found') {
            console.warn("La imagen no existía en Storage, pero se limpiará la referencia.");
        } else {
            console.error("Error al eliminar la imagen:", error);
            toast({
                variant: "destructive",
                title: "Error al eliminar",
                description: `No se pudo eliminar la imagen. Causa: ${error.message}`,
            });
            // Do not proceed if deletion fails for reasons other than not found
            return;
        }
    } finally {
        // Always call onRemove to clear the URL from the state/form
        if (onRemove) onRemove();
    }
  }, [currentImageUrl, onRemove, toast]);


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
    
    try {
        // If there's an old image URL, attempt to delete it first.
        if (currentImageUrl) {
            await handleRemoveImage();
        }

        const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        if(onUpload) onUpload(downloadURL);
        
        toast({ title: "¡Imagen subida con éxito!" });

    } catch(error: any) {
        console.error("Error en la subida:", error);
        toast({
            variant: "destructive",
            title: "Error al subir la imagen",
            description: `No se pudo subir la imagen. Causa: ${error.message || error.code}`,
        });
    } finally {
        setIsUploading(false);
    }

  }, [folder, onUpload, toast, currentImageUrl, handleRemoveImage]);

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
