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
  Gift,
  Coins,
  FileText,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase-client';
import {
  doc,
  getDoc,
  setDoc,
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
  const [scannedBenefit, setScannedBenefit] = useState<any | null>(null);
  const [isRedeemingBenefit, setIsRedeemingBenefit] = useState(false);
  const [todayReservation, setTodayReservation] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isUpdatingStamp, setIsUpdatingStamp] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [targetStamps, setTargetStamps] = useState<number>(10);
  const [rewardName, setRewardName] = useState<string>('Corte de Cortesía');
  const [beneficiosList, setBeneficiosList] = useState<any[]>([]);

  useEffect(() => {
    if (!db) return;
    async function loadPaseAlfaConfig() {
      try {
        const [snap, snapApp] = await Promise.all([
          getDoc(doc(db, 'configuracion', 'pase_alfa')),
          getDoc(doc(db, 'configuracion', 'app_movil')),
        ]);
        let bList: any[] = [];
        if (snap.exists()) {
          const d = snap.data();
          if (Number(d.sellosRequeridos) > 0) setTargetStamps(Number(d.sellosRequeridos));
          if (d.recompensa) setRewardName(d.recompensa);
          if (Array.isArray(d.beneficios_detallados) && d.beneficios_detallados.length > 0) {
            bList = d.beneficios_detallados;
          }
        }
        if (snapApp.exists()) {
          const d = snapApp.data().pase_alfa || snapApp.data();
          if (Number(d.sellosRequeridos) > 0 && !snap.exists()) setTargetStamps(Number(d.sellosRequeridos));
          if (d.recompensa && !snap.exists()) setRewardName(d.recompensa);
          if (bList.length === 0 && Array.isArray(d.beneficios_detallados)) {
            bList = d.beneficios_detallados;
          }
        }
        setBeneficiosList(bList);
      } catch (_) {}
    }
    loadPaseAlfaConfig();
  }, []);

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
        let detectedBenefit: any = null;

        // Intentar parsear como JSON
        try {
          const parsed = JSON.parse(decodedText);
          if (parsed && typeof parsed === 'object') {
            if (parsed.type === 'VATOS_ALFA_BENEFIT_REDEMPTION' || parsed.benefitId) {
              detectedBenefit = {
                folio: parsed.folio || `VA-BNF-${Date.now().toString().slice(-6)}`,
                benefitId: parsed.benefitId || 'beneficio_alfa',
                benefitTitle: parsed.benefitTitle || parsed.titulo || 'Beneficio Pase Alfa',
                clientId: parsed.clientId || '',
                phone: parsed.phone || parsed.clientPhone || '',
                clientName: parsed.clientName || '',
                discount: parsed.discount || 100,
                terminos: parsed.terminos || parsed.terms || '',
                descripcion: parsed.descripcion || parsed.description || '',
                fechaLimite: parsed.fechaLimite || parsed.expiresAt || null,
              };
              clientIdToSearch = parsed.clientId || '';
              phoneToSearch = parsed.phone || parsed.clientPhone || '';
            } else if (parsed.type === 'VATOS_ALFA_CLIENT_PASS') {
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
          // No es JSON, puede ser texto plano (folio de beneficio, código de promo, id de cliente o teléfono)
          const clean = decodedText.trim();
          if (clean.startsWith('VA-BNF-') || clean.startsWith('VA-CUMPLE-') || clean.startsWith('VA-REF-') || clean.startsWith('VA-CORTE-')) {
            detectedBenefit = {
              folio: clean,
              benefitTitle: clean.includes('CUMPLE') ? 'Regalo de Cumpleaños' : clean.includes('CORTE') ? '10.° Corte Gratis' : 'Beneficio Pase Alfa',
              benefitId: clean.includes('CUMPLE') ? 'regalo_cumpleanos' : clean.includes('CORTE') ? 'decimo_corte' : 'beneficio_alfa',
            };
          } else if (clean.length === 10 && /^\d+$/.test(clean)) {
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

        // Cruzar y enriquecer beneficio con los términos y configuración guardada en el sistema
        if (detectedBenefit) {
          const matchedConfig = beneficiosList.find(b =>
            (b.id && detectedBenefit.benefitId && String(b.id).toLowerCase() === String(detectedBenefit.benefitId).toLowerCase()) ||
            (b.titulo && detectedBenefit.benefitTitle && String(b.titulo).toLowerCase().trim() === String(detectedBenefit.benefitTitle).toLowerCase().trim())
          );

          if (matchedConfig) {
            if (!detectedBenefit.benefitTitle || detectedBenefit.benefitTitle === 'Beneficio Pase Alfa') {
              detectedBenefit.benefitTitle = matchedConfig.titulo;
            }
            if (!detectedBenefit.descripcion) detectedBenefit.descripcion = matchedConfig.descripcion || '';
            if (!detectedBenefit.terminos) detectedBenefit.terminos = matchedConfig.terminos || '';
            if (!detectedBenefit.fechaLimite) detectedBenefit.fechaLimite = matchedConfig.fechaLimite || null;
          }

          // Verificar si el beneficio cuenta con fecha límite y ya expiró
          if (detectedBenefit.fechaLimite) {
            try {
              const expDate = new Date(detectedBenefit.fechaLimite + 'T23:59:59');
              if (!isNaN(expDate.getTime()) && expDate < new Date()) {
                detectedBenefit.isExpired = true;
              }
            } catch (_) {}
          }
        }

        if (!db) {
          throw new Error('Base de datos no disponible');
        }

        // Verificar si el folio del beneficio ya fue canjeado previamente
        if (detectedBenefit?.folio) {
          try {
            const canjeSnap = await getDoc(doc(db, 'canjes_beneficios', detectedBenefit.folio));
            if (canjeSnap.exists()) {
              const cData = canjeSnap.data();
              if (cData.estado === 'canjeado') {
                playBeep(false);
                let fechaStr = 'una fecha previa';
                try {
                  const dObj = cData.fechaCanje?.toDate ? cData.fechaCanje.toDate() : (cData.canjeadoEn?.toDate ? cData.canjeadoEn.toDate() : null);
                  if (dObj) fechaStr = format(dObj, 'PPP p');
                } catch (_) {}
                toast({
                  variant: 'destructive',
                  title: '⚠️ Beneficio Ya Canjeado',
                  description: `El folio "${detectedBenefit.folio}" ya fue utilizado el ${fechaStr} en ${cData.sucursal || 'Sombrerete'}.`,
                });
                return;
              }
            }
          } catch (e) {
            console.warn('Error verificando canjes_beneficios:', e);
          }
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

        if (foundClient || detectedBenefit) {
          playBeep(true);
          setScannedClient(foundClient);
          setScannedBenefit(detectedBenefit);
          setScannedPromo(null);
          await stopCamera();

          // Buscar cita de hoy para check-in si tenemos cliente
          if (foundClient) {
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
          }

          toast({
            title: detectedBenefit ? '🎉 ¡Beneficio Alfa Identificado!' : '¡Cliente Identificado!',
            description: detectedBenefit
              ? `${detectedBenefit.benefitTitle} (${detectedBenefit.folio}) listo para validar.`
              : `${foundClient?.nombre} ${foundClient?.apellido || ''} escaneado con éxito.`,
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
    if (!isOpen || scannedClient || scannedPromo || scannedBenefit || activeTab !== 'camera') return;
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
  }, [isOpen, scannedClient, scannedPromo, scannedBenefit, activeTab, selectedCameraId, stopCamera, handleScanText]);

  // Manejar apertura y cierre del modal
  useEffect(() => {
    if (isOpen) {
      setScannedClient(null);
      setScannedPromo(null);
      setScannedBenefit(null);
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
      const isFreeEligible = newStamps >= targetStamps;

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
          ? `¡Felicidades! ${scannedClient.nombre} completó sus ${targetStamps} visitas y tiene su ${rewardName}.`
          : `Sello añadido con éxito. Ahora tiene ${newStamps} de ${targetStamps} visitas.`,
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

  // Acción: Canjear beneficio QR específico
  const handleRedeemBenefit = async (applyToCashbox = false) => {
    if (!scannedBenefit || !db) return;
    setIsRedeemingBenefit(true);

    try {
      const folio = scannedBenefit.folio || `VA-BNF-${Date.now().toString().slice(-6)}`;
      const clientName = scannedClient ? `${scannedClient.nombre} ${scannedClient.apellido || ''}`.trim() : (scannedBenefit.clientName || 'Cliente Alfa');
      const clientPhone = scannedClient?.telefono || scannedBenefit.phone || '';
      const clientId = scannedClient?.id || scannedBenefit.clientId || '';

      await setDoc(doc(db, 'canjes_beneficios', folio), {
        folio,
        benefitId: scannedBenefit.benefitId || 'beneficio_alfa',
        benefitTitle: scannedBenefit.benefitTitle || 'Beneficio Pase Alfa',
        clienteId: clientId,
        clienteNombre: clientName,
        telefono: clientPhone,
        estado: 'canjeado',
        canjeadoEn: serverTimestamp(),
        fechaCanje: serverTimestamp(),
        sucursal: 'Sombrerete',
        registradoPor: 'Recepción',
      }, { merge: true });

      // Si es el 10.° corte gratis, reiniciar sellos del cliente en Firestore
      if (scannedBenefit.benefitId === 'decimo_corte' || scannedBenefit.benefitId === 'corte_gratis') {
        if (clientId) {
          await updateDoc(doc(db, 'clientes', clientId), {
            cortes_acumulados: 0,
            corte_gratis_disponible: false,
            actualizado_en: serverTimestamp(),
          });
          if (scannedClient) {
            setScannedClient({ ...scannedClient, cortes_acumulados: 0, corte_gratis_disponible: false });
          }
        }
      }

      playBeep(true);
      toast({
        title: '🎉 ¡Beneficio Canjeado con Éxito!',
        description: `Se registró el canje de "${scannedBenefit.benefitTitle}" para ${clientName}.`,
      });

      if (applyToCashbox) {
        onOpenChange(false);
        document.dispatchEvent(
          new CustomEvent('new-sale', {
            detail: {
              client: scannedClient || undefined,
              benefitRedeemed: { ...scannedBenefit, folio },
              items: [],
            },
          })
        );
      } else {
        setScannedBenefit({ ...scannedBenefit, isRedeemed: true });
      }
    } catch (err: any) {
      console.error('Error al canjear beneficio:', err);
      toast({
        variant: 'destructive',
        title: 'Error al canjear',
        description: err.message,
      });
    } finally {
      setIsRedeemingBenefit(false);
    }
  };

  // Acción: Cobrar en Caja de Ventas
  const handleOpenInCashbox = () => {
    if (!scannedClient && !scannedBenefit) return;
    onOpenChange(false);

    if (onClientSelectedForSale && scannedClient) {
      onClientSelectedForSale(scannedClient);
    } else {
      // Disparar evento para abrir NewSaleSheet automáticamente con el cliente precargado
      document.dispatchEvent(
        new CustomEvent('new-sale', {
          detail: {
            client: scannedClient || undefined,
            benefitRedeemed: scannedBenefit || undefined,
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
    setScannedBenefit(null);
    setTodayReservation(null);
    setManualInput('');
    setActiveTab('camera');
    setTimeout(() => {
      startCamera();
    }, 200);
  };

  const clientStamps = Number(scannedClient?.cortes_acumulados || 0);
  const totalSlots = targetStamps;
  const freeCutAvailable = Boolean(scannedClient?.corte_gratis_disponible || clientStamps >= totalSlots);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl bg-[#0F172A] border border-[#C5A880]/30 text-white shadow-2xl p-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-5 border-b border-[#C5A880]/30 relative overflow-hidden">
            {/* Haz de luz animado sutil */}
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between">
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
            {/* VISTA 1: RESULTADO DE CLIENTE O BENEFICIO ESCANEADO */}
            {(scannedClient || scannedBenefit) && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                {/* TARJETA DESTACADA DE BENEFICIO ESCANEADO */}
                {scannedBenefit && (
                  <div className="bg-gradient-to-r from-[#10172b] via-[#161E35] to-[#10172b] border-2 border-[#C5A880]/60 rounded-2xl p-4 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#C5A880]/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="flex items-start justify-between gap-3 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-[#C5A880] flex items-center justify-center text-black shadow-md shrink-0">
                          <Gift className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/50 text-[10px] font-bold">
                              BENEFICIO ALFA APP
                            </Badge>
                            {scannedBenefit.folio && (
                              <span className="text-[10px] text-gray-300 font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                                Folio: {scannedBenefit.folio}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-bold text-white mt-1">
                            {scannedBenefit.benefitTitle || 'Beneficio Exclusivo'}
                          </h4>
                          {(scannedBenefit.clientName || scannedClient) && (
                            <p className="text-xs text-gray-300 mt-0.5">
                              Cliente:{' '}
                              <span className="text-white font-medium">
                                {scannedClient
                                  ? `${scannedClient.nombre} ${scannedClient.apellido || ''}`.trim()
                                  : scannedBenefit.clientName}
                              </span>
                              {scannedBenefit.phone && (
                                <span className="text-gray-400 ml-1">({scannedBenefit.phone})</span>
                              )}
                            </p>
                          )}
                          {scannedBenefit.descripcion && (
                            <p className="text-xs text-slate-300 mt-1 leading-snug">
                              {scannedBenefit.descripcion}
                            </p>
                          )}
                          {scannedBenefit.fechaLimite && (
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-300">
                              <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>Vigencia: hasta {scannedBenefit.fechaLimite}</span>
                              {scannedBenefit.isExpired && (
                                <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded ml-1">
                                  Expirado
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {scannedBenefit.isRedeemed ? (
                        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-xs px-2.5 py-1">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-blue-400" />
                          Canjeado
                        </Badge>
                      ) : scannedBenefit.isExpired ? (
                        <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-xs px-2.5 py-1">
                          Expirado
                        </Badge>
                      ) : (
                        <Badge className="bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/40 text-xs px-2.5 py-1 animate-pulse">
                          Listo para Canjear
                        </Badge>
                      )}
                    </div>

                    {/* Términos y Condiciones Oficiales del Beneficio */}
                    {scannedBenefit.terminos && (
                      <div className="mt-3 p-3 rounded-xl bg-black/40 border border-[#C5A880]/30 text-xs space-y-1 relative z-10">
                        <span className="font-semibold text-[#C5A880] flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                          <FileText className="h-3.5 w-3.5" /> Términos y Condiciones del Beneficio
                        </span>
                        <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line font-normal">
                          {scannedBenefit.terminos}
                        </p>
                      </div>
                    )}

                    {!scannedBenefit.isRedeemed && (
                      <div className="mt-4 pt-3 border-t border-[#C5A880]/20 flex gap-2 relative z-10">
                        <Button
                          disabled={isRedeemingBenefit}
                          onClick={() => handleRedeemBenefit(true)}
                          className="flex-1 bg-[#C5A880] hover:bg-[#b0936b] text-black font-bold text-xs h-10 shadow-md"
                        >
                          {isRedeemingBenefit ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <CreditCard className="h-4 w-4 mr-1.5" />
                          )}
                          Canjear y Aplicar en Caja
                        </Button>
                        <Button
                          variant="outline"
                          disabled={isRedeemingBenefit}
                          onClick={() => handleRedeemBenefit(false)}
                          className="border-[#C5A880]/40 text-[#C5A880] hover:bg-[#C5A880]/10 text-xs h-10 px-3"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-blue-400" />
                          Solo Canjear
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Tarjeta de Identificación del Cliente */}
                {scannedClient && (
                  <>
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

                        {/* Nivel / Tier y AlfaCoins */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Badge
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 border',
                              scannedClient.nivel === 'Alfa Black VIP' || scannedClient.nivel === 'Alfa Gold'
                                ? 'bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/50'
                                : 'bg-slate-700/50 text-slate-200 border-slate-600'
                            )}
                          >
                            <Award className="h-3 w-3 mr-1 inline text-[#C5A880]" />
                            {scannedClient.nivel || 'Alfa Member'}
                          </Badge>

                          <Badge className="bg-[#C5A880]/10 border border-[#C5A880]/30 text-[#C5A880] text-[10px] font-bold px-2 py-0.5">
                            <Coins className="h-3 w-3 mr-1 inline text-[#C5A880]" />
                            {Number(scannedClient.alfaCoins ?? (scannedClient as any).alfa_coins ?? scannedClient.puntosLealtad ?? (scannedClient as any).puntos_lealtad ?? 0)} ALFA COINS
                          </Badge>

                          {scannedClient.appVinculada && (
                            <span className="text-[10px] text-blue-400 font-semibold flex items-center">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mr-1 animate-pulse" />
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
                                  ? 'bg-[#C5A880] border-[#C5A880] text-black shadow-lg shadow-[#C5A880]/30'
                                  : 'bg-[#C5A880] border-[#C5A880] text-black shadow-sm'
                                : isLast
                                ? 'bg-[#C5A880]/10 border-dashed border-[#C5A880]/40 text-[#C5A880]'
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
                      <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-r from-[#10172b] via-[#161E35] to-[#10172b] border border-[#C5A880]/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-[#C5A880] animate-bounce" />
                          <div>
                            <p className="text-xs font-bold text-[#C5A880]">¡{rewardName} Disponible!</p>
                            <p className="text-[10px] text-gray-300">El cliente completó sus {targetStamps} visitas en la app.</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={isUpdatingStamp}
                          onClick={handleRedeemFreeCut}
                          className="bg-[#C5A880] hover:bg-[#b0936b] text-black text-xs font-bold shadow-md"
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
                                ? 'bg-blue-600/30 text-blue-200 border-blue-400/40'
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
                </>
                )}

                <div className="pt-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetScanner}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Escanear a otro cliente / código
                  </Button>
                </div>
              </div>
            )}

            {/* VISTA 2: RESULTADO DE PROMOCIÓN / CUPÓN ESCANEADO */}
            {scannedPromo && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-[#161E35] border border-[#C5A880]/40 rounded-2xl p-5 shadow-lg text-center space-y-3">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-[#C5A880]/20 border border-[#C5A880]/50 flex items-center justify-center text-[#C5A880]">
                    <Tag className="h-6 w-6" />
                  </div>
                  <div>
                    <Badge className="bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/40 text-xs font-bold px-3 py-1">
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
            {!scannedClient && !scannedPromo && !scannedBenefit && (
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
                          <AlertCircle className="h-8 w-8 text-red-400" />
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
