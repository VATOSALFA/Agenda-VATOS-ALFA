'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  Settings,
  X,
  RefreshCw,
  CheckCircle2,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface MicrophonePermissionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPermissionGranted?: () => void;
  assistantName?: string;
}

export function MicrophonePermissionModal({
  isOpen,
  onOpenChange,
  onPermissionGranted,
  assistantName = 'Janet',
}: MicrophonePermissionModalProps) {
  const { toast } = useToast();
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [activePlatform, setActivePlatform] = useState<'android' | 'ios' | 'desktop'>('android');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) {
      setActivePlatform('android');
    } else if (/iPad|iPhone|iPod/.test(ua)) {
      setActivePlatform('ios');
    } else {
      setActivePlatform('desktop');
    }
  }, [isOpen]);

  const handleRetryPermission = async () => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      toast({
        variant: 'destructive',
        title: 'Navegador no compatible',
        description: 'Tu navegador actual no admite captura de audio.',
      });
      return;
    }

    setIsRetrying(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Detener stream de prueba
      stream.getTracks().forEach((track) => track.stop());

      toast({
        title: '¡Micrófono activado con éxito!',
        description: `Ahora puedes dictarle o enviarle notas de voz a ${assistantName}.`,
      });

      onOpenChange(false);
      if (onPermissionGranted) {
        onPermissionGranted();
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Aún no tiene permiso',
        description:
          'Sigue los pasos que se muestran en pantalla para permitir el micrófono y vuelve a presionar Reintentar.',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="w-[calc(100%-2rem)] sm:w-full max-w-lg p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background z-50 flex flex-col max-h-[90vh]"
      >
        {/* Cabecera Oficial VATOS ALFA con Franja Azul y Haz de Luz Oblicuo */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 sm:px-5 py-4 text-white shrink-0">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Mic className="w-5 h-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-tight leading-tight">
                  Activar Micrófono para {assistantName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5 leading-normal">
                  Sigue estos pasos en tu dispositivo para otorgar el permiso
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenido con Scroll */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs sm:text-sm">
          {/* Selector de plataforma */}
          <div className="flex items-center justify-center p-1 rounded-xl bg-muted/40 border border-border/60 gap-1">
            <button
              type="button"
              onClick={() => setActivePlatform('android')}
              className={cn(
                'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
                activePlatform === 'android'
                  ? 'bg-[#202A49] text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Android / PWA</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePlatform('ios')}
              className={cn(
                'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
                activePlatform === 'ios'
                  ? 'bg-[#202A49] text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>iPhone (iOS)</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePlatform('desktop')}
              className={cn(
                'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
                activePlatform === 'desktop'
                  ? 'bg-[#202A49] text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Computadora</span>
            </button>
          </div>

          {/* Guía según la plataforma */}
          {activePlatform === 'android' && (
            <div className="space-y-3">
              {/* Opción A: Desde el navegador o PWA */}
              <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                    Paso 1: Toca el botón azul de abajo (Más fácil)
                  </span>
                  <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30">
                    Recomendado
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Presiona el botón <strong className="text-foreground">"Reintentar y Probar Micrófono"</strong> aquí abajo. Tu teléfono mostrará la ventana oficial de Android preguntando: <em className="text-foreground">"¿Permitir que VATOS ALFA grabe audio?"</em>. Solo selecciona <strong className="text-blue-400 font-semibold">"Mientras la app esté en uso"</strong>.
                </p>
              </div>

              {/* Opción B: Si no sale la ventana, configurar en Chrome */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                  ¿Por qué no aparece el micrófono en los Ajustes de VATOS ALFA?
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  En Android, las aplicaciones web instaladas (PWA) delegan el hardware a <strong className="text-foreground">Google Chrome</strong>. Por eso, en los Ajustes del sistema de VATOS ALFA solo aparece "Notificaciones".
                </p>
                <div className="pt-1 space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Si tu teléfono bloqueó el permiso en Chrome:</p>
                  <ol className="space-y-1 text-xs list-decimal list-inside leading-relaxed">
                    <li>Abre los <strong className="text-foreground">Ajustes</strong> de tu teléfono &gt; <strong className="text-foreground">Aplicaciones</strong>.</li>
                    <li>Selecciona <strong className="text-foreground">Chrome</strong> (no VATOS ALFA).</li>
                    <li>Entra a <strong className="text-foreground">Permisos</strong> &gt; <strong className="text-foreground">Micrófono</strong> y cámbialo a <strong className="text-blue-400 font-semibold">"Permitir solo con la app en uso"</strong>.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {activePlatform === 'ios' && (
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2.5">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                Pasos en iPhone / iPad (Safari):
              </span>
              <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside leading-relaxed">
                <li>
                  En la barra de direcciones de Safari, toca el botón <strong className="text-foreground">aA</strong> a la izquierda.
                </li>
                <li>
                  Toca en <strong className="text-foreground">"Configuración del sitio web"</strong>.
                </li>
                <li>
                  En la opción <strong className="text-foreground">"Micrófono"</strong>, selecciona <strong className="text-blue-400 font-semibold">"Permitir"</strong>.
                </li>
                <li>
                  Si está bloqueado a nivel sistema: ve a <strong className="text-foreground">Ajustes del iPhone &gt; Safari &gt; Micrófono &gt; Permitir</strong>.
                </li>
              </ol>
            </div>
          )}

          {activePlatform === 'desktop' && (
            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2.5">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                Pasos en Computadora (Chrome / Edge / Firefox):
              </span>
              <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside leading-relaxed">
                <li>
                  En la barra de navegación (junto a <strong className="text-foreground">vatosalfa.com</strong>), haz clic en el icono de <strong className="text-foreground">candado 🔒</strong> o <strong className="text-foreground">ajustes de sitio</strong>.
                </li>
                <li>
                  Activa el switch de <strong className="text-foreground">"Micrófono"</strong> o cámbialo a <strong className="text-blue-400 font-semibold">"Permitir"</strong>.
                </li>
                <li>
                  Haz clic abajo en <strong className="text-foreground">"Reintentar y Probar Micrófono"</strong>.
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Botones de Acción */}
        <div className="p-3.5 sm:p-4 border-t border-border/60 bg-muted/20 flex items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 px-3.5 text-xs rounded-xl border-border/60"
          >
            Cerrar
          </Button>
          <Button
            type="button"
            variant="alfa"
            onClick={handleRetryPermission}
            disabled={isRetrying}
            className="h-9 px-4 text-xs font-bold rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRetrying && 'animate-spin')} />
            <span>{isRetrying ? 'Comprobando...' : 'Reintentar y Probar Micrófono'}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
