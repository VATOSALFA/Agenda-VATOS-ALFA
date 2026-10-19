'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Camera,
  RefreshCw,
  Check,
  X,
  Image as ImageIcon,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen?: boolean;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptureFile: (file: File) => void;
  onOpenDeviceGallery?: () => void;
}

export function CameraCaptureModal({
  isOpen,
  open,
  onOpenChange,
  onCaptureFile,
}: CameraCaptureModalProps) {
  const modalOpen = open !== undefined ? open : !!isOpen;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeFileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(
    async (mode: 'user' | 'environment') => {
      stopCameraStream();
      setCameraError(null);
      setIsStarting(true);

      if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
        setCameraError(
          'Tu navegador no permite abrir la cámara en vivo directamente. Puedes tomar o elegir una foto con el botón de abajo.'
        );
        setIsStarting(false);
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (_) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('Error accessing device camera:', err);
        setCameraError(
          'No se pudo acceder a la cámara del dispositivo. Verifica los permisos del navegador o selecciona una foto desde tu dispositivo abajo.'
        );
      } finally {
        setIsStarting(false);
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (modalOpen && !capturedDataUrl) {
      startCameraStream(facingMode);
    } else if (!modalOpen) {
      stopCameraStream();
      setCapturedDataUrl(null);
      setCapturedBlob(null);
      setCameraError(null);
    }
    return () => {
      stopCameraStream();
    };
  }, [modalOpen, facingMode, capturedDataUrl, startCameraStream, stopCameraStream]);

  const handleToggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleTakeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedDataUrl(dataUrl);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
        }
      },
      'image/jpeg',
      0.9
    );

    stopCameraStream();
  };

  const handleConfirmPhoto = () => {
    if (capturedBlob) {
      const file = new File([capturedBlob], `foto_camara_${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      onCaptureFile(file);
      onOpenChange(false);
    }
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    setCapturedBlob(null);
  };

  return (
    <Dialog open={modalOpen} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="sm:max-w-lg p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background flex flex-col"
      >
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <Camera className="w-5 h-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">
                  Cámara del Dispositivo
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Toma una foto en vivo o selecciona una de tu galería
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Cerrar cámara"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Visor de Cámara / Vista Previa */}
        <div className="p-4 space-y-3 bg-[#090d18]">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
            {capturedDataUrl ? (
              <img
                src={capturedDataUrl}
                alt="Foto capturada"
                className="w-full h-full object-contain"
              />
            ) : cameraError ? (
              <div className="p-6 text-center space-y-2.5 max-w-sm">
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {isStarting && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
                    <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                    <span>Iniciando cámara del dispositivo...</span>
                  </div>
                )}
              </>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Input nativo con soporte de cámara móvil y galería */}
          <input
            ref={nativeFileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onCaptureFile(file);
                onOpenChange(false);
              }
              if (nativeFileInputRef.current) nativeFileInputRef.current.value = '';
            }}
          />

          {/* Controles */}
          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
            {capturedDataUrl ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRetake}
                  className="h-9 text-xs gap-1.5 border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  Tomar otra
                </Button>

                <Button
                  type="button"
                  variant="alfa"
                  size="sm"
                  onClick={handleConfirmPhoto}
                  className="h-9 text-xs px-5 gap-1.5 font-bold"
                >
                  <Check className="w-4 h-4 text-slate-200" />
                  Adjuntar esta Foto
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleToggleFacingMode}
                    disabled={isStarting || !!cameraError}
                    className="h-9 text-xs gap-1.5 border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
                    title="Cambiar entre cámara frontal y trasera"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Girar cámara</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => nativeFileInputRef.current?.click()}
                    className="h-9 text-xs gap-1.5 border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
                    title="Abrir galería o cámara nativa del dispositivo"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Galería / Archivo</span>
                  </Button>
                </div>

                {!cameraError && (
                  <Button
                    type="button"
                    variant="alfa"
                    size="sm"
                    disabled={isStarting}
                    onClick={handleTakeSnapshot}
                    className="h-9 text-xs px-5 gap-1.5 font-bold"
                  >
                    <Camera className="w-4 h-4 text-slate-200" />
                    Capturar Foto
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
