
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
<<<<<<< HEAD
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
=======
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
import { Loader2, UploadCloud, X } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '../ui/button';
<<<<<<< HEAD
import { storage } from '@/lib/firebase';
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
import { Progress } from '../ui/progress';

interface ImageUploaderProps {
  folder: string;
  currentImageUrl?: string | null;
<<<<<<< HEAD
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

  const handleRemoveImage = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentImageUrl) return;

    // Immediately update UI
    onRemove(); 
    
    // Check if it's a Firebase URL before trying to delete
    const isFirebaseUrl = currentImageUrl.includes('firebasestorage.googleapis.com');
    
    if (isFirebaseUrl) {
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
  }, [currentImageUrl, onRemove, onUploadEnd, toast]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
=======
  onUpload: (url: string) => void;
  onRemove?: () => void;
  className?: string;
}

export function ImageUploader({ folder, currentImageUrl, onUpload, onRemove, className }: ImageUploaderProps) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const storage = getStorage();

  const onDrop = useCallback((acceptedFiles: File[]) => {
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
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
    
<<<<<<< HEAD
    onUploadStateChange(true);
=======
    setIsUploading(true);
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
    setUploadProgress(0);

    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

<<<<<<< HEAD
    uploadTask.on('state_changed',
=======
    uploadTask.on(
      'state_changed',
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Upload error:", error);
        toast({
            variant: "destructive",
            title: "Error al subir",
<<<<<<< HEAD
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

  }, [folder, onUploadEnd, onUploadStateChange, toast]);
=======
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
  }, [folder, onUpload, storage, toast]);
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.gif', '.webp'] },
    multiple: false,
  });
  
<<<<<<< HEAD
  if (uploadProgress > 0 && uploadProgress < 100) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-full text-center h-32 w-32 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm mt-2">Subiendo...</p>
        <Progress value={uploadProgress} className="w-[80%] h-1 mt-2" />
      </div>
    );
=======
  const handleRemoveImage = (e: React.MouseEvent) => {
      e.stopPropagation();
      if(onRemove) {
        onRemove();
      } else {
        onUpload('');
      }
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
  }

  if (currentImageUrl) {
    return (
<<<<<<< HEAD
      <div className={`relative w-32 h-32 rounded-full overflow-hidden group ${className}`}>
        <Image src={currentImageUrl} alt="Preview" layout="fill" objectFit="cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleRemoveImage}>
              <X className="h-4 w-4" />
            </Button>
=======
      <div className={`relative w-48 h-48 rounded-lg overflow-hidden group ${className}`}>
        <Image src={currentImageUrl} alt="Preview" layout="fill" objectFit="cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button variant="destructive" size="icon" onClick={handleRemoveImage}>
            <X className="h-4 w-4" />
          </Button>
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
        </div>
      </div>
    );
  }

<<<<<<< HEAD
  return (
    <div
      {...getRootProps()}
      className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-full text-center h-32 w-32 cursor-pointer hover:border-primary transition-colors ${isDragActive ? 'border-primary bg-primary/10' : ''} ${className}`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-xs text-muted-foreground">Subir foto</p>
=======
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
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
    </div>
  );
}
