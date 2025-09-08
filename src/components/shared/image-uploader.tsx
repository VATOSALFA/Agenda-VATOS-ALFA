
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
import { storage } from '@/lib/firebase';
import { Progress } from '../ui/progress';

interface ImageUploaderProps {
  folder: string;
  imageUrl?: string | null;
  onUploadEnd: (url: string | null) => void;
  className?: string;
}

export function ImageUploader({ folder, imageUrl, onUploadEnd, className }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
            let description = "Hubo un problema al subir la imagen.";
            switch (error.code) {
                case 'storage/unauthorized':
                    description = "No tienes permiso para subir archivos.";
                    break;
                case 'storage/canceled':
                    description = "La subida fue cancelada.";
                    break;
                case 'storage/unknown':
                    description = "Ocurrió un error desconocido.";
                    break;
            }
            toast({
                variant: "destructive",
                title: "Error al subir",
                description: description,
            });
            setIsUploading(false);
            onUploadEnd(null);
        }, 
        () => {
            getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                onUploadEnd(downloadURL);
                toast({
                    title: "¡Éxito!",
                    description: "La imagen se ha subido correctamente.",
                });
                setIsUploading(false);
            });
        }
    );

  }, [folder, onUploadEnd, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: false,
  });
  
  const handleRemoveImage = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!imageUrl) return;
      
      const isFirebaseUrl = imageUrl.includes('firebasestorage.googleapis.com');

      if (isFirebaseUrl) {
          try {
            const imageRef = ref(storage, imageUrl);
            await deleteObject(imageRef);
            toast({
              title: "Imagen eliminada",
            });
          } catch (error: any) {
            console.error("Error removing image from Firebase Storage: ", error);
             if (error.code !== 'storage/object-not-found') {
                toast({
                  variant: "destructive",
                  title: "Error al eliminar",
                  description: "No se pudo eliminar la imagen del almacenamiento.",
                });
             }
          }
      }
      
      onUploadEnd(null);
  }

  if (isUploading) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-full text-center h-32 w-32 ${className}`}>
        <p className="text-sm mb-2">{Math.round(uploadProgress)}%</p>
        <Progress value={uploadProgress} className="w-full" />
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className={`relative w-32 h-32 rounded-full overflow-hidden group ${className}`}>
        <Image src={imageUrl} alt="Preview" layout="fill" objectFit="cover" />
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
