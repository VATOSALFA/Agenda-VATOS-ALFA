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
  Minus,
  Smartphone,
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
  Users,
  Crown,
  Percent,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/firebase-auth-context';
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
  onSnapshot,
} from 'firebase/firestore';
import type { Client } from '@/lib/types';
import { ClientDetailModal } from '@/components/clients/client-detail-modal';
import { cn, formatMoney } from '@/lib/utils';
import { format } from 'date-fns';
import {
  validateClientBirthdayForBenefit,
  verifyBenefitSignature,
  findMatchingReferrerClient,
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_HOST_REWARD_COINS,
  REFERRAL_MIN_PURCHASE_MXN,
  validateJuntosSchedule,
  JUNTOS_REWARD_COINS_PER_PERSON,
  getCurrentHaircutPrice,
  evaluateClientAlfaTier,
} from '@/lib/benefit-security';

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
  const { user } = useAuth();
  const canViewPhone = React.useMemo(() => {
    if (user?.role === 'Administrador general' || user?.role === 'Administrador local') return true;
    return Boolean(user?.permissions?.includes('ver_numero_telefono'));
  }, [user]);

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
  const [currentHaircutPrice, setCurrentHaircutPrice] = useState<number>(140);
  const [nivelesConfig, setNivelesConfig] = useState<any>(null);

  // Estados interactivos para promoción "JUNTOS ES MEJOR" en Recepción
  const [juntosOption, setJuntosOption] = useState<'minors' | 'companions_app' | null>(null);
  const [juntosMinorsCount, setJuntosMinorsCount] = useState<number>(1);
  const [juntosCompanions, setJuntosCompanions] = useState<
    Array<{ id: string; nombre: string; telefono?: string; folio?: string }>
  >([]);
  const [isScanningCompanion, setIsScanningCompanion] = useState<boolean>(false);

  useEffect(() => {
    if (!db) return;
    async function loadPaseAlfaConfig() {
      try {
        const [snap, snapApp, snapServices] = await Promise.all([
          getDoc(doc(db, 'configuracion', 'pase_alfa')),
          getDoc(doc(db, 'configuracion', 'app_movil')),
          getDocs(collection(db, 'servicios')),
        ]);
        if (!snapServices.empty) {
          const sList = snapServices.docs.map(d => ({ id: d.id, ...d.data() }));
          setCurrentHaircutPrice(getCurrentHaircutPrice(sList));
        }
        let bList: any[] = [];
        if (snap.exists()) {
          const d = snap.data();
          if (Number(d.sellosRequeridos) > 0) setTargetStamps(Number(d.sellosRequeridos));
          if (d.recompensa) setRewardName(d.recompensa);
          if (Array.isArray(d.beneficios_detallados) && d.beneficios_detallados.length > 0) {
            bList = d.beneficios_detallados;
          }
          if (d.niveles_config) setNivelesConfig(d.niveles_config);
        }
        if (snapApp.exists()) {
          const rawApp = snapApp.data();
          const d = rawApp.pase_alfa || rawApp;
          if (Number(d.sellosRequeridos) > 0 && !snap.exists()) setTargetStamps(Number(d.sellosRequeridos));
          if (d.recompensa && !snap.exists()) setRewardName(d.recompensa);
          if (bList.length === 0 && Array.isArray(d.beneficios_detallados)) {
            bList = d.beneficios_detallados;
          }
          const niv = rawApp.niveles_config || d.niveles_config || rawApp['pase_alfa.niveles_config'];
          if (niv) setNivelesConfig((prev: any) => prev || niv);
        }
        setBeneficiosList(bList);
      } catch (_) {}
    }
    loadPaseAlfaConfig();

    const unsubPase = onSnapshot(
      doc(db, 'configuracion', 'pase_alfa'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (d.niveles_config) setNivelesConfig(d.niveles_config);
          if (Number(d.sellosRequeridos) > 0) setTargetStamps(Number(d.sellosRequeridos));
          if (d.recompensa) setRewardName(d.recompensa);
          if (Array.isArray(d.beneficios_detallados) && d.beneficios_detallados.length > 0) {
            setBeneficiosList(d.beneficios_detallados);
          }
        }
      },
      () => {}
    );

    return () => unsubPase();
  }, []);

  const scannedClientTier = React.useMemo(
    () => evaluateClientAlfaTier(scannedClient, nivelesConfig),
    [scannedClient, nivelesConfig]
  );

  const scannerRef = useRef<any>(null);
  const scannerContainerId = 'vatos-qr-reader-element';
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              const rawFolio = parsed.folio || `VA-BNF-${Date.now().toString().slice(-6)}`;
              const isRefQR =
                parsed.benefitId === 'invita_amigo' ||
                rawFolio.startsWith('VA-REF') ||
                (parsed.benefitTitle || '').toLowerCase().includes('amigo') ||
                (parsed.benefitTitle || '').toLowerCase().includes('invita');

              const isJuntosQR =
                parsed.benefitId === 'juntos_es_mejor' ||
                rawFolio.startsWith('VA-JUNTOS') ||
                (parsed.benefitTitle || '').toLowerCase().includes('juntos');

              const schedJuntos = isJuntosQR ? validateJuntosSchedule() : { isValid: true, reason: undefined };

              detectedBenefit = {
                folio: rawFolio,
                benefitId: isRefQR ? 'invita_amigo' : isJuntosQR ? 'juntos_es_mejor' : (parsed.benefitId || 'beneficio_alfa'),
                rawBenefitId: parsed.benefitId || (isJuntosQR ? 'juntos_es_mejor' : 'beneficio_alfa'),
                benefitTitle: isJuntosQR ? 'JUNTOS ES MEJOR' : (parsed.benefitTitle || parsed.titulo || 'Beneficio Pase Alfa'),
                clientId: parsed.clientId || '',
                phone: parsed.phone || parsed.clientPhone || '',
                clientName: parsed.clientName || '',
                discount: isRefQR ? REFERRAL_DISCOUNT_PERCENT : isJuntosQR ? 0 : (parsed.discount || 100),
                isReferralBenefit: isRefQR,
                isJuntosBenefit: isJuntosQR,
                referralCode: parsed.referralCode || '',
                rewardCoins: isRefQR ? REFERRAL_HOST_REWARD_COINS : isJuntosQR ? JUNTOS_REWARD_COINS_PER_PERSON : undefined,
                minPurchase: isRefQR ? REFERRAL_MIN_PURCHASE_MXN : undefined,
                terminos: parsed.terminos || parsed.terms || '',
                descripcion: parsed.descripcion || parsed.description || '',
                fechaLimite: parsed.fechaLimite || parsed.expiresAt || null,
                signature: parsed.sig || parsed.signature || '',
                year: parsed.year || new Date().getFullYear(),
                isScheduleValid: schedJuntos.isValid,
                scheduleWarning: !schedJuntos.isValid ? schedJuntos.reason : undefined,
                minorsCount: 0,
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
          if (clean.startsWith('VA-BNF-') || clean.startsWith('VA-CUMPLE-') || clean.startsWith('VA-REF-') || clean.startsWith('VA-CORTE-') || clean.startsWith('VA-JUNTOS-')) {
            const isRefFolio = clean.startsWith('VA-REF-');
            const isJuntosFolio = clean.startsWith('VA-JUNTOS-');
            const schedJuntos = isJuntosFolio ? validateJuntosSchedule() : { isValid: true, reason: undefined };

            detectedBenefit = {
              folio: clean,
              benefitTitle: clean.includes('CUMPLE') ? 'Regalo de Cumpleaños' : clean.includes('CORTE') ? '10.° Corte Gratis' : isRefFolio ? 'Invita a un Amigo' : isJuntosFolio ? 'JUNTOS ES MEJOR' : 'Beneficio Pase Alfa',
              benefitId: clean.includes('CUMPLE') ? 'regalo_cumpleanos' : clean.includes('CORTE') ? 'decimo_corte' : isRefFolio ? 'invita_amigo' : isJuntosFolio ? 'juntos_es_mejor' : 'beneficio_alfa',
              isReferralBenefit: isRefFolio,
              isJuntosBenefit: isJuntosFolio,
              discount: isRefFolio ? REFERRAL_DISCOUNT_PERCENT : isJuntosFolio ? 0 : 100,
              rewardCoins: isRefFolio ? REFERRAL_HOST_REWARD_COINS : isJuntosFolio ? JUNTOS_REWARD_COINS_PER_PERSON : undefined,
              minPurchase: isRefFolio ? REFERRAL_MIN_PURCHASE_MXN : undefined,
              isScheduleValid: schedJuntos.isValid,
              scheduleWarning: !schedJuntos.isValid ? schedJuntos.reason : undefined,
              minorsCount: 0,
              ...(isRefFolio ? {
                isBlocked: true,
                blockReason: '⛔ FOLIO INCOMPLETO: Para aplicar el beneficio "Invita a un Amigo", escanea el código QR desde la app o ingresa el código oficial ALFA-NOMBRE-XXXX para identificar al anfitrión.',
              } : {}),
            };
          } else if (clean.length === 10 && /^\d+$/.test(clean)) {
            phoneToSearch = clean;
          } else if (/^\d{1,5}$/.test(clean)) {
            clientNumberToSearch = clean;
          } else if (clean.length >= 15 && clean.length <= 30 && !clean.includes(' ')) {
            clientIdToSearch = clean;
          } else if (clean.toUpperCase().startsWith('ALFA-')) {
            // Validación Zero-Trust de Doble Factor para Código de Referido (ALFA-NOMBRE-XXXX)
            let hostClient: Client | null = null;
            let referralError: string | undefined;
            let suffixPart = clean.toUpperCase().split('-')[2] || 'ALFA';

            if (db) {
              try {
                const qSnap = await getDocs(collection(db, 'clientes'));
                const allClients = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
                const matchResult = findMatchingReferrerClient(allClients, clean);
                hostClient = matchResult.hostClient;
                referralError = matchResult.error;
                if (matchResult.parsed.suffix) {
                  suffixPart = matchResult.parsed.suffix;
                }
              } catch (err) {
                console.warn('Error buscando anfitrión por código ALFA:', err);
                referralError = 'Error al verificar el código en la base de datos.';
              }
            }

            const hostFullName = hostClient
              ? `${hostClient.nombre} ${hostClient.apellido || ''}`.trim()
              : '';

            detectedBenefit = {
              folio: `VA-REF-${suffixPart}-${Date.now().toString().slice(-4)}`,
              benefitTitle: 'Invita a un Amigo',
              benefitId: 'invita_amigo',
              isReferralBenefit: true,
              referralCode: clean.toUpperCase(),
              referrerId: hostClient?.id || '',
              referrerName: hostFullName || 'No identificado',
              referrerPhone: hostClient?.telefono || '',
              discount: REFERRAL_DISCOUNT_PERCENT,
              rewardCoins: REFERRAL_HOST_REWARD_COINS,
              minPurchase: REFERRAL_MIN_PURCHASE_MXN,
              isBlocked: !hostClient,
              blockReason: !hostClient
                ? (referralError || '⛔ CÓDIGO INVÁLIDO: No existe ningún cliente titular con este código de invitación.')
                : undefined,
              descripcion: hostClient
                ? `Invitación oficial de ${hostFullName}. El amigo invitado (cliente nuevo) recibe ${REFERRAL_DISCOUNT_PERCENT}% de descuento en su primer servicio y ${hostFullName} gana ${REFERRAL_HOST_REWARD_COINS} Alfa Coins al completarse la compra ($${REFERRAL_MIN_PURCHASE_MXN} MXN o más).`
                : `Código no válido (${clean.toUpperCase()}).`,
            };
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

        // MODO ESCANEO DE ACOMPAÑANTE CON APP ("JUNTOS ES MEJOR")
        if (isScanningCompanion && scannedBenefit?.isJuntosBenefit) {
          let compClient: Client | null = null;
          if (clientIdToSearch) {
            const snap = await getDoc(doc(db, 'clientes', clientIdToSearch));
            if (snap.exists()) {
              compClient = { id: snap.id, ...snap.data() } as Client;
            }
          }
          if (!compClient && phoneToSearch) {
            const cleanPhone = phoneToSearch.replace(/\D/g, '').slice(-10);
            const qPhone = query(collection(db, 'clientes'), where('telefono', '==', cleanPhone));
            const snapPhone = await getDocs(qPhone);
            if (!snapPhone.empty) {
              compClient = { id: snapPhone.docs[0].id, ...snapPhone.docs[0].data() } as Client;
            }
          }
          if (!compClient && clientNumberToSearch) {
            const qNumStr = query(collection(db, 'clientes'), where('numero_cliente', '==', clientNumberToSearch));
            const snapNumStr = await getDocs(qNumStr);
            if (!snapNumStr.empty) {
              compClient = { id: snapNumStr.docs[0].id, ...snapNumStr.docs[0].data() } as Client;
            } else {
              const qNumInt = query(collection(db, 'clientes'), where('numero_cliente', '==', Number(clientNumberToSearch)));
              const snapNumInt = await getDocs(qNumInt);
              if (!snapNumInt.empty) {
                compClient = { id: snapNumInt.docs[0].id, ...snapNumInt.docs[0].data() } as Client;
              }
            }
          }

          if (!compClient) {
            playBeep(false);
            toast({
              variant: 'destructive',
              title: '⛔ Acompañante no encontrado',
              description: 'El código escaneado no pertenece a ningún cliente registrado con la App de VATOS ALFA.',
            });
            return;
          }

          if (scannedClient && compClient.id === scannedClient.id) {
            playBeep(false);
            toast({
              variant: 'destructive',
              title: '⛔ Mismo Cliente',
              description: 'No puedes escanear al titular como su propio acompañante. Escanea el QR de su amigo o familiar.',
            });
            return;
          }

          if (juntosCompanions.some(c => c.id === compClient!.id)) {
            playBeep(false);
            toast({
              variant: 'destructive',
              title: 'Acompañante ya agregado',
              description: `${compClient.nombre} ya está en la lista de acompañantes verificados.`,
            });
            return;
          }

          // Validar firma criptográfica si el acompañante mostró un QR de beneficio
          if (detectedBenefit?.signature && detectedBenefit?.clientId && detectedBenefit?.folio) {
            const sigOk = await verifyBenefitSignature(
              detectedBenefit.clientId,
              detectedBenefit.folio,
              detectedBenefit.benefitId || 'juntos_es_mejor',
              detectedBenefit.year || new Date().getFullYear(),
              detectedBenefit.signature,
              detectedBenefit.rawBenefitId
            );
            if (!sigOk) {
              playBeep(false);
              toast({
                variant: 'destructive',
                title: '⛔ QR de Acompañante Inválido',
                description: 'La firma criptográfica del QR del acompañante no es válida.',
              });
              return;
            }
          }

          // Verificar que el acompañante no haya canjeado ya hoy "Juntos es Mejor"
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          if ((compClient as any).ultimo_canje_juntos_fecha === todayStr) {
            playBeep(false);
            toast({
              variant: 'destructive',
              title: '⛔ Beneficio Ya Utilizado Hoy',
              description: `${compClient.nombre} ya utilizó la promoción "Juntos es Mejor" el día de hoy.`,
            });
            return;
          }

          const compFullName = `${compClient.nombre} ${compClient.apellido || ''}`.trim();
          setJuntosCompanions(prev => [
            ...prev,
            {
              id: compClient!.id,
              nombre: compFullName,
              telefono: compClient!.telefono || '',
              folio: detectedBenefit?.folio || `VA-JUNTOS-${compClient!.id.slice(0, 5).toUpperCase()}`,
            },
          ]);
          setIsScanningCompanion(false);
          await stopCamera();
          playBeep(true);
          toast({
            title: '✓ Acompañante Verificado',
            description: `${compFullName} agregado al grupo (+${JUNTOS_REWARD_COINS_PER_PERSON} Alfa Coins).`,
          });
          return;
        }

        // Reiniciar estados de Juntos es Mejor al escanear un nuevo titular
        setJuntosOption(null);
        setJuntosMinorsCount(1);
        setJuntosCompanions([]);
        setIsScanningCompanion(false);

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

        // Buscar cita de hoy del cliente antes de validar horarios de promociones
        let clientResForToday: any = null;
        if (foundClient) {
          try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const qRes = query(
              collection(db, 'reservas'),
              where('fecha', '==', todayStr),
              where('estado', 'in', ['Pendiente', 'Confirmada', 'Reservado', 'Asiste'])
            );
            const snapRes = await getDocs(qRes);
            clientResForToday =
              snapRes.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .find(
                  (r: any) =>
                    r.cliente_id === foundClient?.id ||
                    (foundClient?.telefono && r.telefono === foundClient.telefono)
                ) || null;
          } catch (e) {
            console.warn('Error buscando cita de hoy:', e);
          }
        }
        setTodayReservation(clientResForToday);

        if (detectedBenefit) {
          // 0. Verificar firma criptográfica si proviene de un QR firmado de la App
          if (detectedBenefit.signature && detectedBenefit.clientId && detectedBenefit.folio) {
            const sigOk = await verifyBenefitSignature(
              detectedBenefit.clientId,
              detectedBenefit.folio,
              detectedBenefit.benefitId || 'beneficio_alfa',
              detectedBenefit.year || new Date().getFullYear(),
              detectedBenefit.signature,
              detectedBenefit.rawBenefitId
            );
            if (!sigOk) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ FIRMA CRIPTOGRÁFICA INVÁLIDA: Este código QR fue alterado o generado fuera de la aplicación oficial de VATOS ALFA.';
            }
          }

          // Validación Zero-Trust para "JUNTOS ES MEJOR"
          const isJuntos =
            detectedBenefit.isJuntosBenefit ||
            detectedBenefit.benefitId === 'juntos_es_mejor' ||
            detectedBenefit.folio?.startsWith('VA-JUNTOS') ||
            (detectedBenefit.benefitTitle || '').toLowerCase().includes('juntos');

          if (isJuntos) {
            detectedBenefit.isJuntosBenefit = true;
            detectedBenefit.benefitId = 'juntos_es_mejor';
            detectedBenefit.benefitTitle = 'JUNTOS ES MEJOR';

            // 1. Exigir QR oficial firmado desde la App (prohibir folios manuales sin firma)
            if (!detectedBenefit.signature || !detectedBenefit.clientId) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ QR OFICIAL REQUERIDO: Para aplicar la promoción "Juntos es Mejor", debes escanear el código QR oficial desde la aplicación móvil del cliente.';
            } else if (!foundClient) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ CLIENTE NO ENCONTRADO: Este código QR no pertenece a ningún cliente registrado en el sistema oficial de VATOS ALFA.';
            } else if (!detectedBenefit.isBlocked) {
              // 2. Validar día y horario oficial (Lunes, Martes y Miércoles de 10:00 a 14:00 hrs o cita iniciada en ese rango)
              const schedResult = validateJuntosSchedule(new Date(), clientResForToday?.hora_inicio);
              detectedBenefit.isScheduleValid = schedResult.isValid;
              detectedBenefit.scheduleWarning = schedResult.reason;

              if (!schedResult.isValid) {
                detectedBenefit.isBlocked = true;
                detectedBenefit.blockReason = schedResult.reason;
              } else {
                // 3. Validar Anti-Farming: Máximo 1 canje de Juntos es Mejor por cliente por día
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                if ((foundClient as any).ultimo_canje_juntos_fecha === todayStr) {
                  detectedBenefit.isBlocked = true;
                  detectedBenefit.blockReason = `⛔ BENEFICIO YA CANJEADO HOY: El cliente "${foundClient.nombre}" ya utilizó la promoción "Juntos es Mejor" el día de hoy (${todayStr}). Solo se permite 1 canje por día de promoción.`;
                } else {
                  try {
                    const qCanjesHoy = query(
                      collection(db, 'canjes_beneficios'),
                      where('clienteId', '==', foundClient.id)
                    );
                    const snapCanjesHoy = await getDocs(qCanjesHoy);
                    const usedToday = snapCanjesHoy.docs.some(dSnap => {
                      const d = dSnap.data();
                      if (d.estado !== 'canjeado') return false;
                      const isJuntosDoc =
                        d.benefitId === 'juntos_es_mejor' ||
                        d.isJuntosBenefit === true ||
                        (d.folio || '').startsWith('VA-JUNTOS');
                      if (!isJuntosDoc) return false;
                      if (d.fechaStr === todayStr) return true;
                      const dt = d.fechaCanje?.toDate ? d.fechaCanje.toDate() : d.canjeadoEn?.toDate ? d.canjeadoEn.toDate() : null;
                      return dt ? format(dt, 'yyyy-MM-dd') === todayStr : false;
                    });
                    if (usedToday) {
                      detectedBenefit.isBlocked = true;
                      detectedBenefit.blockReason = `⛔ BENEFICIO YA CANJEADO HOY: Ya existe un canje de "Juntos es Mejor" registrado hoy para ${foundClient.nombre}.`;
                    }
                  } catch (_) {}
                }
              }
            }
          }

          const isReferral =
            detectedBenefit.isReferralBenefit ||
            detectedBenefit.benefitId === 'invita_amigo' ||
            detectedBenefit.folio?.startsWith('VA-REF');

          if (isReferral) {
            detectedBenefit.isReferralBenefit = true;
            detectedBenefit.benefitId = 'invita_amigo';
            detectedBenefit.discount = REFERRAL_DISCOUNT_PERCENT;
            detectedBenefit.rewardCoins = REFERRAL_HOST_REWARD_COINS;
            detectedBenefit.minPurchase = REFERRAL_MIN_PURCHASE_MXN;

            // Si se escaneó el QR de invitación del anfitrión, foundClient es el anfitrión (quien invita), NO el cliente nuevo
            if (!detectedBenefit.referrerId && foundClient) {
              const hostFullName = `${foundClient.nombre} ${foundClient.apellido || ''}`.trim();
              detectedBenefit.referrerId = foundClient.id;
              detectedBenefit.referrerName = hostFullName;
              detectedBenefit.referrerPhone = foundClient.telefono || '';
              detectedBenefit.descripcion = `Invitación oficial de ${hostFullName}. El amigo invitado (cliente nuevo) recibe ${REFERRAL_DISCOUNT_PERCENT}% de descuento en su primer servicio y ${hostFullName} gana ${REFERRAL_HOST_REWARD_COINS} Alfa Coins al completarse la compra ($${REFERRAL_MIN_PURCHASE_MXN} MXN o más).`;
            }

            // Limpiar foundClient para que en Caja se seleccione o registre al AMIGO NUEVO, no al anfitrión
            foundClient = null;
            detectedBenefit.clientName = '';
            detectedBenefit.clientId = '';
            detectedBenefit.phone = '';

            if (!detectedBenefit.referrerId && !detectedBenefit.isBlocked) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ ANFITRIÓN NO ENCONTRADO: Este código de invitación no pertenece a ningún miembro registrado en el sistema oficial de VATOS ALFA.';
            }
          }

          const isBirthday =
            detectedBenefit.benefitId === 'regalo_cumpleanos' ||
            detectedBenefit.folio?.includes('CUMPLE') ||
            (detectedBenefit.benefitTitle || '').toLowerCase().includes('cumple');

          if (isBirthday) {
            detectedBenefit.isBirthdayBenefit = true;

            // 1. Exigir QR oficial firmado desde la App y cliente existente en la base de datos oficial
            if (!detectedBenefit.signature || !detectedBenefit.clientId) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ QR OFICIAL REQUERIDO: Para validar el Regalo de Cumpleaños, debes escanear el código QR oficial firmado desde la aplicación móvil del cliente.';
            } else if (!foundClient) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ CÓDIGO INVÁLIDO: Este código QR no está vinculado a ningún cliente registrado en el sistema oficial. Posible código generado externamente o alterado.';
            } else if (!detectedBenefit.isBlocked) {
              // 2. Validar mes de cumpleaños oficial directamente en Firestore
              const bdayResult = validateClientBirthdayForBenefit(foundClient);
              if (!bdayResult.isEligible) {
                detectedBenefit.isBlocked = true;
                detectedBenefit.blockReason = bdayResult.rejectionReason;
              } else {
                // 3. Validar que no haya sido canjeado en este año (Anti-Replay / 1 cortesía por año)
                const currentYear = new Date().getFullYear();
                const clientLastYear = Number((foundClient as any).ultimo_canje_cumpleanos_anio || 0);

                if (clientLastYear === currentYear) {
                  detectedBenefit.isBlocked = true;
                  detectedBenefit.blockReason = `⛔ BENEFICIO YA CANJEADO: Este cliente ya utilizó su cortesía de cumpleaños correspondiente al año ${currentYear}. Solo se permite 1 regalo por año.`;
                } else {
                  try {
                    const qCanjes = query(
                      collection(db, 'canjes_beneficios'),
                      where('clienteId', '==', foundClient.id),
                      where('anio', '==', currentYear)
                    );
                    const snapCanjes = await getDocs(qCanjes);
                    const alreadyRedeemed = snapCanjes.docs.some(dSnap => {
                      const d = dSnap.data();
                      return (
                        d.estado === 'canjeado' &&
                        (d.benefitId === 'regalo_cumpleanos' ||
                          d.folio?.includes('CUMPLE') ||
                          d.benefitTitle?.toLowerCase().includes('cumple'))
                      );
                    });
                    if (alreadyRedeemed) {
                      detectedBenefit.isBlocked = true;
                      detectedBenefit.blockReason = `⛔ BENEFICIO YA CANJEADO: Se encontró un canje de regalo de cumpleaños registrado para este año (${currentYear}).`;
                    } else {
                      detectedBenefit.isEligible = true;
                      detectedBenefit.birthdayNotice = `🎂 ¡Mes de Cumpleaños Confirmado! (${bdayResult.birthDateFormatted})`;
                    }
                  } catch (_) {
                    detectedBenefit.isEligible = true;
                    detectedBenefit.birthdayNotice = `🎂 ¡Mes de Cumpleaños Confirmado! (${bdayResult.birthDateFormatted})`;
                  }
                }
              }
            }
          }

          const isFreeCut =
            detectedBenefit.benefitId === 'decimo_corte' ||
            detectedBenefit.benefitId === 'corte_gratis' ||
            detectedBenefit.folio?.includes('CORTE') ||
            (detectedBenefit.benefitTitle || '').toLowerCase().includes('10') ||
            (detectedBenefit.benefitTitle || '').toLowerCase().includes('corte gratis');

          if (isFreeCut) {
            detectedBenefit.benefitId = 'decimo_corte';
            const requiredPaidStamps = Math.max(1, targetStamps - 1);

            if (!detectedBenefit.signature || !detectedBenefit.clientId) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ QR OFICIAL REQUERIDO: Para canjear el 10.° Corte Gratis, debes escanear el código QR oficial firmado desde la aplicación del cliente.';
            } else if (!foundClient) {
              detectedBenefit.isBlocked = true;
              detectedBenefit.blockReason =
                '⛔ CLIENTE NO ENCONTRADO: Este código QR no pertenece a ningún cliente registrado en el sistema oficial.';
            } else if (!detectedBenefit.isBlocked) {
              const currentStamps = Number(foundClient.cortes_acumulados || 0);
              const hasFreeCutFlag = Boolean((foundClient as any).corte_gratis_disponible);
              if (currentStamps < requiredPaidStamps && !hasFreeCutFlag) {
                detectedBenefit.isBlocked = true;
                detectedBenefit.blockReason = `⛔ SELLOS INSUFICIENTES: ${foundClient.nombre} lleva ${currentStamps} de ${requiredPaidStamps} sellos requeridos en su Pase Alfa. Aún no desbloquea su corte de cortesía.`;
              }
            }
          }
        }

        if (foundClient || detectedBenefit) {
          const isBlocked = Boolean(detectedBenefit?.isBlocked);
          playBeep(!isBlocked);
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

          if (isBlocked) {
            toast({
              variant: 'destructive',
              title: '⛔ Canje No Permitido',
              description: detectedBenefit?.blockReason || 'El beneficio no es válido.',
            });
          } else {
            toast({
              title: detectedBenefit ? '🎉 ¡Beneficio Alfa Identificado!' : '¡Cliente Identificado!',
              description: detectedBenefit
                ? `${detectedBenefit.benefitTitle} (${detectedBenefit.folio}) listo para validar.`
                : `${foundClient?.nombre} ${foundClient?.apellido || ''} escaneado con éxito.`,
            });
          }
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
    [isProcessing, stopCamera, toast, isScanningCompanion, scannedBenefit, scannedClient, juntosCompanions, beneficiosList]
  );

  const handleScanFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      setCameraError(null);

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        let scanner = scannerRef.current;
        let createdTemporary = false;

        if (!scanner) {
          const container = document.getElementById(scannerContainerId);
          if (container) {
            scanner = new Html5Qrcode(scannerContainerId, {
              formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
              verbose: false,
            });
            createdTemporary = true;
          }
        }

        if (!scanner) {
          throw new Error('No se pudo inicializar el lector de imagen.');
        }

        const decodedText = await scanner.scanFile(file, false);
        if (decodedText) {
          handleScanText(decodedText);
        }

        if (createdTemporary) {
          try {
            await scanner.clear();
          } catch (_) {}
        }
      } catch (err: any) {
        console.warn('Error decodificando QR desde archivo:', err);
        toast({
          variant: 'destructive',
          title: 'Código QR no detectado',
          description: 'No se detectó un código QR legible en la imagen. Intenta con una foto más nítida o escribe el código manualmente.',
        });
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [handleScanText, toast]
  );

  const startCamera = useCallback(async () => {
    if (!isOpen || (!isScanningCompanion && (scannedClient || scannedPromo || scannedBenefit)) || activeTab !== 'camera') return;
    setCameraError(null);

    // 1. Verificación de entorno seguro y disponibilidad de WebRTC
    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!window.isSecureContext && !isLocalhost) {
        setCameraError('El acceso a la cámara en vivo requiere HTTPS. Puedes escribir el código o subir una foto del QR.');
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Este navegador no soporta acceso directo a la cámara. Puedes tomar una foto o escribir el código.');
        return;
      }
    }

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      // Si ya hay un scanner activo, detenerlo limpiamente
      await stopCamera();

      // Esperar brevemente a que el modal y el contenedor estén montados en el DOM
      await new Promise(r => setTimeout(r, 200));

      const container = document.getElementById(scannerContainerId);
      if (!container) return;
      container.innerHTML = '';

      const html5QrCode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      // Intentar obtener lista de cámaras disponibles
      let devices: Array<{ id: string; label: string }> = [];
      try {
        const rawDevices = await Html5Qrcode.getCameras();
        if (rawDevices && rawDevices.length > 0) {
          devices = rawDevices.map(d => ({ id: d.id, label: d.label || `Cámara ${d.id}` }));
          setAvailableCameras(devices);
        }
      } catch (camListErr) {
        console.warn('Aviso: getCameras() falló o no tiene permiso previo:', camListErr);
      }

      // Configuración dinámica sin forzar aspectRatio 1.0 (evita OverconstrainedError en iOS Safari y móviles)
      const qrScanConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minEdge * 0.72);
          return { width: Math.max(size, 160), height: Math.max(size, 160) };
        },
      };

      // Candidatos de cámara en orden de preferencia
      const candidates: any[] = [];
      if (selectedCameraId) {
        candidates.push({ deviceId: { exact: selectedCameraId } });
        candidates.push(selectedCameraId);
      } else {
        // En móviles, buscar la cámara trasera por label
        const backCam = devices.find(d => /back|rear|trasera|environment|posterior/i.test(d.label));
        if (backCam) {
          candidates.push(backCam.id);
        }
        // Constraint estándar de cámara trasera
        candidates.push({ facingMode: 'environment' });
        // Si hay dispositivos y no era la trasera encontrada
        if (devices.length > 0 && (!backCam || backCam.id !== devices[0].id)) {
          candidates.push(devices[0].id);
        }
        // Fallback a cámara frontal / webcam
        candidates.push({ facingMode: 'user' });
      }

      let started = false;
      let lastError: any = null;

      for (const config of candidates) {
        try {
          await html5QrCode.start(
            config,
            qrScanConfig,
            decodedText => {
              handleScanText(decodedText);
            },
            _error => {
              // Frame continuo sin código detectado
            }
          );
          started = true;
          break;
        } catch (attemptErr: any) {
          lastError = attemptErr;
          console.warn('Intento de iniciar cámara con config falló:', config, attemptErr);
        }
      }

      if (!started) {
        throw lastError || new Error('No se pudo acceder a la cámara.');
      }
    } catch (err: any) {
      console.warn('Error iniciando cámara:', err);
      let msg = 'No se pudo acceder a la cámara.';
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission') || err?.message?.includes('denied')) {
        msg = 'Permiso denegado. Permite el acceso a la cámara en los ajustes de tu navegador o celular.';
      } else if (err?.name === 'NotFoundError' || err?.message?.includes('not found') || err?.name === 'DevicesNotFoundError') {
        msg = 'No se detectó ninguna cámara disponible en tu equipo.';
      } else if (err?.name === 'NotReadableError' || err?.message?.includes('in use') || err?.name === 'TrackStartError') {
        msg = 'La cámara está siendo usada por otra aplicación. Ciérrala y reintenta.';
      } else if (err?.name === 'OverconstrainedError') {
        msg = 'Tu cámara no soporta la resolución solicitada.';
      }
      setCameraError(msg);
    }
  }, [isOpen, isScanningCompanion, scannedClient, scannedPromo, scannedBenefit, activeTab, selectedCameraId, stopCamera, handleScanText]);

  // Manejar apertura y cierre del modal
  useEffect(() => {
    if (isOpen) {
      setScannedClient(null);
      setScannedPromo(null);
      setScannedBenefit(null);
      setTodayReservation(null);
      setJuntosOption(null);
      setJuntosMinorsCount(1);
      setJuntosCompanions([]);
      setIsScanningCompanion(false);
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
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      const nextTierInfo = evaluateClientAlfaTier(scannedClient, nivelesConfig, {
        extraVisits: 1,
        forceEvaluateWhenPaused: true,
      });

      await updateDoc(doc(db, 'clientes', scannedClient.id), {
        cortes_acumulados: increment(1),
        citas_asistidas: increment(1),
        visitas_totales: increment(1),
        ultima_visita_fecha: todayStr,
        corte_gratis_disponible: isFreeEligible,
        nivel: nextTierInfo.tierName,
        actualizado_en: serverTimestamp(),
      });

      playBeep(true);
      setScannedClient({
        ...scannedClient,
        cortes_acumulados: newStamps,
        citas_asistidas: nextTierInfo.visitasHistoricas,
        corte_gratis_disponible: isFreeEligible,
        nivel: nextTierInfo.tierName,
        ultima_visita_fecha: todayStr,
      } as any);

      toast({
        title: '¡Sello de Visita Registrado!',
        description: isFreeEligible
          ? `¡Felicidades! ${scannedClient.nombre} completó sus ${targetStamps} visitas y tiene su ${rewardName}.`
          : `Sello añadido con éxito. Ahora tiene ${newStamps} de ${targetStamps} sellos (${nextTierInfo.visitasHistoricas} visitas históricas).`,
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
    if (scannedBenefit.isBlocked) {
      toast({
        variant: 'destructive',
        title: '⛔ Canje No Permitido',
        description: scannedBenefit.blockReason || 'Este beneficio no cumple con los requisitos para ser canjeado.',
      });
      return;
    }
    setIsRedeemingBenefit(true);

    try {
      const folio = scannedBenefit.folio || `VA-BNF-${Date.now().toString().slice(-6)}`;
      const clientName = scannedClient ? `${scannedClient.nombre} ${scannedClient.apellido || ''}`.trim() : (scannedBenefit.clientName || 'Cliente Alfa');
      const clientPhone = scannedClient?.telefono || scannedBenefit.phone || '';
      const clientId = scannedClient?.id || scannedBenefit.clientId || '';
      const currentYear = new Date().getFullYear();
      const isBirthday =
        scannedBenefit.benefitId === 'regalo_cumpleanos' ||
        scannedBenefit.folio?.includes('CUMPLE') ||
        (scannedBenefit.benefitTitle || '').toLowerCase().includes('cumple');

      await setDoc(doc(db, 'canjes_beneficios', folio), {
        folio,
        benefitId: scannedBenefit.benefitId || 'beneficio_alfa',
        benefitTitle: scannedBenefit.benefitTitle || 'Beneficio Pase Alfa',
        clienteId: clientId,
        clienteNombre: clientName,
        telefono: clientPhone,
        estado: 'canjeado',
        anio: currentYear,
        canjeadoEn: serverTimestamp(),
        fechaCanje: serverTimestamp(),
        sucursal: 'Sombrerete',
        registradoPor: 'Recepción',
        ...(scannedBenefit.isReferralBenefit ? {
          isReferralBenefit: true,
          referralCode: scannedBenefit.referralCode || null,
          referrerId: scannedBenefit.referrerId || null,
          referrerName: scannedBenefit.referrerName || null,
          referrerPhone: scannedBenefit.referrerPhone || null,
          rewardCoins: 500,
        } : {}),
      }, { merge: true });

      // Si es beneficio de cumpleaños, registrar año en el perfil del cliente para evitar doble canje
      if (isBirthday && clientId) {
        await updateDoc(doc(db, 'clientes', clientId), {
          ultimo_canje_cumpleanos_anio: currentYear,
          fecha_ultimo_canje_cumpleanos: serverTimestamp(),
          actualizado_en: serverTimestamp(),
        });
        if (scannedClient) {
          (scannedClient as any).ultimo_canje_cumpleanos_anio = currentYear;
        }
      }

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

  // Acción: Aplicar "Juntos es Mejor" en modalidad Menores de Edad (Sin App) y abrir Caja
  const handleApplyJuntosMinors = () => {
    if (!scannedBenefit || !scannedClient || scannedBenefit.isBlocked) return;
    const safeMinors = Math.max(1, juntosMinorsCount);
    const totalParticipants = 1 + safeMinors;
    const totalCoins = JUNTOS_REWARD_COINS_PER_PERSON * totalParticipants;
    const minPurchaseAmount = currentHaircutPrice * totalParticipants;

    onOpenChange(false);
    document.dispatchEvent(
      new CustomEvent('new-sale', {
        detail: {
          client: scannedClient,
          benefitRedeemed: {
            ...scannedBenefit,
            isJuntosBenefit: true,
            benefitId: 'juntos_es_mejor',
            benefitTitle: 'JUNTOS ES MEJOR',
            juntosMode: 'minors',
            minorsCount: safeMinors,
            companionsWithApp: [],
            rewardCoins: totalCoins,
            minPurchase: minPurchaseAmount,
          },
          items: [],
        },
      })
    );
  };

  // Acción: Aplicar "Juntos es Mejor" en modalidad Acompañantes con App
  const handleApplyJuntosCompanions = async (separateTickets: boolean) => {
    if (!scannedBenefit || !scannedClient || scannedBenefit.isBlocked || !db) return;
    if (juntosCompanions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Escanea al acompañante',
        description: 'Primero debes escanear el código QR de al menos 1 acompañante con la aplicación.',
      });
      return;
    }

    setIsRedeemingBenefit(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const titularFullName = `${scannedClient.nombre} ${scannedClient.apellido || ''}`.trim();

      if (separateTickets) {
        // Guardar autorización de grupo pre-verificada para los acompañantes que pagarán en su propio ticket hoy
        await Promise.all(
          juntosCompanions.map(comp => {
            const docId = `VA-JUNTOS-GRP-${todayStr}-${comp.id}`;
            return setDoc(
              doc(db, 'canjes_beneficios', docId),
              {
                folio: comp.folio || docId,
                benefitId: 'juntos_es_mejor',
                benefitTitle: 'JUNTOS ES MEJOR',
                isJuntosBenefit: true,
                juntosMode: 'companions_separate_tickets',
                clienteId: comp.id,
                clienteNombre: comp.nombre,
                telefono: comp.telefono || '',
                grupoTitularId: scannedClient.id,
                grupoTitularNombre: titularFullName,
                fechaStr: todayStr,
                anio: new Date().getFullYear(),
                estado: 'pendiente_cobro_grupo',
                rewardCoins: JUNTOS_REWARD_COINS_PER_PERSON,
                creadoEn: serverTimestamp(),
                sucursal: 'Sombrerete',
              },
              { merge: true }
            );
          })
        );

        toast({
          title: '✓ Grupo Vinculado para Cobro Separado',
          description: `Pasa a cobrar a ${titularFullName}. Al cobrar después a ${juntosCompanions.map(c => c.nombre).join(', ')}, su promoción se aplicará en automático.`,
        });
      }

      const totalParticipantsInTicket = separateTickets ? 1 : 1 + juntosCompanions.length;

      onOpenChange(false);
      document.dispatchEvent(
        new CustomEvent('new-sale', {
          detail: {
            client: scannedClient,
            benefitRedeemed: {
              ...scannedBenefit,
              isJuntosBenefit: true,
              benefitId: 'juntos_es_mejor',
              benefitTitle: 'JUNTOS ES MEJOR',
              juntosMode: separateTickets ? 'companions_separate_tickets' : 'companions_single_ticket',
              minorsCount: 0,
              companionsWithApp: juntosCompanions,
              rewardCoins: JUNTOS_REWARD_COINS_PER_PERSON * totalParticipantsInTicket,
              minPurchase: currentHaircutPrice * totalParticipantsInTicket,
            },
            items: [],
          },
        })
      );
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al vincular acompañantes',
        description: err.message,
      });
    } finally {
      setIsRedeemingBenefit(false);
    }
  };

  // Acción: Volver a escanear otro cliente
  const handleResetScanner = () => {
    setScannedClient(null);
    setScannedPromo(null);
    setScannedBenefit(null);
    setTodayReservation(null);
    setJuntosOption(null);
    setJuntosMinorsCount(1);
    setJuntosCompanions([]);
    setIsScanningCompanion(false);
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

          <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
            {/* VISTA 1: RESULTADO DE CLIENTE O BENEFICIO ESCANEADO */}
            {!isScanningCompanion && (scannedClient || scannedBenefit) && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                {/* TARJETA DESTACADA DE BENEFICIO ESCANEADO */}
                {scannedBenefit && (
                  <div className="bg-gradient-to-r from-[#10172b] via-[#161E35] to-[#10172b] border-2 border-[#C5A880]/60 rounded-2xl p-4 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#C5A880]/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="flex items-start justify-between gap-3 relative z-10">
                      <div className="flex items-center gap-3">
                        <Gift className="h-6 w-6 text-[#C5A880] shrink-0" />
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
                          {scannedBenefit.descripcion && !scannedBenefit.isJuntosBenefit && (
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
                      ) : scannedBenefit.isBlocked ? (
                        <Badge className="bg-red-500/20 text-red-300 border-red-500/50 text-xs px-2.5 py-1">
                          <AlertCircle className="h-3.5 w-3.5 mr-1 text-red-400" />
                          Canje Bloqueado
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

                    {/* Alerta de Rechazo si el beneficio está bloqueado */}
                    {scannedBenefit.isBlocked && (
                      <div className="mt-3 p-3.5 rounded-xl bg-red-500/15 border-2 border-red-500/50 text-red-200 space-y-1 relative z-10">
                        <span className="font-bold text-red-400 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                          <AlertCircle className="h-4 w-4 shrink-0" /> Canje Denegado por el Sistema
                        </span>
                        <p className="text-xs text-red-100 font-medium leading-relaxed">
                          {scannedBenefit.blockReason}
                        </p>
                      </div>
                    )}

                    {/* Aviso de Cumpleaños Confirmado */}
                    {scannedBenefit.birthdayNotice && !scannedBenefit.isBlocked && (
                      <div className="mt-3 p-3 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-200 relative z-10 flex items-start gap-2.5">
                        <Sparkles className="h-4 w-4 text-[#C5A880] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-[#C5A880]">{scannedBenefit.birthdayNotice}</p>
                          <p className="text-[10px] text-gray-300">Cortesía de cumpleaños válida y autorizada para este año.</p>
                          {scannedClientTier.activo && scannedClientTier.birthdayBenefitText && (
                            <p className="text-[11px] font-bold text-white bg-[#C5A880]/20 border border-[#C5A880]/50 px-2 py-1 rounded-lg mt-1">
                              👑 Privilegio de su nivel ({scannedClientTier.tierName}): {scannedClientTier.birthdayBenefitText}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Aviso de Invitación de Amigo */}
                    {scannedBenefit.isReferralBenefit && !scannedBenefit.isBlocked && (
                      <div className="mt-3 p-3.5 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-200 relative z-10 flex items-start gap-2.5">
                        <Users className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-blue-300">
                            {scannedBenefit.referrerName
                              ? `Anfitrión Verificado: ${scannedBenefit.referrerName}${scannedBenefit.referralCode ? ` (${scannedBenefit.referralCode})` : ''}`
                              : 'Invitación Amigo Alfa'}
                          </p>
                          <p className="text-[11px] text-[#C5A880] font-semibold">
                            🎁 Amigo Invitado (Cliente Nuevo): 20% de Descuento automático en su primer servicio.
                          </p>
                          <p className="text-[10px] text-gray-300">
                            🪙 Recompensa al Anfitrión: Al cobrarse la primera compra ($160.00 MXN o más), su anfitrión recibirá 500 Alfa Coins en automático.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* PANEL INTERACTIVO RECEPCIÓN: JUNTOS ES MEJOR */}
                    {scannedBenefit.isJuntosBenefit && !scannedBenefit.isBlocked && (
                      <div className="mt-3.5 p-3.5 rounded-xl bg-[#0F172A]/95 border-2 border-blue-500 space-y-3 relative z-10">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-400 shrink-0" />
                            <span className="text-xs font-bold text-white">
                              ¿Con quién asiste {scannedClient?.nombre || 'el cliente'} hoy?
                            </span>
                          </div>
                          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px] font-semibold">
                            +{JUNTOS_REWARD_COINS_PER_PERSON} Coins c/u
                          </Badge>
                        </div>

                        {/* Dos opciones principales para Recepción */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setJuntosOption('minors')}
                            className={cn(
                              'p-3 rounded-xl border text-left transition-all flex flex-col gap-1',
                              juntosOption === 'minors'
                                ? 'bg-[#202A49] border-2 border-[#C5A880] shadow-md'
                                : 'bg-[#161E35] border-white/15 hover:border-blue-400/60'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <Users className="h-4 w-4 text-[#C5A880] shrink-0" />
                                Son menores de edad
                              </span>
                              {juntosOption === 'minors' && (
                                <CheckCircle2 className="h-4 w-4 text-[#C5A880] shrink-0" />
                              )}
                            </div>
                            <span className="text-[11px] text-slate-300 leading-tight">
                              Hijos sin celular. Los Alfa Coins de todos se suman a la cuenta del papá/mamá.
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setJuntosOption('companions_app')}
                            className={cn(
                              'p-3 rounded-xl border text-left transition-all flex flex-col gap-1',
                              juntosOption === 'companions_app'
                                ? 'bg-[#202A49] border-2 border-[#C5A880] shadow-md'
                                : 'bg-[#161E35] border-white/15 hover:border-blue-400/60'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <Smartphone className="h-4 w-4 text-blue-400 shrink-0" />
                                Cada uno tiene su App
                              </span>
                              {juntosOption === 'companions_app' && (
                                <CheckCircle2 className="h-4 w-4 text-[#C5A880] shrink-0" />
                              )}
                            </div>
                            <span className="text-[11px] text-slate-300 leading-tight">
                              Amigos o familiares con cuenta propia (+400 Alfa Coins en la app de cada uno).
                            </span>
                          </button>
                        </div>

                        {/* OPCIÓN 1: HIJOS MENORES DE EDAD (SIN LÍMITE) */}
                        {juntosOption === 'minors' && (
                          <div className="p-3 rounded-xl bg-[#161E35] border border-[#C5A880]/40 space-y-3 animate-in fade-in duration-150">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-bold text-white">
                                  ¿Cuántos hijos menores de edad asisten?
                                </p>
                                <p className="text-[11px] text-slate-300">
                                  Sin límite de menores (+{JUNTOS_REWARD_COINS_PER_PERSON} Alfa Coins por cada hijo)
                                </p>
                              </div>

                              <div className="flex items-center gap-2 bg-[#0F172A] px-2.5 py-1.5 rounded-lg border border-white/15">
                                <button
                                  type="button"
                                  onClick={() => setJuntosMinorsCount(prev => Math.max(1, prev - 1))}
                                  disabled={juntosMinorsCount <= 1}
                                  className="text-slate-300 hover:text-white disabled:opacity-30 p-1 transition-colors"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="text-sm font-bold text-white min-w-[24px] text-center font-sans">
                                  {juntosMinorsCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setJuntosMinorsCount(prev => prev + 1)}
                                  className="text-slate-300 hover:text-white p-1 transition-colors"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-[#0F172A]/80 border border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs">
                              <span className="text-slate-300">
                                Consumo mínimo ({1 + juntosMinorsCount} cortes × ${formatMoney(currentHaircutPrice)}):{' '}
                                <strong className="text-white font-semibold font-sans">
                                  ${formatMoney(currentHaircutPrice * (1 + juntosMinorsCount))}
                                </strong>
                              </span>
                              <span className="text-[#C5A880] font-bold font-sans">
                                Total a acreditar: +{JUNTOS_REWARD_COINS_PER_PERSON * (1 + juntosMinorsCount)} Alfa Coins
                              </span>
                            </div>

                            <Button
                              type="button"
                              onClick={handleApplyJuntosMinors}
                              className="w-full btn-vatos-alfa font-bold text-xs h-10 text-white"
                            >
                              <CreditCard className="h-4 w-4 mr-1.5" />
                              Aplicar con {juntosMinorsCount} {juntosMinorsCount === 1 ? 'Menor' : 'Menores'} y Pasar a Caja
                            </Button>
                          </div>
                        )}

                        {/* OPCIÓN 2: CADA UNO TIENE SU APLICACIÓN */}
                        {juntosOption === 'companions_app' && (
                          <div className="p-3 rounded-xl bg-[#161E35] border border-blue-500/40 space-y-3 animate-in fade-in duration-150">
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                                Participantes verificados en el grupo:
                              </p>
                              <div className="p-2 rounded-lg bg-[#0F172A] border border-white/10 flex items-center justify-between text-xs">
                                <span className="text-white font-semibold truncate">
                                  1. {scannedClient?.nombre} {scannedClient?.apellido || ''} (Titular)
                                </span>
                                <span className="text-[#C5A880] font-bold shrink-0 font-sans">
                                  +{JUNTOS_REWARD_COINS_PER_PERSON} Coins
                                </span>
                              </div>

                              {juntosCompanions.map((comp, idx) => (
                                <div
                                  key={comp.id}
                                  className="p-2 rounded-lg bg-[#0F172A] border border-blue-500/40 flex items-center justify-between text-xs"
                                >
                                  <span className="text-white font-semibold truncate">
                                    {idx + 2}. {comp.nombre} (Verificado ✓)
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[#C5A880] font-bold font-sans">
                                      +{JUNTOS_REWARD_COINS_PER_PERSON} Coins
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setJuntosCompanions(prev => prev.filter(c => c.id !== comp.id))
                                      }
                                      className="text-slate-400 hover:text-red-400 p-0.5"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setIsScanningCompanion(true);
                                setActiveTab('camera');
                                setTimeout(() => startCamera(), 150);
                              }}
                              className="w-full border-blue-500/50 text-blue-300 hover:bg-blue-500/15 text-xs font-semibold h-9"
                            >
                              <QrCode className="h-4 w-4 mr-1.5 text-blue-400" />
                              {juntosCompanions.length === 0
                                ? 'Escanear QR del Acompañante'
                                : 'Escanear otro acompañante con App'}
                            </Button>

                            {juntosCompanions.length > 0 && (
                              <div className="pt-2 border-t border-white/10 space-y-2">
                                <p className="text-[11px] text-slate-300 text-center">
                                  ¿Cómo realizarán su pago en recepción?
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <Button
                                    type="button"
                                    disabled={isRedeemingBenefit}
                                    onClick={() => handleApplyJuntosCompanions(false)}
                                    className="bg-[#C5A880] hover:bg-[#b0936b] text-black font-bold text-xs h-10"
                                  >
                                    <CreditCard className="h-4 w-4 mr-1.5" />
                                    1 Solo Ticket (${formatMoney(currentHaircutPrice * (1 + juntosCompanions.length))})
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isRedeemingBenefit}
                                    onClick={() => handleApplyJuntosCompanions(true)}
                                    className="border-[#C5A880]/50 text-[#C5A880] hover:bg-[#C5A880]/15 font-bold text-xs h-10"
                                  >
                                    <Users className="h-4 w-4 mr-1.5" />
                                    Tickets Separados (${formatMoney(currentHaircutPrice)} c/u)
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Términos y Condiciones Oficiales del Beneficio */}
                    {scannedBenefit.terminos && !scannedBenefit.isJuntosBenefit && (
                      <div className="mt-3 p-3 rounded-xl bg-black/40 border border-[#C5A880]/30 text-xs space-y-1 relative z-10">
                        <span className="font-semibold text-[#C5A880] flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                          <FileText className="h-3.5 w-3.5" /> Términos y Condiciones del Beneficio
                        </span>
                        <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line font-normal">
                          {scannedBenefit.terminos}
                        </p>
                      </div>
                    )}

                    {!scannedBenefit.isRedeemed && !scannedBenefit.isBlocked && !scannedBenefit.isJuntosBenefit && (
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

                    {scannedBenefit.isBlocked && (
                      <div className="mt-4 pt-3 border-t border-red-500/20 text-center relative z-10">
                        <p className="text-xs font-semibold text-red-300 bg-red-950/40 py-2 px-3 rounded-lg border border-red-500/30">
                          ⛔ Los botones de canje han sido bloqueados por las políticas de seguridad.
                        </p>
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
                          <span>{canViewPhone ? (scannedClient.telefono || 'Sin teléfono') : '••••-••••'}</span>
                          {scannedClient.correo && (
                            <>
                              <span>&bull;</span>
                              <span className="truncate">{scannedClient.correo}</span>
                            </>
                          )}
                        </div>

                        {/* Nivel / Tier y AlfaCoins */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {scannedClientTier.activo && (
                            <Badge
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5 border',
                                scannedClientTier.tierId === 'vip' || scannedClientTier.tierId === 'gold'
                                  ? 'bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/50'
                                  : 'bg-slate-700/50 text-slate-200 border-slate-600'
                              )}
                            >
                              {scannedClientTier.tierId === 'vip' ? (
                                <Crown className="h-3 w-3 mr-1 inline text-[#C5A880]" />
                              ) : (
                                <Award className="h-3 w-3 mr-1 inline text-[#C5A880]" />
                              )}
                              {scannedClientTier.tierName} ({scannedClientTier.cashbackPct}% Cashback)
                            </Badge>
                          )}

                          <Badge className="bg-[#C5A880]/10 border border-[#C5A880]/30 text-[#C5A880] text-[10px] font-bold px-2 py-0.5">
                            <Coins className="h-3 w-3 mr-1 inline text-[#C5A880]" />
                            {Number(scannedClient.alfaCoins ?? (scannedClient as any).alfa_coins ?? scannedClient.puntosLealtad ?? (scannedClient as any).puntos_lealtad ?? 0)} ALFA COINS
                          </Badge>

                          <span className="text-[10px] text-slate-300 bg-black/30 px-2 py-0.5 rounded border border-white/10 font-sans">
                            {scannedClientTier.visitasHistoricas} visitas &bull; ${formatMoney(scannedClientTier.consumoHistorico)} MXN
                          </span>

                          {scannedClient.appVinculada && (
                            <span className="text-[10px] text-blue-400 font-semibold flex items-center">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 mr-1 animate-pulse" />
                              App Vinculada
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Privilegios Activos del Nivel (cuando el programa de niveles está encendido) */}
                    {scannedClientTier.activo && scannedClientTier.beneficios.length > 0 && (
                      <div className="mt-3 p-3 rounded-xl bg-[#0F172A]/85 border border-[#C5A880]/35 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#C5A880] flex items-center gap-1.5">
                            <Crown className="h-3.5 w-3.5 text-[#C5A880]" />
                            Privilegios Activos • {scannedClientTier.tierName}
                          </span>
                          {scannedClientTier.productDiscountPct > 0 && (
                            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[9px] font-bold px-1.5 py-0">
                              <Percent className="h-2.5 w-2.5 mr-0.5 inline" />
                              {scannedClientTier.productDiscountPct}% Desc. en Productos (Automático en Caja)
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {scannedClientTier.beneficios.map((perk: string, idx: number) => (
                            <p key={idx} className="text-[11px] text-slate-200 leading-snug flex items-start gap-1.5">
                              <span className="text-[#C5A880] font-bold">✓</span>
                              <span>{perk}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

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
                    {/* Input oculto para tomar foto o subir archivo de QR */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleScanFile}
                    />

                    {/* Visor de Cámara */}
                    <div className="relative w-full aspect-square max-h-[320px] mx-auto rounded-2xl overflow-hidden bg-black border-2 border-[#C5A880]/40 shadow-inner flex items-center justify-center">
                      <div id={scannerContainerId} className="w-full h-full object-cover [&>video]:w-full [&>video]:h-full [&>video]:object-cover" />

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
                        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center space-y-2.5 z-20">
                          <AlertCircle className="h-8 w-8 text-red-400" />
                          <p className="text-xs text-gray-200 max-w-xs">{cameraError}</p>
                          <div className="flex flex-col sm:flex-row gap-2 mt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => startCamera()}
                              className="text-xs"
                            >
                              Reintentar Cámara
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-xs border-[#C5A880]/50 text-[#C5A880] hover:bg-[#C5A880]/20"
                            >
                              <Camera className="h-3.5 w-3.5 mr-1.5" />
                              Tomar Foto / Subir QR
                            </Button>
                          </div>
                        </div>
                      )}

                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center space-y-2 z-20">
                          <Loader2 className="h-8 w-8 text-[#C5A880] animate-spin" />
                          <p className="text-xs font-semibold text-white">Identificando cliente...</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones debajo del visor: selector de cámara o botón alternativo de foto */}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {availableCameras.length > 1 && (
                        <div className="flex items-center gap-1.5 bg-[#161E35] border border-white/10 rounded-lg px-2 py-1">
                          <Camera className="h-3.5 w-3.5 text-gray-400" />
                          <select
                            value={selectedCameraId || ''}
                            onChange={e => {
                              setSelectedCameraId(e.target.value);
                              setTimeout(() => startCamera(), 150);
                            }}
                            className="bg-transparent text-xs text-gray-300 focus:outline-none cursor-pointer"
                          >
                            {availableCameras.map(cam => (
                              <option key={cam.id} value={cam.id} className="bg-slate-900 text-white">
                                {cam.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 text-xs text-[#C5A880] hover:text-[#e4cfb4] hover:bg-[#C5A880]/10 rounded-lg gap-1.5 font-medium"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <span>Tomar foto o subir QR</span>
                      </Button>
                    </div>

                    <p className="text-[11px] text-center text-gray-400">
                      Pide al cliente que muestre el código QR de su tarjeta o cupón frente a la cámara.
                    </p>

                    {/* Barra rápida de ingreso de código o teléfono directo desde la vista de cámara */}
                    <div className="pt-2 border-t border-white/10">
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
                          value={manualInput}
                          onChange={e => setManualInput(e.target.value)}
                          placeholder="O escribe código (ej. ALFA-CARLOS-4567), tel o folio..."
                          className="bg-[#161E35] border-white/20 text-white placeholder:text-gray-400 text-xs sm:text-sm h-10"
                        />
                        <Button
                          type="submit"
                          disabled={!manualInput.trim() || isProcessing}
                          className="bg-[#C5A880] hover:bg-[#b0936b] text-black font-bold text-xs h-10 px-4 shrink-0 shadow-md"
                        >
                          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                        </Button>
                      </form>
                    </div>
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
