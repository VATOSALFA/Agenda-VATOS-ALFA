

'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase-client';
import { UploadCloud, Trash2, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
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
  multiple?: boolean;
}

/**
 * Comprime y optimiza la imagen automáticamente antes de enviarla a Firebase Storage.
 * - Redimensiona fotos gigantes de cámaras (hasta 1280px máx) preservando la relación de aspecto.
 * - Comprime a JPEG de alta fidelidad (calidad 84%), reduciendo el peso en ~90-95% (de 10MB a ~180KB).
 * - Es 100% seguro: si el archivo ya es ligero o si el navegador no puede procesarla, sube el original.
 */
async function optimizeImageForUpload(file: File, maxDimension = 1280, quality = 0.84): Promise<File | Blob> {
  if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml' || typeof window === 'undefined') {
    return file;
  }

  // Si ya es un archivo muy ligero (menos de 250 KB), no es necesario recomprimir
  if (file.size <= 250 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const img = new (window as any).Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              const safeName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
              const optimizedFile = new File([blob], safeName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(optimizedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    } catch {
      resolve(file);
    }
  });
}

export function ImageUploader({ 
  folder,
  currentImageUrl, 
  onUpload,
  onRemove,
  className,
  onUploadStateChange,
  onUploadEnd,
  multiple = false,
}: ImageUploaderProps) {
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const { toast } = useToast();

  const handleUploadFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    if (!storage) {
        toast({ variant: 'destructive', title: 'Error', description: 'El servicio de almacenamiento no está disponible.' });
        return;
    }
    
    setIsUploading(true);
    setUploadCount(files.length);
    if(onUploadStateChange) onUploadStateChange(true);

    try {
        if (!multiple && currentImageUrl) {
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

        const filesToUpload = multiple ? files : [files[0]];
        for (const rawFile of filesToUpload) {
            const file = await optimizeImageForUpload(rawFile);
            const fileName = (file as File).name || 'foto.jpg';
            const storageRef = ref(storage, `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${fileName}`);
            const uploadTask = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadTask.ref);

            if (onUpload) {
                onUpload(downloadURL);
            }
            if (onUploadEnd) {
                onUploadEnd(downloadURL);
            }
        }

        toast({ 
            title: '¡Éxito!', 
            description: filesToUpload.length > 1 
                ? `${filesToUpload.length} fotografías subidas correctamente.` 
                : 'La fotografía ha sido subida correctamente.' 
        });
        
    } catch (error: any) {
        console.error("Error al subir imagen:", error);
        toast({ variant: 'destructive', title: 'Error de subida', description: `Hubo un problema al subir la imagen: ${error.code || error.message}` });
    } finally {
        setIsUploading(false);
        setUploadCount(0);
        if(onUploadStateChange) onUploadStateChange(false);
    }
  }, [folder, currentImageUrl, onUpload, onUploadEnd, onUploadStateChange, multiple, toast]);

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
    onDrop: (acceptedFiles) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        handleUploadFiles(acceptedFiles);
      }
    },
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: Boolean(multiple)
  });

  if (isUploading) {
    return (
        <div className={cn('flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-40 w-40 bg-muted/10', className)}>
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="mt-3 text-xs font-medium text-muted-foreground">
                {uploadCount > 1 ? `Subiendo ${uploadCount} fotografías...` : 'Subiendo imagen...'}
            </p>
        </div>
    );
  }
  
  if (currentImageUrl) {
    return (
        <div 
          className={cn('relative w-40 h-40 rounded-lg overflow-hidden group cursor-pointer border border-border/80 bg-muted/20', className)}
          {...getRootProps()}
        >
            <input {...getInputProps()} />
            <img src={currentImageUrl} alt="Imagen subida" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                <div className="bg-white/10 p-2 rounded-full backdrop-blur-sm border border-white/20">
                    <UploadCloud className="w-5 h-5 text-white" />
                </div>
                <p className="text-[11px] text-white font-medium text-center">Arrastra otra foto o haz clic para cambiar</p>
                
                <Button 
                    variant="destructive" 
                    size="icon" 
                    type="button"
                    className="absolute top-2 right-2 h-7 w-7 shadow-sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleRemove();
                    }}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn('flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center h-40 w-40 cursor-pointer hover:border-primary transition-colors bg-muted/5', className, {
        'border-primary bg-primary/10 scale-[0.99]': isDragActive,
      })}
    >
      <input {...getInputProps()} />
      <UploadCloud className={cn("h-7 w-7 mb-2 text-muted-foreground transition-transform", isDragActive && "scale-110 text-primary")} />
      <p className="text-xs sm:text-sm font-medium text-foreground">
        {isDragActive 
          ? "Suelta tu fotografía aquí" 
          : "Arrastra tu fotografía aquí o haz clic para importar"}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {multiple ? "Formatos compatibles: JPG, PNG, WEBP (puedes subir una o varias a la vez)" : "Formatos compatibles: JPG, PNG, WEBP"}
      </p>
    </div>
  );
}
