'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  QrCode,
  Camera,
  CheckCircle2,
  Sparkles,
  Scissors,
  CreditCard,
  Calendar,
  User,
  Plus,
  RotateCcw,
  Volume2,
  Search,
  AlertCircle,
  ExternalLink,
  Award,
  Clock,
  Tag,
  Loader2,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase-client';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import type { Client } from '@/lib/types';
import { ClientDetailModal } from '@/components/clients/client-detail-modal';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface QRScannerModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onClientSelectedForSale?: (client: Client) => void;
}

// Sonido nativo de escaneo usando Web Audio API (cero dependencias externas)
function playBeep(success = true) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (success) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08); // A6
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (_) {}
}

export function QRScannerModal({ isOpen, onOpenChange, onClientSelectedForSale }: QRScannerModalProps) {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [manualInput, setManualInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

  // Datos del escaneo
  const [scannedClient, setScannedClient] = useState<Client | null>(null);
  const [scannedPromo, setScannedPromo] = useState<any | null>(null);
  const [todayReservation, setTodayReservation] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isUpdatingStamp, setIsUpdatingStamp] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const scannerRef = useRef<any>(null);
  const scannerContainerId = 'vatos-qr-reader-element';

  // Iniciar / detener cámara
  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Error al detener scanner QR:', err);
      }
      scannerRef.current = null;
    }
  }, []);

  const handleScanText = useCallback(
    async (decodedText: string) => {
      if (isProcessing) return;
      setIsProcessing(true);

      try {
        let clientIdToSearch = '';
        let phoneToSearch = '';
        let clientNumberToSearch = '';
        let promoCodeToSearch = '';

        // Intentar parsear como JSON
        try {
          const parsed = JSON.parse(decodedText);
          if (parsed && typeof parsed === 'object') {
            if (parsed.type === 'VATOS_ALFA_CLIENT_PASS') {
              clientIdToSearch = parsed.clientId || '';
              phoneToSearch = parsed.phone || '';
            } else if (parsed.type === 'VATOS_ALFA_PROMO') {
              promoCodeToSearch = parsed.code || '';
            } else if (parsed.clientId) {
              clientIdToSearch = parsed.clientId;
            } else if (parsed.telefono || parsed.phone) {
              phoneToSearch = parsed.telefono || parsed.phone;
            }
          }
        } catch {
          // No es JSON, puede ser texto plano (código de promo, id de cliente o teléfono)
          const clean = decodedText.trim();
          if (clean.length === 10 && /^\d+$/.test(clean)) {
            phoneToSearch = clean;
          } else if (/^\d{1,5}$/.test(clean)) {
            clientNumberToSearch = clean;
          } else if (clean.length >= 15 && clean.length <= 30 && !clean.includes(' ')) {
            clientIdToSearch = clean;
          } else {
            // Posible código de cupón
            promoCodeToSearch = clean;
          }
        }

        if (!db) {
          throw new Error('Base de datos no disponible');
        }

        // 1. Buscar si es un Cliente
        let foundClient: Client | null = null;

        if (clientIdToSearch) {
          const snap = await getDoc(doc(db, 'clientes', clientIdToSearch));
          if (snap.exists()) {
            foundClient = { id: snap.id, ...snap.data() } as Client;
          }
        }

        if (!foundClient && phoneToSearch) {
          const cleanPhone = phoneToSearch.replace(/\D/g, '').slice(-10);
          const qPhone = query(collection(db, 'clientes'), where('telefono', '==', cleanPhone));
          const snapPhone = await getDocs(qPhone);
          if (!snapPhone.empty) {
            foundClient = { id: snapPhone.docs[0].id, ...snapPhone.docs[0].data() } as Client;
          }
        }

        if (!foundClient && clientNumberToSearch) {
          const qNumStr = query(collection(db, 'clientes'), where('numero_cliente', '==', clientNumberToSearch));
          const snapNumStr = await getDocs(qNumStr);
          if (!snapNumStr.empty) {
            foundClient = { id: snapNumStr.docs[0].id, ...snapNumStr.docs[0].data() } as Client;
          } else {
            const qNumInt = query(collection(db, 'clientes'), where('numero_cliente', '==', Number(clientNumberToSearch)));
            const snapNumInt = await getDocs(qNumInt);
            if (!snapNumInt.empty) {
              foundClient = { id: snapNumInt.docs[0].id, ...snapNumInt.docs[0].data() } as Client;
            }
          }
        }

        if (foundClient) {
          playBeep(true);
          setScannedClient(foundClient);
          setScannedPromo(null);
          await stopCamera();

          // Buscar cita de hoy para check-in
          try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const qRes = query(
              collection(db, 'reservas'),
              where('fecha', '==', todayStr),
              where('estado', 'in', ['Pendiente', 'Confirmada', 'Reservado', 'Asiste'])
            );
            const snapRes = await getDocs(qRes);
            const clientRes = snapRes.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .find(
                (r: any) =>
                  r.cliente_id === foundClient?.id ||
                  (foundClient?.telefono && r.telefono === foundClient.telefono)
              );
            setTodayReservation(clientRes || null);
          } catch (e) {
            console.warn('Error buscando cita de hoy:', e);
          }

          toast({
            title: '¡Cliente Identificado!',
            description: `${foundClient.nombre} ${foundClient.apellido || ''} escaneado con éxito.`,
          });
          return;
        }

        // 2. Si no es cliente, buscar si es un Cupón / Promoción
        if (promoCodeToSearch) {
          try {
            const appMovilRef = doc(db, 'configuracion', 'app_movil');
            const snapAppMovil = await getDoc(appMovilRef);
            if (snapAppMovil.exists()) {
              const promos: any[] = snapAppMovil.data().promociones || [];
              const matched = promos.find(
                p =>
                  p.activo !== false &&
                  p.codigoDescuento?.trim().toUpperCase() === promoCodeToSearch.toUpperCase()
              );
              if (matched) {
                playBeep(true);
                setScannedPromo(matched);
                setScannedClient(null);
                await stopCamera();
                toast({
                  title: '¡Promoción Válida!',
                  description: `Cupón "${matched.titulo}" verificado correctamente.`,
                });
                return;
              }
            }
          } catch (_) {}
        }

        // Si llegó aquí no se encontró nada
        playBeep(false);
        toast({
          variant: 'destructive',
          title: 'Código no reconocido',
          description: 'No se encontró ningún cliente o promoción activa con este código.',
        });
      } catch (err: any) {
        console.error('Error procesando escaneo QR:', err);
        playBeep(false);
        toast({
          variant: 'destructive',
          title: 'Error al escanear',
          description: err.message || 'No se pudo procesar el código.',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, stopCamera, toast]
  );

  const startCamera = useCallback(async () => {
    if (!isOpen || scannedClient || scannedPromo || activeTab !== 'camera') return;
    setCameraError(null);

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      // Si ya hay un scanner activo, limpiarlo
      await stopCamera();

      // Esperar brevemente a que el DOM monte el elemento
      await new Promise(r => setTimeout(r, 150));

      const container = document.getElementById(scannerContainerId);
      if (!container) return;

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      // Obtener cámaras disponibles
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setAvailableCameras(devices.map(d => ({ id: d.id, label: d.label || `Cámara ${d.id}` })));
        }
      } catch (_) {}

      const cameraConfig = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : { facingMode: 'environment' };

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 12,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        decodedText => {
          handleScanText(decodedText);
        },
        _error => {
          // Errores de frame silenciosos
        }
      );
    } catch (err: any) {
      console.warn('Error iniciando cámara:', err);
      let msg = 'No se pudo acceder a la cámara.';
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        msg = 'Permiso denegado. Permite el acceso a la cámara en tu navegador.';
      } else if (err?.name === 'NotFoundError') {
        msg = 'No se detectó ninguna cámara disponible en tu equipo.';
      }
      setCameraError(msg);
    }
  }, [isOpen, scannedClient, scannedPromo, activeTab, selectedCameraId, stopCamera, handleScanText]);

  // Manejar apertura y cierre del modal
  useEffect(() => {
    if (isOpen) {
      setScannedClient(null);
      setScannedPromo(null);
      setTodayReservation(null);
      setManualInput('');
      setActiveTab('camera');
      const timer = setTimeout(() => {
        startCamera();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
    }
  }, [isOpen]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Listener para pistola lectora física (captura enter rápido)
  useEffect(() => {
    if (!isOpen) return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo conscientemente en un input
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) {
        buffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          e.preventDefault();
          handleScanText(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleScanText]);

  // Acción: Sumar 1 sello de visita
  const handleAddStamp = async () => {
    if (!scannedClient || !db) return;
    setIsUpdatingStamp(true);

    try {
      const currentStamps = Number(scannedClient.cortes_acumulados || 0);
      const newStamps = currentStamps + 1;
      const isFreeEligible = newStamps >= 10;

      await updateDoc(doc(db, 'clientes', scannedClient.id), {
        cortes_acumulados: increment(1),
        citas_asistidas: increment(1),
        corte_gratis_disponible: isFreeEligible,
        actualizado_en: serverTimestamp(),
      });

      playBeep(true);
      setScannedClient({
        ...scannedClient,
        cortes_acumulados: newStamps,
        corte_gratis_disponible: isFreeEligible,
      });

      toast({
        title: '¡Sello de Visita Registrado!',
        description: isFreeEligible
          ? `¡Felicidades! ${scannedClient.nombre} completó sus 10 visitas y tiene un Corte Gratis.`
          : `Sello añadido con éxito. Ahora tiene ${newStamps} de 10 visitas.`,
      });
    } catch (err: any) {
      console.error('Error sumando sello:', err);
      toast({
        variant: 'destructive',
        title: 'Error al sumar sello',
        description: err.message,
      });
    } finally {
      setIsUpdatingStamp(false);
    }
  };

  // Acción: Canjear corte gratis
  const handleRedeemFreeCut = async () => {
    if (!scannedClient || !db) return;
    setIsUpdatingStamp(true);

    try {
      await updateDoc(doc(db, 'clientes', scannedClient.id), {
        cortes_acumulados: 0,
        corte_gratis_disponible: false,
        actualizado_en: serverTimestamp(),
      });

      playBeep(true);
      setScannedClient({
        ...scannedClient,
        cortes_acumulados: 0,
        corte_gratis_disponible: false,
      });

      toast({
        title: '¡Corte de Cortesía Canjeado!',
        description: `Se ha aplicado el corte gratuito para ${scannedClient.nombre}. El Pase Alfa se reinició a 0 visitas.`,
      });
    } catch (err: any) {
      console.error('Error al canjear corte:', err);
      toast({
        variant: 'destructive',
        title: 'Error al canjear',
        description: err.message,
      });
    } finally {
      setIsUpdatingStamp(false);
    }
  };

  // Acción: Check-in de cita de hoy
  const handleCheckIn = async () => {
    if (!todayReservation || !db) return;
    setIsCheckingIn(true);

    try {
      await updateDoc(doc(db, 'reservas', todayReservation.id), {
        estado: 'Asiste',
        checkInTime: serverTimestamp(),
        actualizado_en: serverTimestamp(),
      });

      setTodayReservation({
        ...todayReservation,
        estado: 'Asiste',
      });

      playBeep(true);
      toast({
        title: '¡Check-in Confirmado!',
        description: `La cita de las ${todayReservation.hora_inicio || ''} quedó marcada como "Asiste".`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error en check-in',
        description: err.message,
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Acción: Cobrar en Caja de Ventas
  const handleOpenInCashbox = () => {
    if (!scannedClient) return;
    onOpenChange(false);

    if (onClientSelectedForSale) {
      onClientSelectedForSale(scannedClient);
    } else {
      // Disparar evento para abrir NewSaleSheet automáticamente con el cliente precargado
      document.dispatchEvent(
        new CustomEvent('new-sale', {
          detail: {
            client: scannedClient,
            items: [],
          },
        })
      );
    }
  };

  // Acción: Volver a escanear otro cliente
  const handleResetScanner = () => {
    setScannedClient(null);
    setScannedPromo(null);
    setTodayReservation(null);
    setManualInput('');
    setActiveTab('camera');
    setTimeout(() => {
      startCamera();
    }, 200);
  };

  const clientStamps = Number(scannedClient?.cortes_acumulados || 0);
  const totalSlots = 10;
  const freeCutAvailable = Boolean(scannedClient?.corte_gratis_disponible || clientStamps >= totalSlots);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl bg-[#0F172A] border border-[#C5A880]/30 text-white shadow-2xl p-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="bg-gradient-to-r from-[#161E35] to-[#202A49] p-5 border-b border-[#C5A880]/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-[#C5A880]/15 border border-[#C5A880]/40 flex items-center justify-center text-[#C5A880]">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                    Lector QR • VATOS ALFA
                  </DialogTitle>
                  <DialogDescription className="text-xs text-[#C5A880]/90">
                    Escanea el Pase Alfa o cupón del cliente desde su app móvil
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4">
            {/* VISTA 1: RESULTADO DE CLIENTE ESCANEADO */}
            {scannedClient && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                {/* Tarjeta de Identificación del Cliente */}
                <div className="bg-[#161E35] border border-[#C5A880]/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#C5A880]/5 rounded-full blur-2xl pointer-events-none" />

                  <div className="flex items-start gap-3.5">
                    <Avatar className="h-16 w-16 border-2 border-[#C5A880] shadow-md shrink-0">
                      <AvatarImage
                        src={scannedClient.fotoUrl || scannedClient.avatarUrl || (scannedClient as any).foto_perfil_url}
                        alt={scannedClient.nombre}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-lg font-bold bg-[#202A49] text-[#C5A880]">
                        {scannedClient.nombre?.charAt(0)}
                        {scannedClient.apellido?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white truncate">
                          {scannedClient.nombre} {scannedClient.apellido || ''}
                        </h3>
                        {scannedClient.numero_cliente && (
                          <Badge variant="outline" className="text-[10px] border-[#C5A880]/50 text-[#C5A880] px-1.5 py-0">
                            #{scannedClient.numero_cliente}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-300 mt-1">
                        <span>{scannedClient.telefono || 'Sin teléfono'}</span>
                        {scannedClient.correo && (
                          <>
                            <span>&bull;</span>
                            <span className="truncate">{scannedClient.correo}</span>
                          </>
                        )}
                      </div>

                      {/* Nivel / Tier */}
                      <div className="mt-2 flex items-center gap-2">
                        <Badge
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 border',
                            scannedClient.nivel === 'Alfa Black VIP'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                              : scannedClient.nivel === 'Alfa Gold'
                              ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                              : 'bg-slate-700/50 text-slate-200 border-slate-600'
                          )}
                        >
                          <Award className="h-3 w-3 mr-1 inline" />
                          {scannedClient.nivel || 'Alfa Member'}
                        </Badge>

                        {scannedClient.appVinculada && (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
                            App Vinculada
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pase Alfa: Tarjeta de Sellos Visual */}
                  <div className="mt-4 pt-3.5 border-t border-[#C5A880]/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#C5A880]">
                        <Scissors className="h-3.5 w-3.5" />
                        <span>PASE ALFA (TARJETA DE VISITAS)</span>
                      </div>
                      <span className="text-xs font-bold text-white">
                        {clientStamps} / {totalSlots} Sellos
                      </span>
                    </div>

                    {/* Grilla de Sellos */}
                    <div className="grid grid-cols-10 gap-1.5 my-2.5">
                      {Array.from({ length: totalSlots }).map((_, idx) => {
                        const isFilled = idx < clientStamps;
                        const isLast = idx === totalSlots - 1;
                        return (
                          <div
                            key={idx}
                            className={cn(
                              'h-8 rounded-lg flex items-center justify-center border text-[11px] font-bold transition-all',
                              isFilled
                                ? isLast
                                  ? 'bg-gradient-to-br from-amber-400 to-amber-600 border-amber-300 text-black shadow-lg shadow-amber-500/30'
                                  : 'bg-[#C5A880] border-[#C5A880] text-black shadow-sm'
                                : isLast
                                ? 'bg-amber-950/30 border-dashed border-amber-500/40 text-amber-400'
                                : 'bg-[#0F172A] border-white/10 text-gray-500'
                            )}
                          >
                            {isFilled ? (
                              isLast ? (
                                <Sparkles className="h-4 w-4" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )
                            ) : isLast ? (
                              <Scissors className="h-3.5 w-3.5" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Banner si el corte gratis está listo */}
                    {freeCutAvailable ? (
                      <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-r from-emerald-950/80 to-amber-950/80 border border-emerald-500/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-amber-400 animate-bounce" />
                          <div>
                            <p className="text-xs font-bold text-emerald-300">¡10.° Corte Totalmente Gratis Disponible!</p>
                            <p className="text-[10px] text-gray-300">El cliente completó sus 10 visitas en la app.</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={isUpdatingStamp}
                          onClick={handleRedeemFreeCut}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                        >
                          {isUpdatingStamp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Canjear Ahora'}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                        <span>Faltan {Math.max(0, totalSlots - clientStamps)} visitas para su corte de cortesía.</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdatingStamp}
                          onClick={handleAddStamp}
                          className="h-7 text-xs border-[#C5A880]/50 text-[#C5A880] hover:bg-[#C5A880]/20"
                        >
                          {isUpdatingStamp ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          Sumar 1 Sello
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cita de hoy para Check-in */}
                {todayReservation && (
                  <div className="bg-[#1f2742] border border-blue-500/30 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">Cita Hoy: {todayReservation.hora_inicio}</span>
                          <Badge
                            className={cn(
                              'text-[9px] px-1.5 py-0',
                              todayReservation.estado === 'Asiste'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            )}
                          >
                            {todayReservation.estado}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-300">
                          {todayReservation.servicio || 'Servicio General'} &bull; Barbero:{' '}
                          {todayReservation.profesional_nombre || todayReservation.barbero_nombre || 'Asignado'}
                        </p>
                      </div>
                    </div>

                    {todayReservation.estado !== 'Asiste' && (
                      <Button
                        size="sm"
                        disabled={isCheckingIn}
                        onClick={handleCheckIn}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold h-8"
                      >
                        {isCheckingIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmar Asiste'}
                      </Button>
                    )}
                  </div>
                )}

                {/* Acciones Rápidas */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    onClick={handleOpenInCashbox}
                    className="w-full bg-[#C5A880] hover:bg-[#b0936b] text-black font-bold text-xs h-10 shadow-lg"
                  >
                    <CreditCard className="h-4 w-4 mr-1.5" />
                    Cobrar en Caja de Ventas
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setIsDetailModalOpen(true)}
                    className="w-full border-white/20 text-gray-200 hover:bg-white/10 text-xs h-10"
                  >
                    <User className="h-4 w-4 mr-1.5" />
                    Ver Ficha Completa
                  </Button>
                </div>

                <div className="pt-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetScanner}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Escanear a otro cliente
                  </Button>
                </div>
              </div>
            )}

            {/* VISTA 2: RESULTADO DE PROMOCIÓN / CUPÓN ESCANEADO */}
            {scannedPromo && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-[#161E35] border border-amber-500/40 rounded-2xl p-5 shadow-lg text-center space-y-3">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
                    <Tag className="h-6 w-6" />
                  </div>
                  <div>
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-bold px-3 py-1">
                      CÓDIGO: {scannedPromo.codigoDescuento}
                    </Badge>
                    <h3 className="text-lg font-bold text-white mt-2">{scannedPromo.titulo}</h3>
                    {scannedPromo.descripcion && (
                      <p className="text-xs text-gray-300 mt-1">{scannedPromo.descripcion}</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/10 flex gap-2">
                    <Button
                      onClick={() => {
                        onOpenChange(false);
                        document.dispatchEvent(
                          new CustomEvent('new-sale', {
                            detail: {
                              promoCode: scannedPromo.codigoDescuento,
                              items: [],
                            },
                          })
                        );
                      }}
                      className="flex-1 bg-[#C5A880] hover:bg-[#b0936b] text-black font-bold text-xs h-10"
                    >
                      <CreditCard className="h-4 w-4 mr-1.5" />
                      Aplicar en Caja de Ventas
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleResetScanner}
                      className="border-white/20 text-gray-200 text-xs h-10"
                    >
                      Volver a escanear
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* VISTA 3: ESCÁNER ACTIVO (CÁMARA / MANUAL) */}
            {!scannedClient && !scannedPromo && (
              <div className="space-y-3">
                {/* Selector de modo */}
                <div className="flex bg-[#161E35] p-1 rounded-xl border border-white/10">
                  <button
                    onClick={() => {
                      setActiveTab('camera');
                      setTimeout(() => startCamera(), 150);
                    }}
                    className={cn(
                      'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5',
                      activeTab === 'camera'
                        ? 'bg-[#202A49] text-[#C5A880] shadow border border-[#C5A880]/30'
                        : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Cámara Web / Tablet
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('manual');
                      stopCamera();
                    }}
                    className={cn(
                      'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5',
                      activeTab === 'manual'
                        ? 'bg-[#202A49] text-[#C5A880] shadow border border-[#C5A880]/30'
                        : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <Search className="h-3.5 w-3.5" />
                    Pistola USB / Búsqueda
                  </button>
                </div>

                {activeTab === 'camera' ? (
                  <div className="space-y-3">
                    {/* Visor de Cámara */}
                    <div className="relative w-full aspect-square max-h-[320px] mx-auto rounded-2xl overflow-hidden bg-black border-2 border-[#C5A880]/40 shadow-inner flex items-center justify-center">
                      <div id={scannerContainerId} className="w-full h-full object-cover" />

                      {/* Marco animado de escaneo */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-48 h-48 border-2 border-[#C5A880]/80 rounded-2xl relative shadow-[0_0_15px_rgba(197,168,128,0.3)]">
                          {/* Esquinas doradas */}
                          <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-[#C5A880]" />
                          <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-[#C5A880]" />
                          <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-[#C5A880]" />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-[#C5A880]" />

                          {/* Línea de escaneo láser */}
                          <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#C5A880] to-transparent shadow-[0_0_8px_#C5A880] animate-bounce mt-24" />
                        </div>
                      </div>

                      {cameraError && (
                        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center space-y-2">
                          <AlertCircle className="h-8 w-8 text-amber-400" />
                          <p className="text-xs text-gray-200">{cameraError}</p>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => startCamera()}
                            className="text-xs mt-2"
                          >
                            Reintentar Cámara
                          </Button>
                        </div>
                      )}

                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center space-y-2">
                          <Loader2 className="h-8 w-8 text-[#C5A880] animate-spin" />
                          <p className="text-xs font-semibold text-white">Identificando cliente...</p>
                        </div>
                      )}
                    </div>

                    {/* Selector de cámara si hay más de una */}
                    {availableCameras.length > 1 && (
                      <div className="flex items-center justify-center gap-2">
                        <Camera className="h-3 w-3 text-gray-400" />
                        <select
                          value={selectedCameraId || ''}
                          onChange={e => {
                            setSelectedCameraId(e.target.value);
                            setTimeout(() => startCamera(), 150);
                          }}
                          className="bg-[#161E35] border border-white/10 text-xs text-gray-300 rounded-lg px-2 py-1"
                        >
                          {availableCameras.map(cam => (
                            <option key={cam.id} value={cam.id}>
                              {cam.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <p className="text-[11px] text-center text-gray-400">
                      Pide al cliente que muestre el código QR de su tarjeta o cupón frente a la cámara.
                    </p>
                  </div>
                ) : (
                  /* Modo Manual / Pistola Lectora */
                  <div className="space-y-4 py-4">
                    <div className="p-4 rounded-xl bg-[#161E35] border border-white/10 text-center space-y-2">
                      <QrCode className="h-8 w-8 text-[#C5A880] mx-auto" />
                      <p className="text-xs text-gray-200 font-medium">
                        Dispara tu pistola lectora USB sobre el celular del cliente, o escribe su número de cliente / teléfono / cupón:
                      </p>
                    </div>

                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (manualInput.trim()) {
                          handleScanText(manualInput.trim());
                        }
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        autoFocus
                        value={manualInput}
                        onChange={e => setManualInput(e.target.value)}
                        placeholder="Ej. 607, 4425596138 o ALFA20..."
                        className="bg-[#161E35] border-white/20 text-white placeholder:text-gray-500 text-sm"
                      />
                      <Button
                        type="submit"
                        disabled={!manualInput.trim() || isProcessing}
                        className="bg-[#C5A880] hover:bg-[#b0936b] text-black font-bold text-xs"
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Ficha Completa del Cliente */}
      {isDetailModalOpen && scannedClient && (
        <ClientDetailModal
          client={scannedClient}
          isOpen={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
          onNewReservation={() => {
            setIsDetailModalOpen(false);
            onOpenChange(false);
            document.dispatchEvent(
              new CustomEvent('new-reservation', {
                detail: {
                  client: scannedClient,
                },
              })
            );
          }}
        />
      )}
    </>
  );
}
