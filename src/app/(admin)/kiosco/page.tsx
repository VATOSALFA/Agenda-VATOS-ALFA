'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Award,
  Banknote,
  CalendarCheck,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Delete,
  HelpCircle,
  Lock,
  Loader2,
  MapPin,
  MessageSquare,
  QrCode,
  Scissors,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { db, functions, httpsCallable } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useToast } from '@/hooks/use-toast';
import { cn, formatMoney } from '@/lib/utils';
import { isClientWithApp } from '@/lib/client-app-helper';
import { validateAndConsumeAuthCode } from '@/lib/auth-code-validator';
import {
  calculateRealTimeBarberAvailability,
  cleanFirestoreObject,
  createSmartSaleRecord,
  escalateKioskHelpToCentral,
  finalizeSmartSaleLoyalty,
  getQrImageUrl,
  isAutomatedBranch,
  notifyClientCheckInInApp,
  notifyClientDigitalReceiptInApp,
  playSmartChime,
  resolveClientFromQrOrInput,
  revertPendingSmartTerminalSale,
  type BarberRealtimeAvailability,
  type SmartCartItem,
} from '@/lib/smart-branch';
import type {
  Client,
  Local,
  Profesional,
  Reservation,
  Service,
  ServiceCategory,
  TimeBlock,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type KioskStep =
  | 'home'
  | 'checkin_lookup'
  | 'checkin_select_res'
  | 'walkin_services'
  | 'walkin_barber'
  | 'walkin_client'
  | 'checkout'
  | 'waiting_terminal'
  | 'success';

const TIP_PRESETS = [0, 20, 30, 50];

function KioskContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { selectedLocalId, setSelectedLocalId } = useLocal();
  const { toast } = useToast();

  const urlLocalId = searchParams.get('local_id');

  // Consultas reactivas en tiempo real
  const { data: locales = [], loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: allProfessionals = [] } = useFirestoreQuery<Profesional>('profesionales');
  const { data: allServices = [] } = useFirestoreQuery<Service>('servicios');
  const { data: serviceCategories = [] } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
  const { data: clients = [] } = useFirestoreQuery<Client>('clientes');
  const { data: terminals = [] } = useFirestoreQuery<any>('terminales');

  const [activeLocalId, setActiveLocalId] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Estado del flujo del Kiosco
  const [step, setStep] = useState<KioskStep>('home');
  const [flowMode, setFlowMode] = useState<'checkin' | 'walkin'>('checkin');

  // Check-in states
  const [phoneDigits, setPhoneDigits] = useState('');
  const [matchingReservations, setMatchingReservations] = useState<Reservation[]>([]);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);

  // Walk-in states
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('todos');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [chosenBarberOption, setChosenBarberOption] = useState<'first_available' | string>('first_available');
  const [resolvedSlot, setResolvedSlot] = useState<BarberRealtimeAvailability | null>(null);

  // Client identification
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinFirstName, setWalkinFirstName] = useState('');
  const [walkinLastName, setWalkinLastName] = useState('');
  const [isLookingUpClient, setIsLookingUpClient] = useState(false);

  // Checkout & Point Smart Terminal states
  const [selectedTip, setSelectedTip] = useState<number>(0);
  const [customTipStr, setCustomTipStr] = useState<string>('');
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [pendingTerminalSaleId, setPendingTerminalSaleId] = useState<string | null>(null);
  const terminalUnsubRef = useRef<(() => void) | null>(null);

  // Success summary
  const [completionInfo, setCompletionInfo] = useState<{
    clientName: string;
    barberName: string;
    stationNumber?: string;
    horaInicio: string;
    waitMinutes: number;
    paidAtKiosk: boolean;
    totalAmount: number;
    tipAmount: number;
    stampsAdded: number;
    coinsEarned: number;
    hasApp: boolean;
  } | null>(null);

  // QR Camera Modal (para escanear Pase Alfa en Check-in o Walk-in)
  const [isQrScanOpen, setIsQrScanOpen] = useState(false);
  const [qrScanError, setQrScanError] = useState<string | null>(null);
  const html5QrRef = useRef<any>(null);

  // App Download & Help & Admin Exit Modals
  const [isAppPromoOpen, setIsAppPromoOpen] = useState(false);
  const [appLinks, setAppLinks] = useState<{ playStoreUrl: string; appStoreUrl: string }>({
    playStoreUrl: '',
    appStoreUrl: '',
  });
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpName, setHelpName] = useState('');
  const [helpPhone, setHelpPhone] = useState('');
  const [helpTopic, setHelpTopic] = useState('');
  const [isSendingHelp, setIsSendingHelp] = useState(false);

  const [isAdminExitOpen, setIsAdminExitOpen] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);

  // Datos en tiempo real del día actual para esta sucursal
  const [todayReservations, setTodayReservations] = useState<Reservation[]>([]);
  const [todayTimeBlocks, setTodayTimeBlocks] = useState<TimeBlock[]>([]);
  const [todaySpecialJourneys, setTodaySpecialJourneys] = useState<any[]>([]);

  // Reloj en vivo
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 15000);
    return () => clearInterval(interval);
  }, []);

  // Selección inicial de sucursal
  useEffect(() => {
    if (localesLoading || locales.length === 0) return;
    if (urlLocalId && locales.some((l) => l.id === urlLocalId)) {
      setActiveLocalId(urlLocalId);
      return;
    }
    if (activeLocalId && locales.some((l) => l.id === activeLocalId)) return;

    const smartBranch = locales.find((l) => l.modoOperacion === 'sin_recepcionista' && l.status === 'active');
    if (smartBranch) {
      setActiveLocalId(smartBranch.id);
    } else if (selectedLocalId && selectedLocalId !== 'todos') {
      setActiveLocalId(selectedLocalId);
    } else {
      setActiveLocalId(locales[0].id);
    }
  }, [locales, localesLoading, urlLocalId, activeLocalId, selectedLocalId]);

  const currentLocal = useMemo(
    () => locales.find((l) => l.id === activeLocalId) || null,
    [locales, activeLocalId]
  );

  // Cargar enlaces de descarga de App Móvil VATOS ALFA
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const appSnap = await getDoc(doc(db, 'configuracion', 'app_movil'));
        let play = appSnap.exists() ? appSnap.data()?.playStoreUrl || '' : '';
        let ios = appSnap.exists() ? appSnap.data()?.appStoreUrl || '' : '';
        if (!play && !ios) {
          const webSnap = await getDoc(doc(db, 'settings', 'website'));
          if (webSnap.exists()) {
            play = webSnap.data()?.playStoreUrl || '';
            ios = webSnap.data()?.appStoreUrl || '';
          }
        }
        if (mounted) {
          setAppLinks({ playStoreUrl: play, appStoreUrl: ios });
        }
      } catch {
        // Ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Suscripción en tiempo real a reservas, bloqueos y jornadas especiales de HOY
  const todayStr = useMemo(() => format(currentTime, 'yyyy-MM-dd'), [currentTime]);

  useEffect(() => {
    if (!activeLocalId) return;
    const qRes = query(collection(db, 'reservas'), where('fecha', '==', todayStr));
    const unsubRes = onSnapshot(qRes, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Reservation))
        .filter((r) => !r.local_id || r.local_id === activeLocalId);
      setTodayReservations(list);
    });

    const qBlocks = query(collection(db, 'bloqueos_horario'), where('fecha', '==', todayStr));
    const unsubBlocks = onSnapshot(qBlocks, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as TimeBlock))
        .filter((b) => !b.local_id || b.local_id === activeLocalId);
      setTodayTimeBlocks(list);
    });

    const qSpecial = query(collection(db, 'jornadas_especiales'), where('fecha', '==', todayStr));
    const unsubSpecial = onSnapshot(qSpecial, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((j: any) => !j.local_id || j.local_id === activeLocalId);
      setTodaySpecialJourneys(list);
    });

    return () => {
      unsubRes();
      unsubBlocks();
      unsubSpecial();
    };
  }, [activeLocalId, todayStr]);

  const branchProfessionals = useMemo(
    () =>
      allProfessionals
        .filter((p) => p.active && !p.deleted && p.local_id === activeLocalId)
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    [allProfessionals, activeLocalId]
  );

  const activeServices = useMemo(
    () =>
      allServices
        .filter((s) => s.active)
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    [allServices]
  );

  const selectedServicesList = useMemo(
    () => activeServices.filter((s) => selectedServiceIds.includes(s.id)),
    [activeServices, selectedServiceIds]
  );

  // Disponibilidad en tiempo real para los servicios seleccionados (o general en Home)
  const realtimeAvailability = useMemo(
    () =>
      calculateRealTimeBarberAvailability({
        barbers: branchProfessionals,
        local: currentLocal,
        selectedServices: selectedServicesList,
        todayReservations,
        todayTimeBlocks,
        specialJourneys: todaySpecialJourneys,
        now: currentTime,
      }),
    [
      branchProfessionals,
      currentLocal,
      selectedServicesList,
      todayReservations,
      todayTimeBlocks,
      todaySpecialJourneys,
      currentTime,
    ]
  );

  // Terminal activa del Kiosco
  const activeTerminalId = useMemo(() => {
    if (currentLocal?.kioscoTerminalId) return currentLocal.kioscoTerminalId;
    const pdv = terminals.find((t: any) => t.operating_mode === 'PDV') || terminals[0];
    return pdv?.id || '';
  }, [currentLocal, terminals]);

  const resetKioskToHome = useCallback(() => {
    if (terminalUnsubRef.current) {
      terminalUnsubRef.current();
      terminalUnsubRef.current = null;
    }
    setStep('home');
    setPhoneDigits('');
    setMatchingReservations([]);
    setActiveReservation(null);
    setSelectedCategoryId('todos');
    setSelectedServiceIds([]);
    setChosenBarberOption('first_available');
    setResolvedSlot(null);
    setActiveClient(null);
    setWalkinPhone('');
    setWalkinFirstName('');
    setWalkinLastName('');
    setSelectedTip(0);
    setCustomTipStr('');
    setShowCustomTip(false);
    setIsProcessingCheckout(false);
    setPendingTerminalSaleId(null);
    setCompletionInfo(null);
  }, []);

  // Auto-reset por inactividad (75s, excepto cuando se espera respuesta de la Terminal Point)
  useEffect(() => {
    if (step === 'home' || step === 'waiting_terminal') return;
    const timeoutMs = step === 'success' ? 18000 : 75000;
    const timer = setTimeout(() => {
      resetKioskToHome();
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [
    step,
    phoneDigits,
    selectedServiceIds,
    chosenBarberOption,
    walkinPhone,
    walkinFirstName,
    selectedTip,
    customTipStr,
    resetKioskToHome,
  ]);

  // Limpieza de cámara QR
  const stopQrScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        if (html5QrRef.current.isScanning) {
          await html5QrRef.current.stop();
        }
        await html5QrRef.current.clear();
      } catch {
        // Ignore
      }
      html5QrRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isQrScanOpen) {
      stopQrScanner();
      return;
    }

    let cancelled = false;
    setQrScanError(null);

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode('kiosco-qr-reader');
        html5QrRef.current = scanner;
        await scanner.start(
          { facingMode: 'user' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText: string) => {
            await stopQrScanner();
            setIsQrScanOpen(false);
            playSmartChime('tap');
            handleQrDecoded(decodedText);
          },
          () => {}
        );
      } catch {
        try {
          const { Html5Qrcode } = await import('html5-qrcode');
          if (cancelled) return;
          const scanner = new Html5Qrcode('kiosco-qr-reader');
          html5QrRef.current = scanner;
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            async (decodedText: string) => {
              await stopQrScanner();
              setIsQrScanOpen(false);
              playSmartChime('tap');
              handleQrDecoded(decodedText);
            },
            () => {}
          );
        } catch {
          if (!cancelled) {
            setQrScanError('No se pudo abrir la cámara. Puedes ingresar tu teléfono con el teclado.');
          }
        }
      }
    };

    const t = setTimeout(startScanner, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
      stopQrScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQrScanOpen]);

  // Procesar lectura de QR en Check-in o Walk-in
  const handleQrDecoded = async (decodedText: string) => {
    const res = await resolveClientFromQrOrInput({
      db,
      rawInput: decodedText,
      clientsCache: clients,
    });

    if (!res.client) {
      playSmartChime('alert');
      toast({
        variant: 'destructive',
        title: 'Código QR no reconocido',
        description: res.error || 'Intenta ingresando tu número telefónico.',
      });
      return;
    }

    if (flowMode === 'checkin') {
      findTodayReservationForClientOrPhone(res.client, res.parsedPhone || res.client.telefono);
    } else {
      setActiveClient(res.client);
      setWalkinPhone(String(res.client.telefono || '').replace(/\D/g, '').slice(-10));
      setWalkinFirstName(res.client.nombre || '');
      setWalkinLastName(res.client.apellido || '');
      toast({
        title: `¡Hola, ${res.client.nombre}!`,
        description: 'Tu Pase Alfa quedó vinculado a tu visita.',
      });
    }
  };

  // Buscar cita de HOY para Check-in
  const findTodayReservationForClientOrPhone = (matchedClient: Client | null, rawDigits: string) => {
    const cleanInput = rawDigits.replace(/\D/g, '');
    if (!matchedClient && cleanInput.length < 4) {
      toast({
        variant: 'destructive',
        title: 'Ingresa al menos 4 dígitos',
        description: 'Escribe los 10 dígitos de tu teléfono o los últimos 4 dígitos.',
      });
      return;
    }

    const candidates = todayReservations.filter((r) => {
      const st = String(r.estado || '').toLowerCase();
      if (st === 'cancelado' || st === 'cancelada' || st === 'no asiste' || st === 'asiste') {
        return false;
      }
      if (matchedClient && r.cliente_id === matchedClient.id) return true;

      const cObj = clients.find((c) => c.id === r.cliente_id) || r.customer;
      const cPhone = String(cObj?.telefono || '').replace(/\D/g, '');
      if (!cPhone) return false;
      if (cleanInput.length >= 10) {
        return cPhone.slice(-10) === cleanInput.slice(-10);
      }
      return cPhone.endsWith(cleanInput);
    });

    if (candidates.length === 0) {
      playSmartChime('alert');
      toast({
        variant: 'destructive',
        title: 'No encontramos una cita activa hoy',
        description: 'Verifica tu número o regístrate en "Vengo sin Cita" para asignarte lugar ahora mismo.',
      });
      return;
    }

    if (candidates.length === 1) {
      selectReservationForCheckIn(candidates[0]);
    } else {
      setMatchingReservations(candidates);
      setStep('checkin_select_res');
    }
  };

  const selectReservationForCheckIn = (res: Reservation) => {
    const foundClient =
      clients.find((c) => c.id === res.cliente_id) ||
      res.customer ||
      ({
        id: res.cliente_id || 'walkin',
        nombre: 'Cliente',
        apellido: '',
        correo: '',
        telefono: '',
        creado_en: Timestamp.now(),
      } as Client);

    setActiveReservation(res);
    setActiveClient(foundClient);
    setSelectedTip(0);
    setCustomTipStr('');
    setShowCustomTip(false);
    setStep('checkout');
  };

  // Cálculo del carrito y saldo a pagar en Checkout
  const checkoutSummary = useMemo(() => {
    if (flowMode === 'checkin' && activeReservation) {
      const rawItems = Array.isArray(activeReservation.items) && activeReservation.items.length > 0
        ? activeReservation.items.map((it: any) => ({
            id: it.id || 'srv',
            nombre: it.nombre || it.servicio || activeReservation.servicio || 'Servicio',
            precio: Number(it.precio ?? it.precio_unitario ?? activeReservation.precio ?? 0),
            cantidad: Number(it.cantidad || 1),
            tipo: (it.tipo || 'servicio') as 'servicio' | 'producto',
            barbero_id: it.barbero_id || activeReservation.barbero_id,
            duracion: Number(it.duracion || 30),
          }))
        : [
            {
              id: 'srv_reserva',
              nombre: activeReservation.servicio || 'Servicio Reservado',
              precio: Number(activeReservation.precio ?? activeReservation.total ?? 0),
              cantidad: 1,
              tipo: 'servicio' as const,
              barbero_id: activeReservation.barbero_id,
              duracion: 30,
            },
          ];

      const subtotal = rawItems.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
      const isDepositUnpaid =
        activeReservation.pago_estado === 'pendiente_anticipo' ||
        activeReservation.pago_estado === 'pending_payment' ||
        activeReservation.pago_estado === 'Pendiente' ||
        activeReservation.pago_estado === 'pendiente';

      const alreadyPaid = isDepositUnpaid
        ? 0
        : Number(
            activeReservation.monto_pagado_real ??
              activeReservation.monto_pagado ??
              activeReservation.anticipoPagado ??
              activeReservation.anticipo_pagado ??
              (activeReservation.pago_estado === 'Pagado' ? subtotal : 0)
          );

      const pendingBalance =
        activeReservation.pago_estado === 'Pagado'
          ? 0
          : Math.max(0, Math.round((subtotal - alreadyPaid) * 100) / 100);

      const barber = branchProfessionals.find((b) => b.id === activeReservation.barbero_id) || null;
      return {
        items: rawItems as SmartCartItem[],
        subtotal,
        alreadyPaid,
        pendingBalance,
        barber,
        horaInicio: activeReservation.hora_inicio,
        horaFin: activeReservation.hora_fin,
        waitMinutes: 0,
      };
    }

    // Walk-in
    const targetAvail = resolvedSlot || realtimeAvailability.firstAvailable;
    const barber = targetAvail?.barber || branchProfessionals[0] || null;
    const items: SmartCartItem[] = selectedServicesList.map((s) => ({
      id: s.id,
      nombre: s.name,
      precio: Number(s.price) || 0,
      cantidad: 1,
      tipo: 'servicio',
      barbero_id: barber?.id || '',
      duracion: Number(s.durationPorProfesional?.[barber?.id || ''] ?? s.duration) || 30,
    }));
    const subtotal = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

    return {
      items,
      subtotal,
      alreadyPaid: 0,
      pendingBalance: subtotal,
      barber,
      horaInicio: targetAvail?.earliestStartStr || format(currentTime, 'HH:mm'),
      horaFin: targetAvail?.estimatedEndStr || format(currentTime, 'HH:mm'),
      waitMinutes: targetAvail?.waitMinutes ?? 0,
    };
  }, [
    flowMode,
    activeReservation,
    branchProfessionals,
    resolvedSlot,
    realtimeAvailability.firstAvailable,
    selectedServicesList,
    currentTime,
  ]);

  const effectiveTipAmount = useMemo(() => {
    if (showCustomTip) {
      const parsed = parseFloat(customTipStr);
      return isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100;
    }
    return selectedTip;
  }, [showCustomTip, customTipStr, selectedTip]);

  // Asegurar que exista la reserva en Firestore (para Walk-ins se crea al confirmar check-in/pago)
  const ensureReservationCreatedForCheckout = async (paidUpfront: boolean): Promise<string> => {
    if (flowMode === 'checkin' && activeReservation) {
      return activeReservation.id;
    }
    if (!currentLocal || !activeClient || !checkoutSummary.barber) {
      throw new Error('Faltan datos del cliente o barbero para registrar tu turno.');
    }

    const resItems = checkoutSummary.items.map((it) => ({
      id: it.id,
      nombre: it.nombre,
      servicio: it.nombre,
      tipo: it.tipo,
      barbero_id: checkoutSummary.barber!.id,
      precio: it.precio,
      subtotal: it.precio * it.cantidad,
      duracion: it.duracion || 30,
      cantidad: it.cantidad,
      pagado_en_kiosco: paidUpfront,
      bloqueado_kiosco: true,
    }));

    const newResPayload = cleanFirestoreObject({
      cliente_id: activeClient.id,
      barbero_id: checkoutSummary.barber.id,
      local_id: currentLocal.id,
      fecha: todayStr,
      hora_inicio: checkoutSummary.horaInicio,
      hora_fin: checkoutSummary.horaFin,
      servicio: resItems.map((i) => i.nombre).join(', '),
      items: resItems,
      precio: checkoutSummary.subtotal,
      total: checkoutSummary.subtotal,
      saldo_pendiente: paidUpfront ? 0 : checkoutSummary.subtotal,
      pago_estado: paidUpfront ? 'Pagado' : 'Pendiente',
      estado: 'En espera',
      checkin_en: serverTimestamp(),
      origen: 'kiosco',
      origen_registro: 'kiosco',
      canal: 'kiosco',
      canal_reserva: 'kiosco_sucursal',
      creado_en: Timestamp.now(),
      creado_por: 'Kiosco Sucursal',
      whatsappConfirmationSent: true,
      whatsappReminderSent: true,
      whatsappReminderNotNeeded: true,
      servicios_bloqueados_kiosco: resItems.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        cantidad: i.cantidad,
      })),
    });

    const docRef = await addDoc(collection(db, 'reservas'), newResPayload);
    setActiveReservation({ id: docRef.id, ...(newResPayload as any) });
    return docRef.id;
  };

  // Opción 1: Pagar AHORA en Kiosco con Terminal Point Smart
  const handlePayAtKioskWithTerminal = async () => {
    if (!currentLocal || !activeClient || !checkoutSummary.barber) return;
    if (!activeTerminalId) {
      toast({
        variant: 'destructive',
        title: 'Terminal no vinculada',
        description: 'Selecciona "Pagar en estación con mi barbero" mientras se conecta la terminal.',
      });
      return;
    }

    setIsProcessingCheckout(true);
    try {
      const resId = await ensureReservationCreatedForCheckout(false);
      const amountToCharge = Math.round((checkoutSummary.pendingBalance + effectiveTipAmount) * 100) / 100;

      const { saleId } = await createSmartSaleRecord({
        db,
        local: currentLocal,
        client: activeClient,
        cartItems: checkoutSummary.items,
        paymentMethod: 'mercadopago',
        pagoEstadoInitial: 'Pendiente',
        origin: 'kiosco',
        tipAmount: effectiveTipAmount,
        tipMethod: 'mercadopago',
        anticipoPagado: checkoutSummary.alreadyPaid,
        reservationId: resId,
        staffUserId: user?.uid || 'kiosco',
        staffUserName: `Kiosco ${currentLocal.name}`,
        allServices: activeServices,
      });

      setPendingTerminalSaleId(saleId);
      setStep('waiting_terminal');

      const createPayment = httpsCallable(functions, 'createPointPayment');
      const result: any = await createPayment({
        amount: amountToCharge,
        terminalId: activeTerminalId,
        referenceId: saleId,
        payer: {
          email: activeClient.correo || 'cliente@vatosalfa.com',
          name: `${activeClient.nombre} ${activeClient.apellido || ''}`.trim(),
        },
      });

      if (!result?.data?.success) {
        throw new Error(result?.data?.message || 'No se pudo enviar el cobro a la terminal.');
      }

      // Escuchar confirmación en tiempo real del pago en la terminal
      if (terminalUnsubRef.current) terminalUnsubRef.current();
      let finalized = false;

      const unsub = onSnapshot(doc(db, 'ventas', saleId), async (snap) => {
        if (finalized || !snap.exists()) return;
        const data = snap.data();
        if (data && (data.pago_estado === 'Pagado' || data.mercado_pago_status === 'approved')) {
          finalized = true;
          if (terminalUnsubRef.current) {
            terminalUnsubRef.current();
            terminalUnsubRef.current = null;
          }
          setPendingTerminalSaleId(null);

          await updateDoc(doc(db, 'ventas', saleId), {
            pago_estado: 'Pagado',
            saldo_pendiente: 0,
            monto_pagado_real: checkoutSummary.pendingBalance,
          }).catch(() => {});

          const lockedItems = checkoutSummary.items.map((it) => ({
            id: it.id,
            nombre: it.nombre,
            servicio: it.nombre,
            tipo: it.tipo,
            barbero_id: checkoutSummary.barber!.id,
            precio: it.precio,
            subtotal: it.precio * it.cantidad,
            duracion: it.duracion || 30,
            cantidad: it.cantidad,
            pagado_en_kiosco: true,
            bloqueado_kiosco: true,
          }));

          await updateDoc(
            doc(db, 'reservas', resId),
            cleanFirestoreObject({
              estado: 'En espera',
              checkin_en: serverTimestamp(),
              pago_estado: 'Pagado',
              monto_pagado: checkoutSummary.subtotal,
              monto_pagado_real: checkoutSummary.subtotal,
              saldo_pendiente: 0,
              kiosco_venta_id: saleId,
              items: lockedItems,
              precio: checkoutSummary.subtotal,
              total: checkoutSummary.subtotal,
              servicios_bloqueados_kiosco: lockedItems.map((i) => ({
                id: i.id,
                nombre: i.nombre,
                precio: i.precio,
                cantidad: i.cantidad,
              })),
            })
          ).catch(() => {});

          const loyaltyRes = await finalizeSmartSaleLoyalty({
            db,
            client: activeClient,
            cartItems: checkoutSummary.items,
            saleTotal: checkoutSummary.pendingBalance,
            anticipoPagado: checkoutSummary.alreadyPaid,
            saleId,
            allServices: activeServices,
          });

          const bName = checkoutSummary.barber?.publicName || checkoutSummary.barber?.name || 'tu barbero';

          await notifyClientCheckInInApp({
            db,
            client: activeClient,
            localName: currentLocal.name,
            barberName: bName,
            stationNumber: checkoutSummary.barber?.numeroEstacion,
            paidAtKiosk: true,
            totalAmount: checkoutSummary.subtotal,
            reservationId: resId,
          });

          await notifyClientDigitalReceiptInApp({
            db,
            client: activeClient,
            localName: currentLocal.name,
            barberName: bName,
            items: checkoutSummary.items.map((i) => ({
              nombre: i.nombre,
              cantidad: i.cantidad,
              subtotal: i.precio * i.cantidad,
            })),
            totalPaid: checkoutSummary.subtotal,
            tipAmount: effectiveTipAmount,
            paymentMethodLabel: 'Tarjeta en Kiosco (Point Smart)',
            stampsAdded: loyaltyRes.stampsAdded,
            currentStamps: loyaltyRes.currentStamps,
            targetStamps: loyaltyRes.targetStamps,
            coinsEarned: loyaltyRes.coinsEarned,
            saleId,
            reservationId: resId,
          });

          playSmartChime('payment_ok');
          setIsProcessingCheckout(false);
          setCompletionInfo({
            clientName: activeClient.nombre,
            barberName: bName,
            stationNumber: checkoutSummary.barber?.numeroEstacion,
            horaInicio: checkoutSummary.horaInicio,
            waitMinutes: checkoutSummary.waitMinutes,
            paidAtKiosk: true,
            totalAmount: checkoutSummary.subtotal,
            tipAmount: effectiveTipAmount,
            stampsAdded: loyaltyRes.stampsAdded,
            coinsEarned: loyaltyRes.coinsEarned,
            hasApp: isClientWithApp(activeClient),
          });
          setStep('success');
        }
      });

      terminalUnsubRef.current = unsub;
    } catch (err: any) {
      console.error('Error cobrando en Kiosco:', err);
      if (pendingTerminalSaleId) {
        await revertPendingSmartTerminalSale(db, pendingTerminalSaleId);
        setPendingTerminalSaleId(null);
      }
      setIsProcessingCheckout(false);
      setStep('checkout');
      playSmartChime('alert');
      toast({
        variant: 'destructive',
        title: 'No se pudo iniciar la terminal',
        description: err?.message || 'Puedes reintentar o elegir pagar al terminar en la estación.',
      });
    }
  };

  const handleCancelWaitingTerminal = async () => {
    if (terminalUnsubRef.current) {
      terminalUnsubRef.current();
      terminalUnsubRef.current = null;
    }
    if (pendingTerminalSaleId) {
      await revertPendingSmartTerminalSale(db, pendingTerminalSaleId);
      setPendingTerminalSaleId(null);
    }
    setIsProcessingCheckout(false);
    setStep('checkout');
  };

  // Opción 2: Confirmar Check-in si ya estaba pagada en línea, o diferir pago en efectivo a la estación
  const handleCheckInPayAtStationOrPrepaid = async () => {
    if (!currentLocal || !activeClient || !checkoutSummary.barber) return;
    setIsProcessingCheckout(true);
    try {
      const isAlreadyPaid = checkoutSummary.pendingBalance <= 0;
      const resId = await ensureReservationCreatedForCheckout(isAlreadyPaid);

      const lockedItems = checkoutSummary.items.map((it) => ({
        id: it.id,
        nombre: it.nombre,
        servicio: it.nombre,
        tipo: it.tipo,
        barbero_id: checkoutSummary.barber!.id,
        precio: it.precio,
        subtotal: it.precio * it.cantidad,
        duracion: it.duracion || 30,
        cantidad: it.cantidad,
        pagado_en_kiosco: isAlreadyPaid,
        bloqueado_kiosco: true,
      }));

      await updateDoc(
        doc(db, 'reservas', resId),
        cleanFirestoreObject({
          estado: 'En espera',
          checkin_en: serverTimestamp(),
          servicios_bloqueados_kiosco: lockedItems.map((i) => ({
            id: i.id,
            nombre: i.nombre,
            precio: i.precio,
            cantidad: i.cantidad,
          })),
        })
      );

      const bName = checkoutSummary.barber.publicName || checkoutSummary.barber.name;
      await notifyClientCheckInInApp({
        db,
        client: activeClient,
        localName: currentLocal.name,
        barberName: bName,
        stationNumber: checkoutSummary.barber.numeroEstacion,
        paidAtKiosk: isAlreadyPaid,
        totalAmount: checkoutSummary.subtotal,
        reservationId: resId,
      });

      playSmartChime('checkin');
      setCompletionInfo({
        clientName: activeClient.nombre,
        barberName: bName,
        stationNumber: checkoutSummary.barber.numeroEstacion,
        horaInicio: checkoutSummary.horaInicio,
        waitMinutes: checkoutSummary.waitMinutes,
        paidAtKiosk: isAlreadyPaid,
        totalAmount: checkoutSummary.subtotal,
        tipAmount: 0,
        stampsAdded: 0,
        coinsEarned: 0,
        hasApp: isClientWithApp(activeClient),
      });
      setStep('success');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al registrar tu llegada',
        description: err?.message || 'Intenta nuevamente.',
      });
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // Auto-buscar cliente existente cuando escribe 10 dígitos en Walk-in
  useEffect(() => {
    const clean = walkinPhone.replace(/\D/g, '');
    if (clean.length !== 10 || step !== 'walkin_client') return;

    let cancelled = false;
    setIsLookingUpClient(true);
    resolveClientFromQrOrInput({ db, rawInput: clean, clientsCache: clients })
      .then((res) => {
        if (cancelled) return;
        if (res.client) {
          setActiveClient(res.client);
          setWalkinFirstName(res.client.nombre || '');
          setWalkinLastName(res.client.apellido || '');
        } else {
          setActiveClient(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLookingUpClient(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walkinPhone, step, clients]);

  const handleContinueWalkinClient = async () => {
    const cleanPhone = walkinPhone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) {
      toast({
        variant: 'destructive',
        title: 'Teléfono de 10 dígitos requerido',
        description: 'Ingrésalo para enviarte tu comprobante digital y acumular beneficios en la App.',
      });
      return;
    }

    if (activeClient) {
      setStep('checkout');
      return;
    }

    if (!walkinFirstName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Escribe tu nombre',
        description: 'Así tu barbero podrá llamarte por tu nombre al pasar al sillón.',
      });
      return;
    }

    setIsLookingUpClient(true);
    try {
      const newClientData = {
        nombre: walkinFirstName.trim(),
        apellido: walkinLastName.trim(),
        telefono: cleanPhone,
        correo: '',
        origen: 'kiosco',
        creado_en: Timestamp.now(),
        citas_totales: 1,
        citas_asistidas: 0,
        gasto_total: 0,
        cortes_acumulados: 0,
        alfaCoins: 0,
      };
      const docRef = await addDoc(collection(db, 'clientes'), newClientData);
      setActiveClient({ id: docRef.id, ...newClientData } as Client);
      setStep('checkout');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'No se pudo registrar tus datos',
        description: err?.message || 'Intenta nuevamente.',
      });
    } finally {
      setIsLookingUpClient(false);
    }
  };

  const handleSendHelpRequest = async () => {
    if (!currentLocal) return;
    if (!helpTopic.trim()) {
      toast({ variant: 'destructive', title: 'Cuéntanos brevemente cómo ayudarte' });
      return;
    }
    setIsSendingHelp(true);
    try {
      await escalateKioskHelpToCentral({
        db,
        localId: currentLocal.id,
        localName: currentLocal.name,
        visitorName: helpName.trim() || activeClient?.nombre || 'Cliente en Kiosco',
        visitorPhone: helpPhone.trim() || activeClient?.telefono || '',
        topic: helpTopic.trim(),
      });
      toast({
        title: 'Solicitud enviada a Central',
        description: 'Nuestro equipo remoto ya recibió tu aviso.',
      });
      setHelpTopic('');
      setIsHelpOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo enviar el aviso' });
    } finally {
      setIsSendingHelp(false);
    }
  };

  const handleVerifyAdminExit = async () => {
    setIsVerifyingAdmin(true);
    try {
      const res = await validateAndConsumeAuthCode({
        db,
        code: adminCode,
        requiredPermission: 'any',
        userId: user?.uid || 'kiosco',
        userName: user?.displayName || 'Admin Kiosco',
        userRole: user?.role,
        localId: activeLocalId,
        operationDescription: 'Salir de pantalla bloqueada de Kiosco',
        moduleLabel: 'Kiosco Sin Recepcionista',
      });
      if (!res.valid) {
        toast({
          variant: 'destructive',
          title: 'Código inválido',
          description: res.error || 'Ingresa un código de autorización activo.',
        });
        return;
      }
      setAdminCode('');
      setIsAdminExitOpen(false);
      router.push('/settings/locales');
    } finally {
      setIsVerifyingAdmin(false);
    }
  };

  // Guardia de aislamiento: Si la sucursal NO tiene activado el interruptor "sin_recepcionista",
  // bloquea limpiamente el Kiosco sin afectar en absoluto la operación tradicional.
  if (!localesLoading && currentLocal && !isAutomatedBranch(currentLocal)) {
    const smartLocals = locales.filter((l) => isAutomatedBranch(l));
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#070D1B] via-[#0E182E] to-[#070D1B] text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border-2 border-blue-500 bg-[#10172b] shadow-2xl overflow-hidden">
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-5 border-b border-slate-800">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-3">
              <Lock className="h-5 w-5 text-blue-400 shrink-0" />
              <div>
                <h1 className="text-base font-bold text-white">Modo Kiosco Desactivado en {currentLocal.name}</h1>
                <p className="text-xs text-slate-300">
                  Esta sucursal opera en modo tradicional con recepcionista.
                </p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              El sistema Sin Recepcionista está aislado para no alterar tus sucursales actuales. Puedes activarlo en{' '}
              <strong className="text-white">Configuración → Locales</strong> únicamente para la sucursal automatizada.
            </p>
            {smartLocals.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">
                  Cambiar a sucursal automatizada activa:
                </span>
                <div className="grid gap-2">
                  {smartLocals.map((sl) => (
                    <Button
                      key={sl.id}
                      variant="outline"
                      onClick={() => {
                        setActiveLocalId(sl.id);
                        setSelectedLocalId(sl.id);
                      }}
                      className="justify-between border-blue-500/40 bg-[#151f38] text-white hover:bg-blue-500/15 text-xs h-10"
                    >
                      <span className="flex items-center gap-2">
                        <Tablet className="h-4 w-4 text-blue-400" />
                        {sl.name}
                      </span>
                      <span className="text-blue-400 font-semibold">Abrir Kiosco →</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="alfa" size="sm" onClick={() => router.push('/settings/locales')} className="h-9 px-4 text-xs font-semibold">
                Ir a Configuración de Locales
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const availableRightNowCount = realtimeAvailability.availabilities.filter(
    (a) => a.worksToday && a.canFitBeforeClosing && a.waitMinutes <= 5
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070D1B] via-[#0B1426] to-[#060B16] text-white flex flex-col select-none">
      {/* BARRA SUPERIOR INSTITUCIONAL DEL KIOSCO */}
      <header className="relative overflow-hidden bg-gradient-to-r from-[#0d1426] via-[#17223d] to-[#0d1426] border-b border-slate-800/90 px-4 sm:px-7 py-3.5 shrink-0">
        <div className="header-light-beam absolute inset-0 pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between gap-4 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Scissors className="h-6 w-6 text-[#C5A880] shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base sm:text-lg font-black tracking-wider text-white">
                  VATOS ALFA
                </span>
                {currentLocal && (
                  <Badge
                    variant="outline"
                    className="border-blue-500/40 bg-blue-500/10 text-blue-300 text-[11px] font-sans font-semibold px-2.5 py-0"
                  >
                    <MapPin className="h-3 w-3 text-blue-400 mr-1" />
                    {currentLocal.name}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-slate-300 hidden sm:block">
                Recepción Inteligente • Tu corte sin filas y conectado con la App VATOS ALFA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAppPromoOpen(true)}
              className="h-9 px-3 rounded-xl border-[#C5A880]/45 bg-[#151e34] hover:bg-[#1c2845] text-[#C5A880] text-xs font-semibold gap-1.5"
            >
              <Smartphone className="h-4 w-4 text-[#C5A880]" />
              <span className="hidden md:inline">Descargar App VATOS ALFA</span>
              <span className="md:hidden">App QR</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsHelpOpen(true)}
              className="h-9 px-3 rounded-xl border-slate-700 bg-[#131b30] hover:bg-white/10 text-slate-200 text-xs font-medium gap-1.5"
            >
              <HelpCircle className="h-4 w-4 text-slate-400" />
              <span>Ayuda</span>
            </Button>

            <div className="text-right pl-2 border-l border-slate-800">
              <span className="text-sm sm:text-base font-bold text-white font-sans block leading-none">
                {format(currentTime, 'HH:mm')}
              </span>
              <span className="text-[10px] text-slate-400 capitalize font-sans">
                {format(currentTime, 'EEE d MMM', { locale: es })}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsAdminExitOpen(true)}
              className="h-8 w-8 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              title="Administración de Kiosco"
            >
              <Lock className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO CENTRAL DEL KIOSCO */}
      <main className="flex-1 flex flex-col max-w-6xl w-full mx-auto p-4 sm:p-6 md:p-8 overflow-y-auto scrollbar-thin">
        {/* ==================== PANTALLA 1: BIENVENIDA (HOME) ==================== */}
        {step === 'home' && (
          <div className="flex-1 flex flex-col justify-between gap-6 my-auto">
            <div className="text-center space-y-2 pt-2">
              <Badge
                variant="outline"
                className="border-blue-500/40 bg-blue-500/10 text-blue-300 text-xs font-sans font-semibold px-3 py-1"
              >
                <Sparkles className="h-3.5 w-3.5 text-blue-400 mr-1.5" />
                {availableRightNowCount > 0
                  ? `${availableRightNowCount} ${availableRightNowCount === 1 ? 'barbero disponible' : 'barberos disponibles'} en este momento`
                  : 'Recepción digital activa — consulta tiempos en vivo'}
              </Badge>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
                ¡Bienvenido! ¿Cómo te atendemos hoy?
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
                Toca una opción en pantalla para anunciar tu llegada o tomar turno al instante.
              </p>
            </div>

            {/* 2 TARJETAS GIGANTES PRINCIPALES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {/* OPCIÓN A: TENGO CITA */}
              <button
                type="button"
                onClick={() => {
                  playSmartChime('tap');
                  setFlowMode('checkin');
                  setPhoneDigits('');
                  setStep('checkin_lookup');
                }}
                className="group text-left rounded-2xl border-2 border-blue-500 bg-gradient-to-b from-[#131f3a] to-[#0d1528] hover:from-[#182749] hover:to-[#101a32] p-6 sm:p-8 shadow-[0_12px_35px_rgba(59,130,246,0.2)] transition-all active:scale-[0.99] flex flex-col justify-between min-h-[230px]"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <CalendarCheck className="h-9 w-9 text-blue-400 shrink-0" />
                    <Badge
                      variant="outline"
                      className="border-blue-400/40 bg-blue-500/15 text-blue-200 text-xs font-sans font-semibold px-2.5 py-0.5"
                    >
                      Check-in en 5 seg
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Tengo Cita
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Escanea el código QR de tu <strong className="text-white">App VATOS ALFA</strong> o ingresa tu teléfono para avisarle a tu barbero que ya llegaste.
                    </p>
                  </div>
                </div>
                <div className="pt-5 mt-5 border-t border-slate-800 flex items-center justify-between text-xs sm:text-sm font-bold text-blue-300 group-hover:text-white transition-colors">
                  <span className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-blue-400" />
                    Con QR Pase Alfa o Teléfono
                  </span>
                  <span>Anunciar llegada →</span>
                </div>
              </button>

              {/* OPCIÓN B: VENGO SIN CITA */}
              <button
                type="button"
                onClick={() => {
                  playSmartChime('tap');
                  setFlowMode('walkin');
                  setSelectedServiceIds([]);
                  setChosenBarberOption('first_available');
                  setStep('walkin_services');
                }}
                className="group text-left rounded-2xl border-2 border-slate-700 hover:border-blue-500 bg-gradient-to-b from-[#11192e] to-[#0b1120] hover:from-[#15203b] hover:to-[#0e1629] p-6 sm:p-8 shadow-xl transition-all active:scale-[0.99] flex flex-col justify-between min-h-[230px]"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Zap className="h-9 w-9 text-[#C5A880] shrink-0" />
                    <Badge
                      variant="outline"
                      className="border-[#C5A880]/40 bg-[#C5A880]/10 text-[#C5A880] text-xs font-sans font-semibold px-2.5 py-0.5"
                    >
                      Turno inmediato
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Vengo sin Cita
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      Elige tu servicio y pasa con el <strong className="text-white">primer barbero disponible</strong> o selecciona a tu barbero favorito viendo su espera real.
                    </p>
                  </div>
                </div>
                <div className="pt-5 mt-5 border-t border-slate-800 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-200 group-hover:text-blue-300 transition-colors">
                  <span className="flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-slate-400" />
                    Ver servicios y tiempos en vivo
                  </span>
                  <span>Tomar lugar →</span>
                </div>
              </button>
            </div>

            {/* DISPONIBILIDAD EN VIVO DE ESTACIONES + BANNER ECOSISTEMA APP */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#0e1629]/90 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    Estado en Vivo de Estaciones
                  </span>
                  <span className="text-[11px] text-slate-400 font-sans">
                    Actualizado en tiempo real
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {realtimeAvailability.availabilities
                    .filter((a) => a.worksToday)
                    .map((av) => (
                      <div
                        key={av.barber.id}
                        className="rounded-xl border border-slate-800 bg-[#131d35] p-2.5 flex items-center gap-2.5"
                      >
                        <Avatar className="h-9 w-9 border border-slate-700 shrink-0">
                          <AvatarImage src={av.barber.avatarUrl} alt={av.barber.name} />
                          <AvatarFallback className="bg-[#202A49] text-white text-xs font-bold">
                            {(av.barber.publicName || av.barber.name || 'B').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white truncate">
                              {av.barber.publicName || av.barber.name}
                            </span>
                            {av.barber.numeroEstacion && (
                              <span className="text-[10px] text-slate-400 font-sans shrink-0">
                                • Est. {av.barber.numeroEstacion}
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              'text-[11px] font-medium font-sans block truncate',
                              av.waitMinutes <= 5 ? 'text-blue-400' : 'text-slate-400'
                            )}
                          >
                            {av.statusLabel}
                          </span>
                        </div>
                      </div>
                    ))}
                  {realtimeAvailability.availabilities.filter((a) => a.worksToday).length === 0 && (
                    <p className="text-xs text-slate-400 col-span-full py-2">
                      No hay estaciones con turno activo en este horario.
                    </p>
                  )}
                </div>
              </div>

              {/* BANNER ECOSISTEMA APP MÓVIL + CHAT CON JANETH */}
              <div
                onClick={() => setIsAppPromoOpen(true)}
                className="cursor-pointer rounded-2xl border border-[#C5A880]/40 bg-gradient-to-br from-[#141d35] to-[#0d1424] p-4 flex flex-col justify-between gap-3 hover:border-[#C5A880] transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#C5A880] flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-[#C5A880]" />
                      ECOSISTEMA APP VATOS ALFA
                    </span>
                    <QrCode className="h-4 w-4 text-[#C5A880]" />
                  </div>
                  <p className="text-xs font-semibold text-white leading-snug">
                    Sin WhatsApp: habla con Janeth en la App, gana AlfaCoins y tu 10.° corte va por la casa.
                  </p>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    Recibe tus comprobantes digitales al instante y agenda en segundos.
                  </p>
                </div>
                <span className="text-xs font-bold text-[#C5A880] flex items-center justify-between pt-2 border-t border-slate-800">
                  <span>Ver códigos QR de descarga</span>
                  <span>→</span>
                </span>
              </div>
            </div>

            {/* Aviso de seguridad de ticket al espejo */}
            <div className="rounded-xl border border-slate-800/80 bg-[#0b1222] px-4 py-2.5 flex items-center justify-center gap-2 text-center">
              <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="text-[11px] sm:text-xs text-slate-300">
                <strong className="text-white">Garantía de Transparencia VATOS ALFA:</strong> Todo servicio debe aparecer registrado en pantalla con tu nombre; de lo contrario, tu corte es totalmente gratis.
              </p>
            </div>
          </div>
        )}

        {/* ==================== CHECK-IN: BUSCAR CITA ==================== */}
        {step === 'checkin_lookup' && (
          <div className="max-w-2xl w-full mx-auto my-auto space-y-5">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={resetKioskToHome}
                className="text-slate-300 hover:text-white hover:bg-white/10 gap-1.5 text-xs h-9 px-3"
              >
                <ArrowLeft className="h-4 w-4 text-slate-400" />
                Regresar al inicio
              </Button>
              <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-xs font-sans">
                Check-in de Cita
              </Badge>
            </div>

            <div className="rounded-2xl border-2 border-blue-500 bg-[#10172b] p-5 sm:p-7 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">Identifica tu Cita de Hoy</h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Ingresa tu número de teléfono (10 dígitos o últimos 4) o escanea tu QR Pase Alfa.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsQrScanOpen(true)}
                  className="h-11 px-4 rounded-xl border-[#C5A880]/50 bg-[#16203a] hover:bg-[#1d2a4a] text-[#C5A880] font-bold text-xs gap-2 shrink-0"
                >
                  <Camera className="h-4 w-4 text-[#C5A880]" />
                  Escanear QR de mi App
                </Button>
              </div>

              {/* Visor de dígitos */}
              <div className="space-y-4">
                <div className="h-14 rounded-xl border-2 border-slate-700 bg-[#090f1d] flex items-center justify-center px-4">
                  <span
                    className={cn(
                      'text-2xl sm:text-3xl font-bold tracking-widest font-sans',
                      phoneDigits ? 'text-white' : 'text-slate-600'
                    )}
                  >
                    {phoneDigits || '• • • • • • • • • •'}
                  </span>
                </div>

                {/* Teclado numérico táctil grande */}
                <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => {
                        playSmartChime('tap');
                        if (phoneDigits.length < 10) setPhoneDigits((p) => p + digit);
                      }}
                      className="h-14 rounded-xl border border-slate-700 bg-[#16213c] hover:bg-[#1e2d52] active:scale-95 text-xl font-bold text-white font-sans transition-all"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPhoneDigits('')}
                    className="h-14 rounded-xl border border-slate-800 bg-[#11192e] hover:bg-white/10 text-xs font-semibold text-slate-400 hover:text-white transition-all"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playSmartChime('tap');
                      if (phoneDigits.length < 10) setPhoneDigits((p) => p + '0');
                    }}
                    className="h-14 rounded-xl border border-slate-700 bg-[#16213c] hover:bg-[#1e2d52] active:scale-95 text-xl font-bold text-white font-sans transition-all"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhoneDigits((p) => p.slice(0, -1))}
                    className="h-14 rounded-xl border border-slate-800 bg-[#11192e] hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all"
                  >
                    <Delete className="h-5 w-5 text-slate-400" />
                  </button>
                </div>

                <Button
                  type="button"
                  variant="alfa"
                  disabled={phoneDigits.length < 4}
                  onClick={() => findTodayReservationForClientOrPhone(null, phoneDigits)}
                  className="w-full h-12 text-sm font-bold mt-2"
                >
                  <UserCheck className="h-4 w-4 mr-2 text-white" />
                  Buscar mi Cita
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== CHECK-IN: SELECCIONAR ENTRE VARIAS CITAS ==================== */}
        {step === 'checkin_select_res' && (
          <div className="max-w-2xl w-full mx-auto my-auto space-y-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep('checkin_lookup')}
              className="text-slate-300 hover:text-white gap-1.5 text-xs h-9 px-3"
            >
              <ArrowLeft className="h-4 w-4 text-slate-400" />
              Volver
            </Button>
            <div className="rounded-2xl border-2 border-blue-500 bg-[#10172b] p-5 sm:p-6 space-y-4">
              <h2 className="text-xl font-bold text-white">Selecciona tu Cita</h2>
              <div className="space-y-2.5">
                {matchingReservations.map((r) => {
                  const cObj = clients.find((c) => c.id === r.cliente_id) || r.customer;
                  const bObj = branchProfessionals.find((b) => b.id === r.barbero_id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectReservationForCheckIn(r)}
                      className="w-full text-left rounded-xl border border-slate-700 hover:border-blue-500 bg-[#15203a] p-4 flex items-center justify-between gap-3 transition-all"
                    >
                      <div>
                        <p className="text-sm font-bold text-white">
                          {cObj?.nombre || 'Cliente'} {cObj?.apellido ? `${cObj.apellido.slice(0, 1)}.` : ''}
                        </p>
                        <p className="text-xs text-slate-300">
                          {r.servicio} • Con {bObj?.publicName || bObj?.name || 'Barbero'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-blue-400 font-sans block">
                          {r.hora_inicio} hrs
                        </span>
                        <span className="text-xs font-semibold text-white font-sans">
                          ${formatMoney(Number(r.precio ?? r.total ?? 0))}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== WALK-IN PASO 1: ELEGIR SERVICIOS ==================== */}
        {step === 'walkin_services' && (
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={resetKioskToHome}
                className="text-slate-300 hover:text-white gap-1.5 text-xs h-9 px-3"
              >
                <ArrowLeft className="h-4 w-4 text-slate-400" />
                Cancelar
              </Button>
              <div className="text-center">
                <h2 className="text-lg sm:text-xl font-bold text-white">1. ¿Qué servicio te realizaremos hoy?</h2>
                <p className="text-xs text-slate-400 hidden sm:block">Puedes elegir uno o varios servicios</p>
              </div>
              <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-xs font-sans">
                Paso 1 de 3
              </Badge>
            </div>

            {/* Pestañas de categorías */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('todos')}
                className={cn(
                  'px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all',
                  selectedCategoryId === 'todos'
                    ? 'bg-[#202A49] text-white border-blue-500'
                    : 'bg-[#10172b] text-slate-400 border-slate-800 hover:text-white'
                )}
              >
                Todos los servicios
              </button>
              {serviceCategories
                .sort((a, b) => a.order - b.order)
                .map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all',
                      selectedCategoryId === cat.id
                        ? 'bg-[#202A49] text-white border-blue-500'
                        : 'bg-[#10172b] text-slate-400 border-slate-800 hover:text-white'
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
            </div>

            {/* Grid de servicios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 overflow-y-auto pr-1 scrollbar-thin max-h-[54vh]">
              {activeServices
                .filter((s) => selectedCategoryId === 'todos' || s.category === selectedCategoryId)
                .map((srv) => {
                  const isSelected = selectedServiceIds.includes(srv.id);
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() => {
                        playSmartChime('tap');
                        setSelectedServiceIds((prev) =>
                          prev.includes(srv.id) ? prev.filter((id) => id !== srv.id) : [...prev, srv.id]
                        );
                      }}
                      className={cn(
                        'text-left rounded-xl p-4 border-2 transition-all flex flex-col justify-between gap-2',
                        isSelected
                          ? 'border-blue-500 bg-[#172544] shadow-[0_6px_20px_rgba(59,130,246,0.2)]'
                          : 'border-slate-800 bg-[#10172b] hover:border-slate-600'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold text-white leading-snug">{srv.name}</span>
                        {isSelected ? (
                          <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
                        ) : (
                          <Scissors className="h-4 w-4 text-slate-500 shrink-0" />
                        )}
                      </div>
                      {srv.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">{srv.description}</p>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <span className="text-xs text-slate-400 font-sans flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {srv.duration} min
                        </span>
                        <span className="text-sm font-bold text-white font-sans">
                          ${formatMoney(srv.price)}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* Barra inferior de resumen */}
            <div className="rounded-2xl border-2 border-blue-500/70 bg-[#10172b] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div>
                <span className="text-xs text-slate-300 font-sans">
                  {selectedServicesList.length}{' '}
                  {selectedServicesList.length === 1 ? 'servicio seleccionado' : 'servicios seleccionados'}
                </span>
                <p className="text-base font-bold text-white font-sans">
                  Total: ${formatMoney(selectedServicesList.reduce((acc, s) => acc + s.price, 0))} MXN
                </p>
              </div>
              <Button
                type="button"
                variant="alfa"
                disabled={selectedServiceIds.length === 0}
                onClick={() => setStep('walkin_barber')}
                className="h-11 px-6 text-xs sm:text-sm font-bold"
              >
                Continuar: Elegir Barbero →
              </Button>
            </div>
          </div>
        )}

        {/* ==================== WALK-IN PASO 2: ELEGIR BARBERO ==================== */}
        {step === 'walkin_barber' && (
          <div className="max-w-4xl w-full mx-auto my-auto space-y-5">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep('walkin_services')}
                className="text-slate-300 hover:text-white gap-1.5 text-xs h-9 px-3"
              >
                <ArrowLeft className="h-4 w-4 text-slate-400" />
                Cambiar servicios
              </Button>
              <h2 className="text-lg sm:text-xl font-bold text-white">2. ¿Con quién deseas pasar?</h2>
              <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-xs font-sans">
                Paso 2 de 3
              </Badge>
            </div>

            {/* Opción Destacada: El Primero Disponible */}
            {realtimeAvailability.firstAvailable ? (
              <button
                type="button"
                onClick={() => {
                  playSmartChime('tap');
                  setChosenBarberOption('first_available');
                  setResolvedSlot(realtimeAvailability.firstAvailable);
                  setStep('walkin_client');
                }}
                className="w-full text-left rounded-2xl border-2 border-blue-500 bg-gradient-to-r from-[#142242] via-[#1a2c54] to-[#131f3b] p-5 shadow-[0_10px_30px_rgba(59,130,246,0.22)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:brightness-110 transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <Zap className="h-7 w-7 text-[#C5A880] shrink-0" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base sm:text-lg font-black text-white">
                        El Primero Disponible (Más Rápido)
                      </span>
                      <Badge
                        variant="outline"
                        className="border-blue-400/40 bg-blue-500/20 text-blue-200 text-[11px] font-sans font-semibold"
                      >
                        Recomendado
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Te asignamos con{' '}
                      <strong className="text-white">
                        {realtimeAvailability.firstAvailable.barber.publicName ||
                          realtimeAvailability.firstAvailable.barber.name}
                      </strong>{' '}
                      para que pases lo antes posible.
                    </p>
                  </div>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <span className="text-sm font-bold text-blue-300 font-sans block">
                    {realtimeAvailability.firstAvailable.statusLabel}
                  </span>
                  <span className="text-xs text-slate-300 font-sans">
                    Hora estimada: {realtimeAvailability.firstAvailable.earliestStartStr} hrs →
                  </span>
                </div>
              </button>
            ) : (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
                Por el momento no quedan espacios disponibles hoy antes del cierre para la duración seleccionada.
              </div>
            )}

            {/* Tarjetas individuales por barbero */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {realtimeAvailability.availabilities.map((av) => {
                const disabled = !av.worksToday || !av.canPerformAllSelected || !av.canFitBeforeClosing;
                return (
                  <button
                    key={av.barber.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      playSmartChime('tap');
                      setChosenBarberOption(av.barber.id);
                      setResolvedSlot(av);
                      setStep('walkin_client');
                    }}
                    className={cn(
                      'text-left rounded-xl border p-4 flex items-center justify-between gap-3 transition-all',
                      disabled
                        ? 'border-slate-800/60 bg-[#0d1323] opacity-50 cursor-not-allowed'
                        : 'border-slate-700 hover:border-blue-500 bg-[#10182d] hover:bg-[#15203c]'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-12 w-12 border border-slate-700 shrink-0">
                        <AvatarImage src={av.barber.avatarUrl} alt={av.barber.name} />
                        <AvatarFallback className="bg-[#202A49] text-white font-bold text-sm">
                          {(av.barber.publicName || av.barber.name || 'B').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {av.barber.publicName || av.barber.name}
                        </p>
                        {av.barber.numeroEstacion && (
                          <p className="text-[11px] text-slate-400 font-sans">
                            Estación {av.barber.numeroEstacion}
                          </p>
                        )}
                        <p
                          className={cn(
                            'text-xs font-semibold font-sans mt-0.5',
                            disabled
                              ? 'text-slate-500'
                              : av.waitMinutes <= 5
                              ? 'text-blue-400'
                              : 'text-slate-300'
                          )}
                        >
                          {av.statusLabel}
                        </p>
                      </div>
                    </div>
                    {!disabled && (
                      <span className="text-xs font-bold text-blue-400 shrink-0">Elegir →</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== WALK-IN PASO 3: DATOS DEL CLIENTE ==================== */}
        {step === 'walkin_client' && (
          <div className="max-w-xl w-full mx-auto my-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep('walkin_barber')}
                className="text-slate-300 hover:text-white gap-1.5 text-xs h-9 px-3"
              >
                <ArrowLeft className="h-4 w-4 text-slate-400" />
                Cambiar barbero
              </Button>
              <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-xs font-sans">
                Paso 3 de 3
              </Badge>
            </div>

            <div className="rounded-2xl border-2 border-blue-500 bg-[#10172b] p-5 sm:p-6 space-y-5 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">¿A nombre de quién registramos tu turno?</h2>
                  <p className="text-xs text-slate-300">
                    Para llamarte por tu nombre y enviarte tu ticket digital al chat de la App.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsQrScanOpen(true)}
                  className="h-10 px-3.5 rounded-xl border-[#C5A880]/50 bg-[#16203a] text-[#C5A880] text-xs font-bold gap-1.5 shrink-0"
                >
                  <QrCode className="h-4 w-4 text-[#C5A880]" />
                  Escanear mi App QR
                </Button>
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-200">
                    Número de celular (10 dígitos) *
                  </Label>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={walkinPhone}
                    onChange={(e) => setWalkinPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Ej. 4331002030"
                    className="h-11 text-base font-sans bg-[#090f1d] border-slate-700 text-white"
                  />
                </div>

                {isLookingUpClient && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    Verificando si ya eres cliente VATOS ALFA...
                  </div>
                )}

                {activeClient ? (
                  <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-3.5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-white">
                        ¡Qué gusto verte de nuevo, {activeClient.nombre}!
                      </p>
                      <p className="text-xs text-slate-300 font-sans">
                        {isClientWithApp(activeClient)
                          ? `Pase Alfa activo (${Number(activeClient.cortes_acumulados || 0)} sellos • ${Number(activeClient.alfaCoins || 0)} AlfaCoins)`
                          : 'Perfil encontrado — descarga la App para activar tus sellos y AlfaCoins.'}
                      </p>
                    </div>
                    <Check className="h-5 w-5 text-blue-400 shrink-0" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-200">Tu Nombre *</Label>
                      <Input
                        value={walkinFirstName}
                        onChange={(e) => setWalkinFirstName(e.target.value)}
                        placeholder="Ej. Alejandro"
                        className="h-11 text-sm font-sans bg-[#090f1d] border-slate-700 text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-200">Apellido (opcional)</Label>
                      <Input
                        value={walkinLastName}
                        onChange={(e) => setWalkinLastName(e.target.value)}
                        placeholder="Ej. Ramírez"
                        className="h-11 text-sm font-sans bg-[#090f1d] border-slate-700 text-white"
                      />
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  variant="alfa"
                  disabled={isLookingUpClient || walkinPhone.replace(/\D/g, '').length < 10}
                  onClick={handleContinueWalkinClient}
                  className="w-full h-12 text-sm font-bold"
                >
                  <UserPlus className="h-4 w-4 mr-2 text-white" />
                  Continuar al Resumen y Pago →
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PASO 4: RESUMEN Y COBRO EN KIOSCO ==================== */}
        {step === 'checkout' && activeClient && checkoutSummary.barber && (
          <div className="max-w-2xl w-full mx-auto my-auto space-y-4">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setStep(flowMode === 'checkin' ? 'checkin_lookup' : 'walkin_client')
                }
                className="text-slate-300 hover:text-white gap-1.5 text-xs h-9 px-3"
              >
                <ArrowLeft className="h-4 w-4 text-slate-400" />
                Atrás
              </Button>
              <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-xs font-sans">
                Confirmación y Pago Rápido
              </Badge>
            </div>

            <div className="rounded-2xl border-2 border-blue-500 bg-[#10172b] p-5 sm:p-6 shadow-2xl space-y-5">
              {/* Resumen de barbero y horario */}
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border border-blue-500/40">
                    <AvatarImage src={checkoutSummary.barber.avatarUrl} />
                    <AvatarFallback className="bg-[#202A49] text-white font-bold">
                      {(checkoutSummary.barber.publicName || checkoutSummary.barber.name).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs text-slate-400">Cliente: {activeClient.nombre}</p>
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      Barbero: {checkoutSummary.barber.publicName || checkoutSummary.barber.name}
                      {checkoutSummary.barber.numeroEstacion
                        ? ` • Estación ${checkoutSummary.barber.numeroEstacion}`
                        : ''}
                    </h3>
                    <p className="text-xs text-blue-400 font-sans font-semibold">
                      Horario estimado: {checkoutSummary.horaInicio} hrs
                    </p>
                  </div>
                </div>
              </div>

              {/* Desglose de servicios */}
              <div className="space-y-2">
                {checkoutSummary.items.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="flex items-center justify-between text-xs sm:text-sm font-sans">
                    <span className="text-slate-200 font-medium">{item.nombre}</span>
                    <span className="text-white font-semibold">${formatMoney(item.precio * item.cantidad)}</span>
                  </div>
                ))}
                {checkoutSummary.alreadyPaid > 0 && (
                  <div className="flex items-center justify-between text-xs font-sans text-blue-400 pt-1 border-t border-slate-800/70">
                    <span>Anticipo / Pago previo abonado</span>
                    <span>-${formatMoney(checkoutSummary.alreadyPaid)}</span>
                  </div>
                )}
              </div>

              {/* Selector de propina opcional si va a pagar aquí en Kiosco */}
              {checkoutSummary.pendingBalance > 0 && (
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5 text-[#C5A880]" />
                      ¿Deseas agregar propina en tarjeta para tu barbero? (100% íntegra para él)
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {TIP_PRESETS.map((amt) => {
                      const active = !showCustomTip && selectedTip === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setShowCustomTip(false);
                            setSelectedTip(amt);
                          }}
                          className={cn(
                            'h-9 rounded-lg border text-xs font-bold font-sans transition-all',
                            active
                              ? 'border-blue-500 bg-[#202A49] text-white'
                              : 'border-slate-800 bg-[#131c33] text-slate-300 hover:text-white'
                          )}
                        >
                          {amt === 0 ? 'Sin propina' : `+$${formatMoney(amt)}`}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowCustomTip(true)}
                      className={cn(
                        'h-9 rounded-lg border text-xs font-bold font-sans transition-all',
                        showCustomTip
                          ? 'border-blue-500 bg-[#202A49] text-white'
                          : 'border-slate-800 bg-[#131c33] text-slate-300 hover:text-white'
                      )}
                    >
                      Otro
                    </button>
                  </div>
                  {showCustomTip && (
                    <Input
                      type="number"
                      min="0"
                      placeholder="Monto de propina en MXN (ej. 40)"
                      value={customTipStr}
                      onChange={(e) => setCustomTipStr(e.target.value)}
                      className="h-9 text-xs font-sans bg-[#090f1d] border-slate-700 text-white"
                    />
                  )}
                </div>
              )}

              {/* Total final destacado */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 block">
                    {checkoutSummary.pendingBalance <= 0 ? 'Servicio ya liquidado' : 'Total a pagar hoy'}
                  </span>
                  {isClientWithApp(activeClient) && checkoutSummary.pendingBalance > 0 && (
                    <span className="text-[11px] text-[#C5A880] font-semibold flex items-center gap-1 mt-0.5">
                      <Award className="h-3.5 w-3.5 text-[#C5A880]" />
                      Acredita sello Pase Alfa + AlfaCoins automáticamente
                    </span>
                  )}
                </div>
                <span className="text-2xl font-black text-white font-sans">
                  ${formatMoney(checkoutSummary.pendingBalance + effectiveTipAmount)} MXN
                </span>
              </div>

              {/* Botones de Acción */}
              {checkoutSummary.pendingBalance <= 0 ? (
                <Button
                  type="button"
                  variant="alfa"
                  disabled={isProcessingCheckout}
                  onClick={handleCheckInPayAtStationOrPrepaid}
                  className="w-full h-13 text-sm font-bold"
                >
                  {isProcessingCheckout ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2 text-white" />
                  )}
                  Confirmar Llegada y Avisar a mi Barbero
                </Button>
              ) : (
                <div className="space-y-2.5">
                  <Button
                    type="button"
                    variant="alfa"
                    disabled={isProcessingCheckout}
                    onClick={handlePayAtKioskWithTerminal}
                    className="w-full h-13 text-sm font-bold"
                  >
                    {isProcessingCheckout ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2 text-white" />
                    )}
                    Pagar Ahora con Tarjeta en Terminal (${formatMoney(checkoutSummary.pendingBalance + effectiveTipAmount)})
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={isProcessingCheckout}
                    onClick={handleCheckInPayAtStationOrPrepaid}
                    className="w-full h-11 rounded-xl border-slate-700 bg-[#131c33] hover:bg-white/10 text-slate-200 text-xs font-semibold gap-2"
                  >
                    <Banknote className="h-4 w-4 text-slate-400" />
                    Voy a pagar en efectivo en la estación con mi barbero
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== ESPERANDO PAGO EN TERMINAL POINT SMART ==================== */}
        {step === 'waiting_terminal' && (
          <div className="max-w-lg w-full mx-auto my-auto">
            <div className="rounded-2xl border-2 border-blue-500 bg-[#10172b] p-7 text-center space-y-5 shadow-2xl">
              <Loader2 className="h-12 w-12 text-blue-400 animate-spin mx-auto" />
              <div className="space-y-1.5">
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Acerca o Inserta tu Tarjeta en la Terminal
                </h2>
                <p className="text-xs sm:text-sm text-slate-300">
                  Enviamos el cobro por{' '}
                  <strong className="text-white font-sans">
                    ${formatMoney(checkoutSummary.pendingBalance + effectiveTipAmount)} MXN
                  </strong>{' '}
                  a la terminal junto a esta pantalla.
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-3 text-xs text-slate-300">
                En cuanto la terminal apruebe tu pago, avisaremos de inmediato a tu barbero y enviaremos tu comprobante digital al chat de Janeth en tu App.
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelWaitingTerminal}
                className="border-slate-700 text-slate-300 hover:text-white text-xs h-9"
              >
                Cancelar o cambiar método de pago
              </Button>
            </div>
          </div>
        )}

        {/* ==================== PANTALLA FINAL DE ÉXITO + IMPULSO APP ==================== */}
        {step === 'success' && completionInfo && (
          <div className="max-w-2xl w-full mx-auto my-auto space-y-5">
            <div className="rounded-2xl border-2 border-blue-500 bg-[#10172b] p-6 sm:p-8 text-center space-y-5 shadow-2xl">
              <CheckCircle2 className="h-14 w-14 text-blue-400 mx-auto" />
              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  ¡Listo, {completionInfo.clientName}!
                </h2>
                <p className="text-sm sm:text-base text-slate-200">
                  Ya avisamos en su estación a{' '}
                  <strong className="text-white">{completionInfo.barberName}</strong>
                  {completionInfo.stationNumber ? ` (Estación ${completionInfo.stationNumber})` : ''}.
                </p>
                <p className="text-xs text-blue-300 font-semibold font-sans">
                  {completionInfo.paidAtKiosk
                    ? `Pago confirmado por $${formatMoney(completionInfo.totalAmount)} MXN • Pasa a sala de espera`
                    : `Pago pendiente en estación ($${formatMoney(completionInfo.totalAmount)} MXN) • Toma asiento un momento`}
                </p>
              </div>

              {completionInfo.hasApp ? (
                <div className="rounded-xl border border-[#C5A880]/40 bg-[#C5A880]/10 p-4 text-left space-y-1">
                  <p className="text-xs font-bold text-[#C5A880] flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-[#C5A880]" />
                    Revisa el Chat de Janeth en tu App VATOS ALFA
                  </p>
                  <p className="text-xs text-slate-200">
                    Te acabamos de enviar tu confirmación digital
                    {completionInfo.stampsAdded > 0
                      ? ` y se acreditó +${completionInfo.stampsAdded} sello a tu Pase Alfa`
                      : ''}
                    {completionInfo.coinsEarned > 0
                      ? ` junto con +${completionInfo.coinsEarned} AlfaCoins.`
                      : '.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-[#C5A880]/45 bg-[#0c1324] p-4 text-left flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#C5A880] flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-[#C5A880]" />
                      ¡No pierdas tus puntos de hoy! Descarga la App VATOS ALFA
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Mientras esperas tu corte, descarga la App e inicia sesión con tu celular para hablar con <strong className="text-white">Janeth</strong>, recibir tus tickets y ganar tu <strong className="text-white">10.° corte gratis</strong>.
                    </p>
                  </div>
                  {(appLinks.playStoreUrl || appLinks.appStoreUrl) && (
                    <img
                      src={getQrImageUrl(appLinks.playStoreUrl || appLinks.appStoreUrl, 120)}
                      alt="QR Descarga App VATOS ALFA"
                      className="h-24 w-24 rounded-lg bg-white p-1 shrink-0"
                    />
                  )}
                </div>
              )}

              <Button
                type="button"
                variant="alfa"
                onClick={resetKioskToHome}
                className="h-11 px-8 text-xs sm:text-sm font-bold"
              >
                Finalizar y Volver al Inicio
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* ==================== MODAL ESCÁNER QR PASE ALFA ==================== */}
      <Dialog open={isQrScanOpen} onOpenChange={setIsQrScanOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-md p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <QrCode className="h-5 w-5 text-[#C5A880]" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  Escanea tu Pase Alfa
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Muestra el código QR de tu App VATOS ALFA frente a la cámara
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsQrScanOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div
              id="kiosco-qr-reader"
              className="w-full min-h-[260px] rounded-xl overflow-hidden bg-black border border-slate-800"
            />
            {qrScanError && <p className="text-xs text-red-400 text-center">{qrScanError}</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL DESCARGA APP VATOS ALFA ==================== */}
      <Dialog open={isAppPromoOpen} onOpenChange={setIsAppPromoOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-xl p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <Smartphone className="h-5 w-5 text-[#C5A880]" />
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  App Oficial VATOS ALFA — Todo sin WhatsApp
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Escanea con la cámara de tu teléfono para instalar gratis
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAppPromoOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-4 flex flex-col items-center text-center gap-2.5">
                <span className="text-xs font-bold text-white">Android (Google Play)</span>
                {appLinks.playStoreUrl ? (
                  <img
                    src={getQrImageUrl(appLinks.playStoreUrl, 180)}
                    alt="QR Google Play"
                    className="h-36 w-36 rounded-xl bg-white p-1.5"
                  />
                ) : (
                  <p className="text-xs text-slate-400 py-10">Busca &ldquo;VATOS ALFA&rdquo; en Google Play</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-4 flex flex-col items-center text-center gap-2.5">
                <span className="text-xs font-bold text-white">iPhone (App Store)</span>
                {appLinks.appStoreUrl ? (
                  <img
                    src={getQrImageUrl(appLinks.appStoreUrl, 180)}
                    alt="QR App Store"
                    className="h-36 w-36 rounded-xl bg-white p-1.5"
                  />
                ) : (
                  <p className="text-xs text-slate-400 py-10">Busca &ldquo;VATOS ALFA&rdquo; en App Store</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#C5A880]/30 bg-[#C5A880]/10 p-3.5 text-xs text-slate-200 space-y-1">
              <p className="font-bold text-[#C5A880]">¿Por qué usamos nuestra propia App en vez de WhatsApp?</p>
              <p>
                • Hablas 24/7 con <strong className="text-white">Janeth</strong> en el chat integrado para agendar, reagendar o pedir garantías.
              </p>
              <p>
                • Acumulas sellos digitales para tu <strong className="text-white">10.° corte gratis</strong> y ganas <strong className="text-white">AlfaCoins</strong> en cada visita.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL DE AYUDA Y SOPORTE REMOTO ==================== */}
      <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-md p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <MessageSquare className="h-5 w-5 text-blue-400" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  ¿Necesitas Ayuda con tu Cita o Pago?
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Atención prioritaria en la App o aviso inmediato a Central
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsHelpOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-slate-200">
              Si tienes instalada la <strong className="text-white">App VATOS ALFA</strong>, abre el chat con <strong className="text-white">Janeth</strong> para resolver cualquier cambio en segundos. Si no tienes la App, envíanos un aviso directo aquí abajo:
            </div>

            <div className="space-y-2.5">
              <Input
                placeholder="Tu nombre"
                value={helpName}
                onChange={(e) => setHelpName(e.target.value)}
                className="h-9 text-xs bg-[#090f1d] border-slate-700 text-white"
              />
              <Input
                placeholder="Tu celular (10 dígitos)"
                inputMode="numeric"
                maxLength={10}
                value={helpPhone}
                onChange={(e) => setHelpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="h-9 text-xs bg-[#090f1d] border-slate-700 text-white"
              />
              <Input
                placeholder="¿En qué te apoyamos? (ej. problema con terminal, duda de cita)"
                value={helpTopic}
                onChange={(e) => setHelpTopic(e.target.value)}
                className="h-9 text-xs bg-[#090f1d] border-slate-700 text-white"
              />
              <Button
                type="button"
                variant="alfa"
                disabled={isSendingHelp}
                onClick={handleSendHelpRequest}
                className="w-full h-10 text-xs font-bold"
              >
                {isSendingHelp && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Enviar Aviso a Recepción Remota
              </Button>
            </div>

            {currentLocal?.whatsappSoporteRemoto && (
              <p className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-800 font-sans">
                ¿Sin la App en casos especiales? Línea remota de respaldo: {currentLocal.whatsappSoporteRemoto}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL SALIDA ADMINISTRATIVA CON CÓDIGO ==================== */}
      <Dialog open={isAdminExitOpen} onOpenChange={setIsAdminExitOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-sm p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <Lock className="h-4 w-4 text-slate-300" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">Bloqueo de Kiosco</DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Código de autorización para salir al panel
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAdminExitOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyAdminExit()}
              className="h-10 text-center tracking-widest font-mono bg-[#090f1d] border-slate-700 text-white"
            />
            <Button
              type="button"
              variant="alfa"
              disabled={isVerifyingAdmin || !adminCode}
              onClick={handleVerifyAdminExit}
              className="w-full h-9 text-xs font-bold"
            >
              {isVerifyingAdmin && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Desbloquear y Salir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function KioscoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070D1B] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      }
    >
      <KioskContent />
    </Suspense>
  );
}
