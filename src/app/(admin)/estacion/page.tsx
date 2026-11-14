'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
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
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Award,
  Banknote,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Delete,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Play,
  Plus,
  QrCode,
  Scissors,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  Trash2,
  Unlock,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { db, functions, httpsCallable } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useToast } from '@/hooks/use-toast';
import { cn, formatMoney } from '@/lib/utils';
import { isClientWithApp } from '@/lib/client-app-helper';
import { validateAndConsumeAuthCode } from '@/lib/auth-code-validator';
import { logAuditAction } from '@/lib/audit-logger';
import {
  cleanFirestoreObject,
  createSmartSaleRecord,
  finalizeSmartSaleLoyalty,
  getQrImageUrl,
  isAutomatedBranch,
  notifyClientDigitalReceiptInApp,
  notifyClientNoShowAntiFraudInApp,
  playSmartChime,
  revertPendingSmartTerminalSale,
  sendJanethAppNotification,
  type SmartCartItem,
} from '@/lib/smart-branch';
import type {
  Client,
  Local,
  Product,
  Profesional,
  Reservation,
  Sale,
  Service,
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

interface StationDraftItem extends SmartCartItem {
  uid: string;
  isLockedOriginal: boolean;
}

const TIP_PRESETS = [0, 20, 30, 50];

function maskPhoneForStation(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return 'Sin teléfono';
  return `••••••${digits.slice(-4)}`;
}

function formatTimestampHour(ts: any): string | null {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return null;
    return format(d, 'HH:mm');
  } catch {
    return null;
  }
}

function EstacionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { selectedLocalId, setSelectedLocalId } = useLocal();
  const { toast } = useToast();

  const urlLocalId = searchParams.get('local_id');
  const urlBarberId = searchParams.get('barbero_id');

  const { data: locales = [], loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: allProfessionals = [] } = useFirestoreQuery<Profesional>('profesionales');
  const { data: allServices = [] } = useFirestoreQuery<Service>('servicios');
  const { data: allProducts = [] } = useFirestoreQuery<Product>('productos');
  const { data: clients = [] } = useFirestoreQuery<Client>('clientes');
  const { data: terminals = [] } = useFirestoreQuery<any>('terminales');

  const [activeLocalId, setActiveLocalId] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Estado de sesión por Barbero en su Mini-Tablet
  const [unlockedBarberId, setUnlockedBarberId] = useState<string | null>(null);
  const [pendingLoginBarber, setPendingLoginBarber] = useState<Profesional | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [newPinToSave, setNewPinToSave] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Datos bancarios para transferencia SPEI y links de App Móvil
  const [bankInfo, setBankInfo] = useState<{ bank: string; accountHolder: string; clabe: string }>({
    bank: '',
    accountHolder: '',
    clabe: '',
  });
  const [appLinks, setAppLinks] = useState<{ playStoreUrl: string; appStoreUrl: string }>({
    playStoreUrl: '',
    appStoreUrl: '',
  });
  const [isAppQrModalOpen, setIsAppQrModalOpen] = useState(false);

  // Reservas y Ventas del día en tiempo real
  const [todayReservations, setTodayReservations] = useState<Reservation[]>([]);
  const [todayBranchSales, setTodayBranchSales] = useState<Sale[]>([]);
  const knownWaitingIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  // Modal de Cuenta / Extras / Cobro de una Cita
  const [selectedResForManage, setSelectedResForManage] = useState<Reservation | null>(null);
  const [draftItems, setDraftItems] = useState<StationDraftItem[]>([]);
  const [isAddCatalogOpen, setIsAddCatalogOpen] = useState(false);
  const [catalogTab, setCatalogTab] = useState<'servicios' | 'productos'>('servicios');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Desbloqueo antifraude de conceptos preseleccionados (requiere código de 4 dígitos)
  const [isUnlockItemsOpen, setIsUnlockItemsOpen] = useState(false);
  const [unlockAuthCode, setUnlockAuthCode] = useState('');
  const [itemsUnlockedByAdmin, setItemsUnlockedByAdmin] = useState(false);
  const [isValidatingUnlock, setIsValidatingUnlock] = useState(false);

  // Modal de Cobro en Estación
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'efectivo' | 'transferencia'>('mercadopago');
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customTipStr, setCustomTipStr] = useState<string>('');
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [cashReceivedStr, setCashReceivedStr] = useState<string>('');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [waitingTerminalSaleId, setWaitingTerminalSaleId] = useState<string | null>(null);
  const terminalUnsubRef = useRef<(() => void) | null>(null);

  // Modal Antifraude para Cancelar / No Asistió (requiere código de 4 dígitos + alerta a cliente en App)
  const [resForNoShow, setResForNoShow] = useState<Reservation | null>(null);
  const [noShowReason, setNoShowReason] = useState<'No asiste' | 'Cancelada'>('No asiste');
  const [noShowAuthCode, setNoShowAuthCode] = useState('');
  const [isSubmittingNoShow, setIsSubmittingNoShow] = useState(false);

  // Modal Mi Caja Individual y Comisiones del Día
  const [isCashDrawerOpen, setIsCashDrawerOpen] = useState(false);

  // Modal Salida Administrativa
  const [isAdminExitOpen, setIsAdminExitOpen] = useState(false);
  const [adminExitCode, setAdminExitCode] = useState('');
  const [isVerifyingExit, setIsVerifyingExit] = useState(false);

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  // Sucursal activa
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

  const branchProfessionals = useMemo(
    () =>
      allProfessionals
        .filter((p) => p.active && !p.deleted && p.local_id === activeLocalId)
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    [allProfessionals, activeLocalId]
  );

  // Si viene ?barbero_id= en la URL, abrir su prompt de PIN de inmediato
  useEffect(() => {
    if (urlBarberId && !unlockedBarberId && branchProfessionals.length > 0 && !pendingLoginBarber) {
      const target = branchProfessionals.find((b) => b.id === urlBarberId);
      if (target) setPendingLoginBarber(target);
    }
  }, [urlBarberId, unlockedBarberId, branchProfessionals, pendingLoginBarber]);

  const activeBarber = useMemo(
    () => branchProfessionals.find((b) => b.id === unlockedBarberId) || null,
    [branchProfessionals, unlockedBarberId]
  );

  // Cargar CLABE SPEI y enlaces App Móvil
  useEffect(() => {
    (async () => {
      try {
        const pagosSnap = await getDoc(doc(db, 'configuracion', 'pagos'));
        if (pagosSnap.exists()) {
          const d = pagosSnap.data();
          setBankInfo({
            bank: d.bank || '',
            accountHolder: d.accountHolder || '',
            clabe: d.clabe || '',
          });
        }
        const appSnap = await getDoc(doc(db, 'configuracion', 'app_movil'));
        if (appSnap.exists()) {
          setAppLinks({
            playStoreUrl: appSnap.data()?.playStoreUrl || '',
            appStoreUrl: appSnap.data()?.appStoreUrl || '',
          });
        }
      } catch {
        // Ignore
      }
    })();
  }, []);

  const todayStr = useMemo(() => format(currentTime, 'yyyy-MM-dd'), [currentTime]);

  // Suscripción en tiempo real a citas de hoy y detección sonora de Check-in en Kiosco
  useEffect(() => {
    if (!activeLocalId) return;
    initialLoadDoneRef.current = false;
    knownWaitingIdsRef.current = new Set();

    const qRes = query(collection(db, 'reservas'), where('fecha', '==', todayStr));
    const unsubRes = onSnapshot(qRes, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Reservation))
        .filter((r) => !r.local_id || r.local_id === activeLocalId);

      // Detectar si un cliente del barbero activo acaba de hacer Check-in ('En espera')
      if (unlockedBarberId) {
        const waitingForMe = list.filter(
          (r) => r.barbero_id === unlockedBarberId && r.estado === 'En espera'
        );
        if (initialLoadDoneRef.current) {
          for (const w of waitingForMe) {
            if (!knownWaitingIdsRef.current.has(w.id)) {
              playSmartChime('checkin');
            }
          }
        }
        knownWaitingIdsRef.current = new Set(waitingForMe.map((w) => w.id));
      }
      initialLoadDoneRef.current = true;
      setTodayReservations(list);
    });

    const start = Timestamp.fromDate(startOfDay(currentTime));
    const end = Timestamp.fromDate(endOfDay(currentTime));
    const qSales = query(
      collection(db, 'ventas'),
      where('fecha_hora_venta', '>=', start),
      where('fecha_hora_venta', '<=', end)
    );
    const unsubSales = onSnapshot(qSales, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Sale))
        .filter((s) => s.local_id === activeLocalId && s.pago_estado !== 'Pendiente');
      setTodayBranchSales(list);
    });

    return () => {
      unsubRes();
      unsubSales();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocalId, todayStr, unlockedBarberId]);

  const activeTerminalId = useMemo(() => {
    if (currentLocal?.estacionTerminalId) return currentLocal.estacionTerminalId;
    if (currentLocal?.kioscoTerminalId) return currentLocal.kioscoTerminalId;
    const pdv = terminals.find((t: any) => t.operating_mode === 'PDV') || terminals[0];
    return pdv?.id || '';
  }, [currentLocal, terminals]);

  // Citas del día exclusivas del barbero desbloqueado
  const myReservations = useMemo(() => {
    if (!activeBarber) return [];
    return todayReservations
      .filter((r) => r.barbero_id === activeBarber.id)
      .sort((a, b) => String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || '')));
  }, [todayReservations, activeBarber]);

  const activeInChairRes = useMemo(
    () => myReservations.find((r) => r.estado === 'En atención') || null,
    [myReservations]
  );

  const waitingInLoungeList = useMemo(
    () => myReservations.filter((r) => r.estado === 'En espera'),
    [myReservations]
  );

  // Cálculo de Caja Individual y Comisiones Estimadas de HOY para el barbero activo
  const myShiftSummary = useMemo(() => {
    const baseFloat = Number(currentLocal?.fondoFijoEstacion ?? 300);
    if (!activeBarber) {
      return {
        baseFloat,
        cashCollectedSales: 0,
        physicalDrawerTotal: baseFloat,
        estimatedCommission: 0,
        cardTipsEarned: 0,
        completedCuts: 0,
        netBalanceForBarber: 0,
      };
    }

    const serviceMap = new Map(allServices.map((s) => [s.id, s]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    let cashCollectedSales = 0;
    let estimatedCommission = 0;
    let cardTipsEarned = 0;

    todayBranchSales.forEach((sale) => {
      if ((sale as any).absorbed_in_sale_id || sale.tipo_venta === 'anticipo') return;

      // Efectivo retenido en la estación de este barbero
      if (sale.cobrado_por_barbero_id === activeBarber.id) {
        cashCollectedSales += Number(sale.efectivo_retenido_barbero || 0);
      }

      // Comisión por ítems realizados/vendidos por este barbero
      (sale.items || []).forEach((item) => {
        if (item.barbero_id !== activeBarber.id) return;
        const amount = Number(item.subtotal || item.precio || 0) - Number(item.descuento?.monto || 0);
        let cfg = activeBarber.defaultCommission;
        if (item.tipo === 'servicio') {
          const srv = serviceMap.get(item.id);
          cfg = activeBarber.comisionesPorServicio?.[item.id] || srv?.defaultCommission || cfg;
        } else if (item.tipo === 'producto') {
          const prd = productMap.get(item.id);
          cfg = activeBarber.comisionesPorProducto?.[item.id] || prd?.commission || cfg;
        }
        if (cfg) {
          const comm = cfg.type === '%' ? amount * (cfg.value / 100) : cfg.value;
          estimatedCommission += comm;
        }
      });

      // Propinas en tarjeta / transferencia (las de efectivo ya las tiene en mano)
      const propina = Number(sale.propina || 0);
      const propMetodo = String((sale as any).propina_metodo || sale.metodo_pago || '').toLowerCase();
      if (propina > 0 && propMetodo !== 'efectivo' && !sale.tipPaid) {
        const sellers = Array.from(new Set((sale.items || []).map((i) => i.barbero_id).filter(Boolean)));
        if (sellers.includes(activeBarber.id)) {
          cardTipsEarned += propina / sellers.length;
        }
      }
    });

    const completedCuts = myReservations.filter((r) => r.estado === 'Asiste').length;
    const netBalanceForBarber = Math.round((estimatedCommission + cardTipsEarned - cashCollectedSales) * 100) / 100;

    return {
      baseFloat,
      cashCollectedSales: Math.round(cashCollectedSales * 100) / 100,
      physicalDrawerTotal: Math.round((baseFloat + cashCollectedSales) * 100) / 100,
      estimatedCommission: Math.round(estimatedCommission * 100) / 100,
      cardTipsEarned: Math.round(cardTipsEarned * 100) / 100,
      completedCuts,
      netBalanceForBarber,
    };
  }, [currentLocal, activeBarber, allServices, allProducts, todayBranchSales, myReservations]);

  // Desbloqueo de Estación con PIN de 4 dígitos (o Código Admin si aún no tiene PIN configurado)
  const handleUnlockBarberStation = async () => {
    if (!pendingLoginBarber || !pinInput.trim()) return;
    setIsVerifyingPin(true);
    try {
      const configuredPin = String(pendingLoginBarber.pinEstacion || '').trim();
      if (configuredPin && pinInput.trim() === configuredPin) {
        playSmartChime('tap');
        setUnlockedBarberId(pendingLoginBarber.id);
        setPendingLoginBarber(null);
        setPinInput('');
        return;
      }

      // Respaldo: validar si es un código de autorización administrativo
      const authRes = await validateAndConsumeAuthCode({
        db,
        code: pinInput.trim(),
        requiredPermission: 'any',
        userId: pendingLoginBarber.userId || user?.uid || 'estacion',
        userName: pendingLoginBarber.name,
        userRole: 'Barbero / Estación',
        localId: activeLocalId,
        operationDescription: `Acceso administrativo a estación de ${pendingLoginBarber.name}`,
        moduleLabel: 'Estación Sin Recepcionista',
      });

      if (!authRes.valid) {
        playSmartChime('alert');
        toast({
          variant: 'destructive',
          title: 'PIN incorrecto',
          description: configuredPin
            ? 'Verifica tu PIN de 4 dígitos de estación.'
            : 'Este barbero aún no tiene PIN asignado. Ingresa un código de autorización para configurarlo.',
        });
        return;
      }

      // Si no tenía PIN y escribió nuevo PIN para guardar, persistirlo
      if (!configuredPin && /^\d{4}$/.test(newPinToSave.trim())) {
        await updateDoc(doc(db, 'profesionales', pendingLoginBarber.id), {
          pinEstacion: newPinToSave.trim(),
        });
        toast({
          title: 'PIN de Estación guardado',
          description: `A partir de ahora ${pendingLoginBarber.name} puede entrar con su nuevo PIN.`,
        });
      }

      setUnlockedBarberId(pendingLoginBarber.id);
      setPendingLoginBarber(null);
      setPinInput('');
      setNewPinToSave('');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Pasar cliente a sillón ("En atención" + sello exacto para auditoría con cámaras)
  const handleStartChairService = async (res: Reservation) => {
    if (!activeBarber || !currentLocal) return;
    if (activeInChairRes && activeInChairRes.id !== res.id) {
      toast({
        variant: 'destructive',
        title: 'Ya tienes un cliente en atención',
        description: 'Finaliza y cobra primero el servicio actual en sillón antes de iniciar el siguiente.',
      });
      return;
    }

    try {
      await updateDoc(doc(db, 'reservas', res.id), {
        estado: 'En atención',
        hora_inicio_atencion: serverTimestamp(),
      });

      const clientObj = clients.find((c) => c.id === res.cliente_id) || res.customer;
      if (clientObj) {
        await sendJanethAppNotification({
          db,
          client: clientObj,
          message: `¡Es tu turno, ${clientObj.nombre}! ${activeBarber.publicName || activeBarber.name}${activeBarber.numeroEstacion ? ` te espera en la Estación ${activeBarber.numeroEstacion}` : ' ya te espera en su estación'}.`,
          actionType: 'chair_called',
          reservationId: res.id,
        });
      }

      playSmartChime('tap');
      toast({
        title: 'Cliente en sillón',
        description: 'Hora de inicio registrada. El nombre del cliente ya está activo en pantalla.',
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'No se pudo actualizar estado',
        description: err?.message || 'Intenta nuevamente.',
      });
    }
  };

  // Abrir gestor de cuenta de la cita (respeta candado antifraude en servicios originales)
  const openManageReservationModal = (res: Reservation) => {
    if (!activeBarber) return;
    const rawItems =
      Array.isArray(res.items) && res.items.length > 0
        ? res.items.map((it: any, idx: number) => ({
            uid: `orig-${idx}-${it.id || 'srv'}`,
            id: it.id || 'srv',
            nombre: it.nombre || it.servicio || res.servicio || 'Servicio',
            precio: Number(it.precio ?? it.precio_unitario ?? res.precio ?? 0),
            cantidad: Number(it.cantidad || 1),
            tipo: (it.tipo || 'servicio') as 'servicio' | 'producto',
            barbero_id: it.barbero_id || activeBarber.id,
            duracion: Number(it.duracion || 30),
            pagado_en_kiosco: Boolean(it.pagado_en_kiosco || res.pago_estado === 'Pagado'),
            bloqueado_kiosco: true,
            isLockedOriginal: true,
          }))
        : [
            {
              uid: `orig-0`,
              id: 'srv_reserva',
              nombre: res.servicio || 'Servicio Reservado',
              precio: Number(res.precio ?? res.total ?? 0),
              cantidad: 1,
              tipo: 'servicio' as const,
              barbero_id: activeBarber.id,
              duracion: 30,
              pagado_en_kiosco: res.pago_estado === 'Pagado',
              bloqueado_kiosco: true,
              isLockedOriginal: true,
            },
          ];

    setSelectedResForManage(res);
    setDraftItems(rawItems);
    setItemsUnlockedByAdmin(false);
    setTipAmount(0);
    setCustomTipStr('');
    setShowCustomTip(false);
    setCashReceivedStr('');
  };

  // Agregar extra (servicio adicional o producto de inventario)
  const handleAddExtraItem = (entry: Service | Product, tipo: 'servicio' | 'producto') => {
    if (!activeBarber) return;
    const precio = tipo === 'servicio' ? Number((entry as Service).price || 0) : Number((entry as Product).public_price || 0);
    const nombre = tipo === 'servicio' ? (entry as Service).name : (entry as Product).nombre;

    setDraftItems((prev) => [
      ...prev,
      {
        uid: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        id: entry.id,
        nombre,
        precio,
        cantidad: 1,
        tipo,
        barbero_id: activeBarber.id,
        duracion: tipo === 'servicio' ? Number((entry as Service).duration || 20) : 0,
        presentation_id: tipo === 'producto' ? (entry as Product).presentation_id : undefined,
        pagado_en_kiosco: false,
        bloqueado_kiosco: false,
        isLockedOriginal: false,
      },
    ]);
    playSmartChime('tap');
    setIsAddCatalogOpen(false);
  };

  const handleRemoveDraftItem = (targetUid: string) => {
    const item = draftItems.find((i) => i.uid === targetUid);
    if (!item) return;
    if (item.pagado_en_kiosco) {
      toast({
        variant: 'destructive',
        title: 'Concepto ya pagado en Kiosco',
        description: 'No se puede eliminar un servicio que el cliente ya liquidó.',
      });
      return;
    }
    if (item.isLockedOriginal && !itemsUnlockedByAdmin) {
      setIsUnlockItemsOpen(true);
      return;
    }
    if (draftItems.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'La cita debe conservar al menos 1 concepto',
      });
      return;
    }
    setDraftItems((prev) => prev.filter((i) => i.uid !== targetUid));
  };

  const handleConfirmUnlockOriginalItems = async () => {
    if (!activeBarber || !selectedResForManage) return;
    setIsValidatingUnlock(true);
    try {
      const res = await validateAndConsumeAuthCode({
        db,
        code: unlockAuthCode,
        requiredPermission: 'reserves',
        userId: activeBarber.userId || user?.uid || activeBarber.id,
        userName: activeBarber.name,
        userRole: 'Barbero / Estación',
        localId: activeLocalId,
        operationDescription: `Desbloquear edición de servicio preseleccionado en cita #${selectedResForManage.id.slice(0, 6)}`,
        moduleLabel: 'Estación Antifraude',
      });

      if (!res.valid) {
        playSmartChime('alert');
        toast({
          variant: 'destructive',
          title: 'Código inválido',
          description: res.error || 'Solicita a Administración un código de 4 dígitos válido.',
        });
        return;
      }

      await logAuditAction({
        action: 'DESBLOQUEO_SERVICIO_ESTACION',
        details: `Barbero ${activeBarber.name} desbloqueó edición de servicios originales en cita ${selectedResForManage.id}`,
        userId: activeBarber.id,
        userName: activeBarber.name,
        userRole: 'Barbero',
        authCode: unlockAuthCode,
        severity: 'warning',
        entityId: selectedResForManage.id,
        localId: activeLocalId,
      });

      setItemsUnlockedByAdmin(true);
      setUnlockAuthCode('');
      setIsUnlockItemsOpen(false);
      toast({
        title: 'Edición autorizada',
        description: 'Ahora puedes ajustar el servicio preseleccionado.',
      });
    } finally {
      setIsValidatingUnlock(false);
    }
  };

  // Totales de la cita gestionada
  const manageFinancials = useMemo(() => {
    if (!selectedResForManage) {
      return {
        fullSubtotal: 0,
        paidPreviously: 0,
        pendingToCollect: 0,
        unpaidItems: [] as StationDraftItem[],
        wasOriginalPaidAtKiosk: false,
      };
    }

    const fullSubtotal = draftItems.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    const wasOriginalPaidAtKiosk = Boolean(
      selectedResForManage.pago_estado === 'Pagado' || selectedResForManage.kiosco_venta_id
    );

    if (wasOriginalPaidAtKiosk) {
      const unpaidExtras = draftItems.filter((i) => !i.pagado_en_kiosco);
      const pendingExtrasTotal = unpaidExtras.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
      const paidKioskTotal = fullSubtotal - pendingExtrasTotal;
      return {
        fullSubtotal,
        paidPreviously: paidKioskTotal,
        pendingToCollect: Math.max(0, Math.round(pendingExtrasTotal * 100) / 100),
        unpaidItems: unpaidExtras,
        wasOriginalPaidAtKiosk: true,
      };
    }

    const isDepositUnpaid =
      selectedResForManage.pago_estado === 'pendiente_anticipo' ||
      selectedResForManage.pago_estado === 'pending_payment' ||
      selectedResForManage.pago_estado === 'Pendiente' ||
      selectedResForManage.pago_estado === 'pendiente';

    const paidDeposit = isDepositUnpaid
      ? 0
      : Number(
          selectedResForManage.monto_pagado_real ??
            selectedResForManage.monto_pagado ??
            selectedResForManage.anticipoPagado ??
            selectedResForManage.anticipo_pagado ??
            0
        );

    return {
      fullSubtotal,
      paidPreviously: paidDeposit,
      pendingToCollect: Math.max(0, Math.round((fullSubtotal - paidDeposit) * 100) / 100),
      unpaidItems: draftItems,
      wasOriginalPaidAtKiosk: false,
    };
  }, [selectedResForManage, draftItems]);

  const effectiveStationTip = useMemo(() => {
    if (showCustomTip) {
      const p = parseFloat(customTipStr);
      return isNaN(p) || p < 0 ? 0 : Math.round(p * 100) / 100;
    }
    return tipAmount;
  }, [showCustomTip, customTipStr, tipAmount]);

  // Cerrar cita que YA fue pagada en su totalidad en el Kiosco (sin extras pendientes)
  const handleCompleteAlreadyPaidReservation = async () => {
    if (!selectedResForManage || !activeBarber || !currentLocal) return;
    setIsSubmittingSale(true);
    try {
      await updateDoc(doc(db, 'reservas', selectedResForManage.id), {
        estado: 'Asiste',
        hora_fin_atencion: serverTimestamp(),
      });

      const clientObj =
        clients.find((c) => c.id === selectedResForManage.cliente_id) ||
        selectedResForManage.customer;

      if (clientObj) {
        await sendJanethAppNotification({
          db,
          client: clientObj,
          message: `¡Gracias por tu visita hoy en ${currentLocal.name}, ${clientObj.nombre}! Tu servicio con ${activeBarber.publicName || activeBarber.name} ha concluido. Cualquier detalle cuentas con garantía escribiéndome aquí en la App.`,
          actionType: 'service_completed',
          reservationId: selectedResForManage.id,
        });
      }

      playSmartChime('payment_ok');
      toast({
        title: 'Servicio finalizado con éxito',
        description: 'La cita quedó cerrada como Asiste y tu comisión ya está registrada.',
      });
      setSelectedResForManage(null);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al finalizar cita',
        description: err?.message || 'Intenta nuevamente.',
      });
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Ejecutar cobro en Estación (Efectivo en Caja Individual, Point Smart o Transferencia)
  const handleExecuteStationPayment = async () => {
    if (!selectedResForManage || !activeBarber || !currentLocal) return;

    const clientObj: Client =
      clients.find((c) => c.id === selectedResForManage.cliente_id) ||
      selectedResForManage.customer || {
        id: selectedResForManage.cliente_id || 'cliente_general',
        nombre: 'Cliente',
        apellido: '',
        correo: '',
        telefono: '',
        creado_en: Timestamp.now(),
      };

    const itemsToCharge = manageFinancials.wasOriginalPaidAtKiosk
      ? manageFinancials.unpaidItems
      : draftItems;

    const anticipoForThisSale = manageFinancials.wasOriginalPaidAtKiosk
      ? 0
      : manageFinancials.paidPreviously;

    // FLUJO A: TERMINAL POINT SMART
    if (paymentMethod === 'mercadopago') {
      if (!activeTerminalId) {
        toast({
          variant: 'destructive',
          title: 'Sin terminal Point configurada',
          description: 'Configura la terminal en Ajustes o cobra en Efectivo / Transferencia.',
        });
        return;
      }

      setIsSubmittingSale(true);
      try {
        const totalOnTerminal =
          Math.round((manageFinancials.pendingToCollect + effectiveStationTip) * 100) / 100;

        const { saleId } = await createSmartSaleRecord({
          db,
          local: currentLocal,
          client: clientObj,
          cartItems: itemsToCharge,
          fullReservationItems: draftItems,
          paymentMethod: 'mercadopago',
          pagoEstadoInitial: 'Pendiente',
          origin: 'estacion',
          tipAmount: effectiveStationTip,
          tipMethod: 'mercadopago',
          anticipoPagado: anticipoForThisSale,
          reservationId: selectedResForManage.id,
          collectedByBarber: activeBarber,
          isComplementaryExtraSale: manageFinancials.wasOriginalPaidAtKiosk,
          allServices,
        });

        setWaitingTerminalSaleId(saleId);

        const createPayment = httpsCallable(functions, 'createPointPayment');
        const resFn: any = await createPayment({
          amount: totalOnTerminal,
          terminalId: activeTerminalId,
          referenceId: saleId,
          payer: {
            email: clientObj.correo || 'cliente@vatosalfa.com',
            name: `${clientObj.nombre} ${clientObj.apellido || ''}`.trim(),
          },
        });

        if (!resFn?.data?.success) {
          throw new Error(resFn?.data?.message || 'Error al enviar cobro a la terminal.');
        }

        if (terminalUnsubRef.current) terminalUnsubRef.current();
        let done = false;

        const unsub = onSnapshot(doc(db, 'ventas', saleId), async (snap) => {
          if (done || !snap.exists()) return;
          const sData = snap.data();
          if (sData && (sData.pago_estado === 'Pagado' || sData.mercado_pago_status === 'approved')) {
            done = true;
            if (terminalUnsubRef.current) {
              terminalUnsubRef.current();
              terminalUnsubRef.current = null;
            }
            setWaitingTerminalSaleId(null);

            await updateDoc(doc(db, 'ventas', saleId), {
              pago_estado: 'Pagado',
              saldo_pendiente: 0,
              monto_pagado_real: manageFinancials.pendingToCollect,
            }).catch(() => {});

            const finalResItems = draftItems.map((it) => ({
              id: it.id,
              nombre: it.nombre,
              servicio: it.nombre,
              tipo: it.tipo,
              barbero_id: it.barbero_id,
              precio: it.precio,
              subtotal: it.precio * it.cantidad,
              duracion: it.duracion || 0,
              cantidad: it.cantidad,
              pagado_en_kiosco: Boolean(it.pagado_en_kiosco),
              bloqueado_kiosco: true,
            }));

            await updateDoc(
              doc(db, 'reservas', selectedResForManage.id),
              cleanFirestoreObject({
                estado: 'Asiste',
                hora_fin_atencion: serverTimestamp(),
                pago_estado: 'Pagado',
                monto_pagado: manageFinancials.fullSubtotal,
                monto_pagado_real: manageFinancials.fullSubtotal,
                saldo_pendiente: 0,
                items: finalResItems,
                precio: manageFinancials.fullSubtotal,
                total: manageFinancials.fullSubtotal,
                servicio: finalResItems.map((i) => i.nombre).join(', '),
              })
            ).catch(() => {});

            const loyalty = await finalizeSmartSaleLoyalty({
              db,
              client: clientObj,
              cartItems: itemsToCharge,
              saleTotal: manageFinancials.pendingToCollect,
              anticipoPagado: anticipoForThisSale,
              saleId,
              allServices,
            });

            await notifyClientDigitalReceiptInApp({
              db,
              client: clientObj,
              localName: currentLocal.name,
              barberName: activeBarber.publicName || activeBarber.name,
              items: itemsToCharge.map((i) => ({
                nombre: i.nombre,
                cantidad: i.cantidad,
                subtotal: i.precio * i.cantidad,
              })),
              totalPaid: manageFinancials.pendingToCollect,
              tipAmount: effectiveStationTip,
              paymentMethodLabel: 'Tarjeta en Estación (Point Smart)',
              stampsAdded: loyalty.stampsAdded,
              currentStamps: loyalty.currentStamps,
              targetStamps: loyalty.targetStamps,
              coinsEarned: loyalty.coinsEarned,
              saleId,
              reservationId: selectedResForManage.id,
            });

            playSmartChime('payment_ok');
            setIsSubmittingSale(false);
            setIsCheckoutOpen(false);
            setSelectedResForManage(null);
            toast({
              title: 'Cobro en terminal aprobado',
              description: 'Servicio cerrado y comprobante enviado a la App del cliente.',
            });
          }
        });

        terminalUnsubRef.current = unsub;
      } catch (err: any) {
        if (waitingTerminalSaleId) {
          await revertPendingSmartTerminalSale(db, waitingTerminalSaleId);
          setWaitingTerminalSaleId(null);
        }
        setIsSubmittingSale(false);
        playSmartChime('alert');
        toast({
          variant: 'destructive',
          title: 'Error en Terminal',
          description: err?.message || 'Revisa que la terminal esté encendida.',
        });
      }
      return;
    }

    // FLUJO B: EFECTIVO (CAJA INDIVIDUAL DE ESTACIÓN) O TRANSFERENCIA
    setIsSubmittingSale(true);
    try {
      const { saleId } = await createSmartSaleRecord({
        db,
        local: currentLocal,
        client: clientObj,
        cartItems: itemsToCharge,
        fullReservationItems: draftItems,
        paymentMethod,
        pagoEstadoInitial: 'Pagado',
        origin: 'estacion',
        tipAmount: effectiveStationTip,
        tipMethod: paymentMethod,
        anticipoPagado: anticipoForThisSale,
        reservationId: selectedResForManage.id,
        collectedByBarber: activeBarber,
        isComplementaryExtraSale: manageFinancials.wasOriginalPaidAtKiosk,
        allServices,
      });

      const loyalty = await finalizeSmartSaleLoyalty({
        db,
        client: clientObj,
        cartItems: itemsToCharge,
        saleTotal: manageFinancials.pendingToCollect,
        anticipoPagado: anticipoForThisSale,
        saleId,
        allServices,
      });

      await notifyClientDigitalReceiptInApp({
        db,
        client: clientObj,
        localName: currentLocal.name,
        barberName: activeBarber.publicName || activeBarber.name,
        items: itemsToCharge.map((i) => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          subtotal: i.precio * i.cantidad,
        })),
        totalPaid: manageFinancials.pendingToCollect,
        tipAmount: effectiveStationTip,
        paymentMethodLabel:
          paymentMethod === 'efectivo' ? 'Efectivo en Estación' : 'Transferencia SPEI',
        stampsAdded: loyalty.stampsAdded,
        currentStamps: loyalty.currentStamps,
        targetStamps: loyalty.targetStamps,
        coinsEarned: loyalty.coinsEarned,
        saleId,
        reservationId: selectedResForManage.id,
      });

      if (paymentMethod === 'transferencia') {
        await logAuditAction({
          action: 'COBRO_TRANSFERENCIA_ESTACION',
          details: `Barbero ${activeBarber.name} registró cobro por transferencia de $${formatMoney(manageFinancials.pendingToCollect)} a ${clientObj.nombre}`,
          userId: activeBarber.id,
          userName: activeBarber.name,
          userRole: 'Barbero',
          severity: 'info',
          entityId: saleId,
          localId: activeLocalId,
        });
      }

      playSmartChime('payment_ok');
      setIsCheckoutOpen(false);
      setSelectedResForManage(null);
      toast({
        title:
          paymentMethod === 'efectivo'
            ? `Cobro en efectivo registrado ($${formatMoney(manageFinancials.pendingToCollect)})`
            : 'Cobro por transferencia registrado',
        description:
          paymentMethod === 'efectivo'
            ? 'Registrado en tu caja individual de estación para tu corte semanal.'
            : 'Comprobante digital enviado al chat de Janeth en la App.',
      });
    } catch (err: any) {
      playSmartChime('alert');
      toast({
        variant: 'destructive',
        title: 'No se pudo completar el cobro',
        description: err?.message || 'Intenta nuevamente.',
      });
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const handleCancelTerminalAttempt = async () => {
    if (terminalUnsubRef.current) {
      terminalUnsubRef.current();
      terminalUnsubRef.current = null;
    }
    if (waitingTerminalSaleId) {
      await revertPendingSmartTerminalSale(db, waitingTerminalSaleId);
      setWaitingTerminalSaleId(null);
    }
    setIsSubmittingSale(false);
  };

  // Reportar Inasistencia / Cancelación Antifraude (Requiere código de 4 dígitos + alerta a cliente en App)
  const handleConfirmAuthorizedNoShow = async () => {
    if (!resForNoShow || !activeBarber || !currentLocal) return;
    setIsSubmittingNoShow(true);
    try {
      const authRes = await validateAndConsumeAuthCode({
        db,
        code: noShowAuthCode,
        requiredPermission: 'reserves',
        userId: activeBarber.userId || user?.uid || activeBarber.id,
        userName: activeBarber.name,
        userRole: 'Barbero / Estación',
        localId: activeLocalId,
        operationDescription: `Marcar cita de las ${resForNoShow.hora_inicio} como ${noShowReason} desde Estación`,
        moduleLabel: 'Estación Antifraude',
      });

      if (!authRes.valid) {
        playSmartChime('alert');
        toast({
          variant: 'destructive',
          title: 'Código de autorización inválido',
          description: authRes.error || 'Solicita un código temporal de 4 dígitos a Administración.',
        });
        return;
      }

      await updateDoc(doc(db, 'reservas', resForNoShow.id), {
        estado: noShowReason,
        cancelado_por_barbero_id: activeBarber.id,
        codigo_autorizacion_usado: noShowAuthCode.trim(),
        cancelado_en: serverTimestamp(),
      });

      const clientObj =
        clients.find((c) => c.id === resForNoShow.cliente_id) || resForNoShow.customer;

      if (clientObj) {
        await notifyClientNoShowAntiFraudInApp({
          db,
          client: clientObj,
          localName: currentLocal.name,
          barberName: activeBarber.publicName || activeBarber.name,
          horaInicio: resForNoShow.hora_inicio,
          reasonLabel: noShowReason === 'No asiste' ? 'No asistió' : 'Cancelada',
          reservationId: resForNoShow.id,
        });
      }

      await logAuditAction({
        action: 'CITA_INASISTENCIA_ESTACION',
        details: `${activeBarber.name} marcó "${noShowReason}" en cita de ${clientObj?.nombre || 'Cliente'} (${resForNoShow.hora_inicio}) con código autorizado y se envió verificación automática a la App del cliente.`,
        userId: activeBarber.id,
        userName: activeBarber.name,
        userRole: 'Barbero',
        authCode: noShowAuthCode.trim(),
        severity: 'warning',
        entityId: resForNoShow.id,
        localId: activeLocalId,
      });

      setNoShowAuthCode('');
      setResForNoShow(null);
      toast({
        title: `Cita marcada como "${noShowReason}"`,
        description: 'Se envió mensaje automático de confirmación al cliente en la App.',
      });
    } finally {
      setIsSubmittingNoShow(false);
    }
  };

  const handleVerifyAdminExit = async () => {
    setIsVerifyingExit(true);
    try {
      const res = await validateAndConsumeAuthCode({
        db,
        code: adminExitCode,
        requiredPermission: 'any',
        userId: user?.uid || 'estacion',
        userName: user?.displayName || 'Admin Estación',
        userRole: user?.role,
        localId: activeLocalId,
        operationDescription: 'Salir de modo Estación al panel administrativo',
        moduleLabel: 'Estación Sin Recepcionista',
      });
      if (!res.valid) {
        toast({ variant: 'destructive', title: 'Código inválido', description: res.error });
        return;
      }
      setAdminExitCode('');
      setIsAdminExitOpen(false);
      router.push('/settings/locales');
    } finally {
      setIsVerifyingExit(false);
    }
  };

  // Guardia de aislamiento si la sucursal NO tiene activado el interruptor
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
                <h1 className="text-base font-bold text-white">
                  Modo Estación Desactivado en {currentLocal.name}
                </h1>
                <p className="text-xs text-slate-300">
                  Esta sucursal opera de manera tradicional con recepcionista.
                </p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-300">
              Activa el interruptor <strong className="text-white">Sucursal Automatizada (Sin Recepcionista)</strong> únicamente en el local correspondiente desde Configuración → Locales.
            </p>
            {smartLocals.length > 0 && (
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
                    <span>{sl.name}</span>
                    <span className="text-blue-400 font-semibold">Abrir Estación →</span>
                  </Button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="alfa" size="sm" onClick={() => router.push('/settings/locales')} className="h-9 px-4 text-xs font-semibold">
                Ir a Locales
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070D1B] via-[#0B1426] to-[#060B16] text-white flex flex-col select-none">
      {/* CABECERA COMPACTA DE MINI-TABLET DE ESTACIÓN */}
      <header className="relative overflow-hidden bg-gradient-to-r from-[#0d1426] via-[#17223d] to-[#0d1426] border-b border-slate-800 px-3.5 sm:px-6 py-2.5 shrink-0">
        <div className="header-light-beam absolute inset-0 pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between gap-3 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <Scissors className="h-5 w-5 text-[#C5A880] shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-black tracking-wide text-white">
                  ESTACIÓN VATOS ALFA
                </span>
                {currentLocal && (
                  <Badge
                    variant="outline"
                    className="border-blue-500/40 bg-blue-500/10 text-blue-300 text-[10px] font-sans font-semibold px-2 py-0"
                  >
                    <MapPin className="h-2.5 w-2.5 text-blue-400 mr-1" />
                    {currentLocal.name}
                  </Badge>
                )}
              </div>
              {activeBarber && (
                <p className="text-[11px] text-slate-300 truncate">
                  Barbero activo: <strong className="text-white">{activeBarber.name}</strong>
                  {activeBarber.numeroEstacion ? ` • Estación ${activeBarber.numeroEstacion}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAppQrModalOpen(true)}
              className="h-8 px-2.5 rounded-lg border-[#C5A880]/40 bg-[#141d34] text-[#C5A880] text-xs font-semibold gap-1.5"
              title="Mostrar QR de la App al cliente"
            >
              <QrCode className="h-3.5 w-3.5 text-[#C5A880]" />
              <span className="hidden sm:inline">QR App</span>
            </Button>

            {activeBarber && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCashDrawerOpen(true)}
                  className="h-8 px-2.5 rounded-lg border-blue-500/40 bg-[#141e38] text-white text-xs font-semibold gap-1.5 font-sans"
                >
                  <Wallet className="h-3.5 w-3.5 text-blue-400" />
                  <span>Mi Caja: ${formatMoney(myShiftSummary.cashCollectedSales)}</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUnlockedBarberId(null)}
                  className="h-8 px-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-xs gap-1"
                  title="Bloquear mi estación / Cambiar barbero"
                >
                  <LogOut className="h-3.5 w-3.5 text-slate-400" />
                  <span className="hidden md:inline">Bloquear</span>
                </Button>
              </>
            )}

            <span className="text-xs sm:text-sm font-bold text-white font-sans pl-2 border-l border-slate-800">
              {format(currentTime, 'HH:mm')}
            </span>

            <button
              type="button"
              onClick={() => setIsAdminExitOpen(true)}
              className="h-8 w-8 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 flex items-center justify-center"
              title="Salida administrativa"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* CUERPO PRINCIPAL DE ESTACIÓN */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3.5 sm:p-5 overflow-y-auto scrollbar-thin flex flex-col gap-4">
        {/* ==================== SELECCIÓN DE BARBERO Y DESBLOQUEO PIN ==================== */}
        {!activeBarber ? (
          <div className="max-w-3xl w-full mx-auto my-auto space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-white">
                Selecciona tu Estación para Iniciar Turno
              </h1>
              <p className="text-xs text-slate-400">
                Cada estación es individual y está protegida con tu PIN personal de 4 dígitos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {branchProfessionals.map((prof) => {
                const waitingCount = todayReservations.filter(
                  (r) => r.barbero_id === prof.id && r.estado === 'En espera'
                ).length;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => {
                      setPendingLoginBarber(prof);
                      setPinInput('');
                      setNewPinToSave('');
                    }}
                    className="rounded-2xl border-2 border-slate-800 hover:border-blue-500 bg-[#10172b] hover:bg-[#15203c] p-5 text-left transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border border-slate-700">
                        <AvatarImage src={prof.avatarUrl} alt={prof.name} />
                        <AvatarFallback className="bg-[#202A49] text-white font-bold">
                          {prof.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{prof.name}</p>
                        <p className="text-xs text-slate-400 font-sans">
                          {prof.numeroEstacion ? `Estación ${prof.numeroEstacion}` : 'Estación Individual'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                      {waitingCount > 0 ? (
                        <span className="text-blue-400 font-bold flex items-center gap-1.5 font-sans">
                          <BellRing className="h-3.5 w-3.5 text-blue-400" />
                          {waitingCount} en espera
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                          Ingresar PIN
                        </span>
                      )}
                      <span className="text-blue-400 font-semibold">Abrir →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* ==================== PANEL OPERATIVO DE LA ESTACIÓN DEL BARBERO ==================== */
          <>
            {/* ALERTA EN VIVO DE CLIENTES EN SALA DE ESPERA */}
            {waitingInLoungeList.length > 0 && (
              <div className="rounded-2xl border-2 border-blue-500 bg-gradient-to-r from-[#132347] via-[#192e5c] to-[#122040] p-3.5 sm:p-4 shadow-[0_8px_28px_rgba(59,130,246,0.25)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-blue-300 animate-pulse" />
                    ¡TIENES {waitingInLoungeList.length}{' '}
                    {waitingInLoungeList.length === 1 ? 'CLIENTE EN SALA DE ESPERA' : 'CLIENTES EN SALA DE ESPERA'}!
                  </span>
                  <span className="text-[11px] text-blue-200 font-sans">
                    Llámalo por su nombre al pasar al sillón
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {waitingInLoungeList.map((wRes) => {
                    const cl = clients.find((c) => c.id === wRes.cliente_id) || wRes.customer;
                    const isPaid = wRes.pago_estado === 'Pagado';
                    return (
                      <div
                        key={wRes.id}
                        className="rounded-xl border border-blue-400/30 bg-[#0d162c]/90 p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white truncate">
                              {cl ? `${cl.nombre} ${cl.apellido || ''}`.trim() : 'Cliente'}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] font-sans font-semibold py-0 px-2',
                                isPaid
                                  ? 'border-blue-400/50 bg-blue-500/20 text-blue-200'
                                  : 'border-slate-600 bg-slate-800 text-slate-300'
                              )}
                            >
                              {isPaid
                                ? 'Pagado en Kiosco'
                                : `Por cobrar $${formatMoney(Number(wRes.saldo_pendiente ?? wRes.precio ?? 0))}`}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-300 truncate mt-0.5">
                            {wRes.servicio} • Turno {wRes.hora_inicio}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="alfa"
                          size="sm"
                          onClick={() => handleStartChairService(wRes)}
                          className="h-9 px-3.5 text-xs font-bold shrink-0"
                        >
                          <Play className="h-3.5 w-3.5 mr-1.5 text-white" />
                          Pasar a Sillón
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BANNER DE CLIENTE ACTUALMENTE EN SILLÓN (REGLA DE TRANSPARENCIA FRENTE AL ESPEJO) */}
            {activeInChairRes && (() => {
              const chairClient =
                clients.find((c) => c.id === activeInChairRes.cliente_id) || activeInChairRes.customer;
              const startedHour = formatTimestampHour(activeInChairRes.hora_inicio_atencion);
              const isPaidKiosk = activeInChairRes.pago_estado === 'Pagado';

              return (
                <div className="rounded-2xl border-2 border-[#C5A880] bg-gradient-to-r from-[#131d36] via-[#192646] to-[#11192e] p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="border-[#C5A880]/60 bg-[#C5A880]/15 text-[#C5A880] text-[11px] font-sans font-bold"
                      >
                        EN ATENCIÓN EN SILLÓN {startedHour ? `• Inicio ${startedHour}` : ''}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-blue-500/40 bg-blue-500/10 text-blue-300 text-[11px] font-sans"
                      >
                        {isPaidKiosk ? 'Pagado en Kiosco' : 'Pendiente de cobro al cerrar'}
                      </Badge>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                      Atendiendo a:{' '}
                      {chairClient
                        ? `${chairClient.nombre} ${chairClient.apellido || ''}`.trim()
                        : 'Cliente Registrado'}
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-300 font-sans">
                      {activeInChairRes.servicio} • Total actual: $
                      {formatMoney(Number(activeInChairRes.precio ?? activeInChairRes.total ?? 0))} MXN
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <Button
                      type="button"
                      variant="alfa"
                      onClick={() => openManageReservationModal(activeInChairRes)}
                      className="h-11 px-5 text-xs sm:text-sm font-bold"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2 text-white" />
                      Extras / Finalizar y Cobrar
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* AGENDA COMPACTA DE HOY DEL BARBERO */}
            <div className="rounded-2xl border border-slate-800 bg-[#0f1629] overflow-hidden flex-1 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-[#131c34]">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    Mis Citas y Turnos de Hoy ({myReservations.length})
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-sans">
                  Completados hoy: <strong className="text-white">{myShiftSummary.completedCuts}</strong>
                </span>
              </div>

              <div className="divide-y divide-slate-800/70 overflow-y-auto scrollbar-thin">
                {myReservations.length === 0 ? (
                  <div className="py-14 text-center space-y-2">
                    <Scissors className="h-7 w-7 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      Aún no tienes citas registradas hoy. Cuando un cliente se anote en el Kiosco o en la App, aparecerá aquí al instante.
                    </p>
                  </div>
                ) : (
                  myReservations.map((res) => {
                    const cl = clients.find((c) => c.id === res.cliente_id) || res.customer;
                    const st = String(res.estado || '');
                    const isCancelledOrNoShow =
                      st === 'Cancelado' || st === 'Cancelada' || st === 'No asiste';
                    const isDone = st === 'Asiste';
                    const isPaid = res.pago_estado === 'Pagado';
                    const hasApp = isClientWithApp(cl);

                    return (
                      <div
                        key={res.id}
                        className={cn(
                          'p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors',
                          isDone || isCancelledOrNoShow ? 'opacity-60 bg-[#0b101f]' : 'hover:bg-white/[0.03]'
                        )}
                      >
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <div className="text-left min-w-[62px] shrink-0">
                            <span className="text-sm font-bold text-white font-sans block">
                              {res.hora_inicio}
                            </span>
                            <span className="text-[11px] text-slate-400 font-sans">{res.hora_fin}</span>
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white truncate">
                                {cl ? `${cl.nombre} ${cl.apellido || ''}`.trim() : 'Cliente'}
                              </span>
                              {hasApp && (
                                <Badge
                                  variant="outline"
                                  className="border-[#C5A880]/40 bg-[#C5A880]/10 text-[#C5A880] text-[10px] font-sans py-0 px-1.5"
                                >
                                  <Smartphone className="h-2.5 w-2.5 text-[#C5A880] mr-1" />
                                  App Pase Alfa
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-sans font-medium py-0 px-2',
                                  st === 'En atención'
                                    ? 'border-[#C5A880]/50 text-[#C5A880] bg-[#C5A880]/10'
                                    : st === 'En espera'
                                    ? 'border-blue-400/50 text-blue-300 bg-blue-500/15'
                                    : isDone
                                    ? 'border-slate-700 text-slate-300 bg-slate-800/60'
                                    : isCancelledOrNoShow
                                    ? 'border-red-500/30 text-red-400 bg-red-500/10'
                                    : 'border-slate-700 text-slate-400'
                                )}
                              >
                                {st}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-300 truncate font-sans">
                              {res.servicio} •{' '}
                              <strong className="text-white">
                                ${formatMoney(Number(res.precio ?? res.total ?? 0))}
                              </strong>{' '}
                              • {isPaid ? 'Pagado' : 'Por cobrar'} • Tel: {maskPhoneForStation(cl?.telefono)}
                            </p>
                          </div>
                        </div>

                        {!isDone && !isCancelledOrNoShow && (
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            {st !== 'En atención' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleStartChairService(res)}
                                className="h-8 px-3 rounded-lg border-blue-500/40 bg-[#15203c] text-blue-300 hover:text-white text-xs font-semibold gap-1.5"
                              >
                                <Play className="h-3.5 w-3.5 text-blue-400" />
                                Iniciar Corte
                              </Button>
                            )}

                            <Button
                              type="button"
                              variant="alfa"
                              size="sm"
                              onClick={() => openManageReservationModal(res)}
                              className="h-8 px-3 text-xs font-semibold"
                            >
                              {isPaid ? 'Extras / Cerrar' : 'Cobrar / Extras'}
                            </Button>

                            {!isPaid && (
                              <button
                                type="button"
                                onClick={() => {
                                  setResForNoShow(res);
                                  setNoShowReason('No asiste');
                                  setNoShowAuthCode('');
                                }}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center transition-colors"
                                title="Reportar No Asistió / Cancelar (Requiere código)"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ==================== MODAL PIN DE ACCESO A ESTACIÓN ==================== */}
      <Dialog
        open={Boolean(pendingLoginBarber)}
        onOpenChange={(open) => !open && setPendingLoginBarber(null)}
      >
        <DialogContent
          hideCloseButton={true}
          className="max-w-sm p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-blue-400" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  Desbloquear Estación — {pendingLoginBarber?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  {pendingLoginBarber?.pinEstacion
                    ? 'Ingresa tu PIN personal de 4 dígitos'
                    : 'Ingresa código de autorización para asignar tu PIN'}
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingLoginBarber(null)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="h-12 rounded-xl border border-slate-700 bg-[#090f1d] flex items-center justify-center">
              <span className="text-2xl font-bold tracking-[0.5em] font-mono text-white">
                {pinInput ? '•'.repeat(pinInput.length) : '••••'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pinInput.length < 6 && setPinInput((p) => p + d)}
                  className="h-12 rounded-xl border border-slate-700 bg-[#16213c] hover:bg-[#1e2d52] text-lg font-bold text-white font-sans"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="h-12 rounded-xl border border-slate-800 bg-[#11192e] text-xs font-semibold text-slate-400"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => pinInput.length < 6 && setPinInput((p) => p + '0')}
                className="h-12 rounded-xl border border-slate-700 bg-[#16213c] hover:bg-[#1e2d52] text-lg font-bold text-white font-sans"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput((p) => p.slice(0, -1))}
                className="h-12 rounded-xl border border-slate-800 bg-[#11192e] flex items-center justify-center"
              >
                <Delete className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {!pendingLoginBarber?.pinEstacion && (
              <div className="space-y-1 pt-2 border-t border-slate-800">
                <Label className="text-[11px] text-slate-300">
                  Nuevo PIN personal de 4 dígitos para este barbero (opcional):
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Ej. 4829"
                  value={newPinToSave}
                  onChange={(e) => setNewPinToSave(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="h-9 text-xs font-mono tracking-widest bg-[#090f1d] border-slate-700 text-white"
                />
              </div>
            )}

            <Button
              type="button"
              variant="alfa"
              disabled={isVerifyingPin || pinInput.length < 4}
              onClick={handleUnlockBarberStation}
              className="w-full h-10 text-xs font-bold"
            >
              {isVerifyingPin && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Entrar a mi Estación
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL DE CUENTA / EXTRAS / CANDADO ANTIFRAUDE ==================== */}
      <Dialog
        open={Boolean(selectedResForManage) && !isCheckoutOpen}
        onOpenChange={(open) => !open && setSelectedResForManage(null)}
      >
        <DialogContent
          hideCloseButton={true}
          className="max-w-xl p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <Scissors className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Cuenta del Servicio en Estación
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Los servicios elegidos en Kiosco/App están protegidos contra bajas de precio
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedResForManage(null)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
            {/* Lista de conceptos */}
            <div className="space-y-2">
              {draftItems.map((item) => (
                <div
                  key={item.uid}
                  className="rounded-xl border border-slate-800 bg-[#0b1222] p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-white">{item.nombre}</span>
                      {item.pagado_en_kiosco ? (
                        <Badge
                          variant="outline"
                          className="border-blue-500/40 bg-blue-500/15 text-blue-300 text-[10px] font-sans py-0 px-1.5"
                        >
                          <Check className="h-2.5 w-2.5 text-blue-400 mr-1" />
                          Pagado en Kiosco
                        </Badge>
                      ) : item.isLockedOriginal && !itemsUnlockedByAdmin ? (
                        <Badge
                          variant="outline"
                          className="border-slate-700 bg-slate-800/80 text-slate-300 text-[10px] font-sans py-0 px-1.5"
                        >
                          <Lock className="h-2.5 w-2.5 text-slate-400 mr-1" />
                          Protegido
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-[#C5A880]/40 bg-[#C5A880]/10 text-[#C5A880] text-[10px] font-sans py-0 px-1.5"
                        >
                          Extra agregado
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 capitalize">{item.tipo}</span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs sm:text-sm font-semibold text-white font-sans">
                      ${formatMoney(item.precio * item.cantidad)}
                    </span>
                    {!item.pagado_en_kiosco && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftItem(item.uid)}
                        className="text-slate-400 hover:text-red-400 p-1 transition-colors"
                        title={
                          item.isLockedOriginal && !itemsUnlockedByAdmin
                            ? 'Requiere código de autorización para retirar'
                            : 'Quitar concepto extra'
                        }
                      >
                        {item.isLockedOriginal && !itemsUnlockedByAdmin ? (
                          <Unlock className="h-4 w-4 text-slate-500" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Botón para agregar servicio extra o producto */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddCatalogOpen(true)}
              className="w-full h-10 rounded-xl border-dashed border-blue-500/50 bg-[#141f3a] hover:bg-[#1a284b] text-blue-300 text-xs font-bold gap-2"
            >
              <Plus className="h-4 w-4 text-blue-400" />
              Agregar Servicio Extra o Producto (Barba, Ceja, Cera...)
            </Button>

            {/* Resumen económico */}
            <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-3.5 space-y-1.5 font-sans">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Valor total de la cita:</span>
                <span className="font-semibold text-white">${formatMoney(manageFinancials.fullSubtotal)}</span>
              </div>
              {manageFinancials.paidPreviously > 0 && (
                <div className="flex justify-between text-xs text-blue-400">
                  <span>Pagado previamente (Kiosco / En línea):</span>
                  <span>-${formatMoney(manageFinancials.paidPreviously)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-white pt-1.5 border-t border-slate-800">
                <span>Saldo pendiente por cobrar ahora:</span>
                <span>${formatMoney(manageFinancials.pendingToCollect)} MXN</span>
              </div>
            </div>

            {/* Acción principal según exista o no saldo pendiente */}
            {manageFinancials.pendingToCollect <= 0 ? (
              <Button
                type="button"
                variant="alfa"
                disabled={isSubmittingSale}
                onClick={handleCompleteAlreadyPaidReservation}
                className="w-full h-11 text-xs sm:text-sm font-bold"
              >
                {isSubmittingSale ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2 text-white" />
                )}
                Finalizar Corte (Pagado en Kiosco)
              </Button>
            ) : (
              <Button
                type="button"
                variant="alfa"
                onClick={() => {
                  setPaymentMethod(activeTerminalId ? 'mercadopago' : 'efectivo');
                  setIsCheckoutOpen(true);
                }}
                className="w-full h-11 text-xs sm:text-sm font-bold"
              >
                Continuar a Cobrar ${formatMoney(manageFinancials.pendingToCollect)} MXN →
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL CATÁLOGO RÁPIDO PARA AGREGAR EXTRA / PRODUCTO ==================== */}
      <Dialog open={isAddCatalogOpen} onOpenChange={setIsAddCatalogOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-lg p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <ShoppingBag className="h-4 w-4 text-slate-300" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  Agregar Extra o Producto
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Suma servicios adicionales o productos con stock disponible
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAddCatalogOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCatalogTab('servicios')}
                className={cn(
                  'h-9 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5',
                  catalogTab === 'servicios'
                    ? 'border-blue-500 bg-[#202A49] text-white'
                    : 'border-slate-800 bg-[#0b1222] text-slate-400'
                )}
              >
                <Scissors className="h-3.5 w-3.5 text-slate-300" />
                Servicios
              </button>
              <button
                type="button"
                onClick={() => setCatalogTab('productos')}
                className={cn(
                  'h-9 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5',
                  catalogTab === 'productos'
                    ? 'border-blue-500 bg-[#202A49] text-white'
                    : 'border-slate-800 bg-[#0b1222] text-slate-400'
                )}
              >
                <ShoppingBag className="h-3.5 w-3.5 text-slate-300" />
                Productos
              </button>
            </div>

            <Input
              placeholder="Buscar..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="h-9 text-xs bg-[#090f1d] border-slate-700 text-white"
            />

            <div className="max-h-72 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
              {catalogTab === 'servicios'
                ? allServices
                    .filter(
                      (s) =>
                        s.active &&
                        s.name.toLowerCase().includes(catalogSearch.toLowerCase())
                    )
                    .map((srv) => (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => handleAddExtraItem(srv, 'servicio')}
                        className="w-full text-left rounded-xl border border-slate-800 hover:border-blue-500 bg-[#0b1222] p-3 flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-white">{srv.name}</span>
                        <span className="font-semibold text-white font-sans shrink-0">
                          ${formatMoney(srv.price)}
                        </span>
                      </button>
                    ))
                : allProducts
                    .filter(
                      (p) =>
                        p.active &&
                        p.stock > 0 &&
                        p.nombre.toLowerCase().includes(catalogSearch.toLowerCase())
                    )
                    .map((prd) => (
                      <button
                        key={prd.id}
                        type="button"
                        onClick={() => handleAddExtraItem(prd, 'producto')}
                        className="w-full text-left rounded-xl border border-slate-800 hover:border-blue-500 bg-[#0b1222] p-3 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-semibold text-white block">{prd.nombre}</span>
                          <span className="text-[10px] text-slate-400 font-sans">
                            Stock disponible: {prd.stock}
                          </span>
                        </div>
                        <span className="font-semibold text-white font-sans shrink-0">
                          ${formatMoney(prd.public_price)}
                        </span>
                      </button>
                    ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL DE COBRO EN ESTACIÓN ==================== */}
      <Dialog
        open={isCheckoutOpen}
        onOpenChange={(open) => {
          if (!open && !waitingTerminalSaleId) setIsCheckoutOpen(false);
        }}
      >
        <DialogContent
          hideCloseButton={true}
          className="max-w-lg p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <CreditCard className="h-5 w-5 text-blue-400" />
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Cobrar en Estación
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Saldo por cobrar: ${formatMoney(manageFinancials.pendingToCollect)} MXN
                </DialogDescription>
              </div>
            </div>
            {!waitingTerminalSaleId && (
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {waitingTerminalSaleId ? (
            <div className="p-6 text-center space-y-4">
              <Loader2 className="h-10 w-10 text-blue-400 animate-spin mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  Esperando Pago en Terminal Point Smart...
                </h3>
                <p className="text-xs text-slate-300 font-sans">
                  Monto enviado: $
                  {formatMoney(manageFinancials.pendingToCollect + effectiveStationTip)} MXN
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelTerminalAttempt}
                className="border-slate-700 text-slate-300 text-xs h-9"
              >
                Cancelar envío a terminal
              </Button>
            </div>
          ) : (
            <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto scrollbar-thin">
              {/* Selector de método */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mercadopago')}
                  className={cn(
                    'p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all',
                    paymentMethod === 'mercadopago'
                      ? 'border-blue-500 bg-[#202A49] text-white'
                      : 'border-slate-800 bg-[#0b1222] text-slate-400'
                  )}
                >
                  <CreditCard className="h-4 w-4 text-blue-400" />
                  <span>Terminal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('efectivo')}
                  className={cn(
                    'p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all',
                    paymentMethod === 'efectivo'
                      ? 'border-blue-500 bg-[#202A49] text-white'
                      : 'border-slate-800 bg-[#0b1222] text-slate-400'
                  )}
                >
                  <Banknote className="h-4 w-4 text-slate-300" />
                  <span>Efectivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transferencia')}
                  className={cn(
                    'p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all',
                    paymentMethod === 'transferencia'
                      ? 'border-blue-500 bg-[#202A49] text-white'
                      : 'border-slate-800 bg-[#0b1222] text-slate-400'
                  )}
                >
                  <Building2 className="h-4 w-4 text-slate-300" />
                  <span>SPEI</span>
                </button>
              </div>

              {/* Propina */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-[#C5A880]" />
                  Propina del cliente (opcional)
                </Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {TIP_PRESETS.map((amt) => {
                    const active = !showCustomTip && tipAmount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setShowCustomTip(false);
                          setTipAmount(amt);
                        }}
                        className={cn(
                          'h-8 rounded-lg border text-[11px] font-bold font-sans',
                          active
                            ? 'border-blue-500 bg-[#202A49] text-white'
                            : 'border-slate-800 bg-[#0b1222] text-slate-300'
                        )}
                      >
                        {amt === 0 ? 'No' : `+$${formatMoney(amt)}`}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowCustomTip(true)}
                    className={cn(
                      'h-8 rounded-lg border text-[11px] font-bold font-sans',
                      showCustomTip
                        ? 'border-blue-500 bg-[#202A49] text-white'
                        : 'border-slate-800 bg-[#0b1222] text-slate-300'
                    )}
                  >
                    Otro
                  </button>
                </div>
                {showCustomTip && (
                  <Input
                    type="number"
                    min="0"
                    placeholder="Propina en MXN"
                    value={customTipStr}
                    onChange={(e) => setCustomTipStr(e.target.value)}
                    className="h-8 text-xs font-sans bg-[#090f1d] border-slate-700 text-white"
                  />
                )}
              </div>

              {/* Calculadora rápida de cambio en Efectivo */}
              {paymentMethod === 'efectivo' && (
                <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold">Billete recibido (calcula cambio):</span>
                    <div className="flex gap-1.5">
                      {[200, 500, 1000].map((bill) => (
                        <button
                          key={bill}
                          type="button"
                          onClick={() => setCashReceivedStr(String(bill))}
                          className="px-2 py-0.5 rounded border border-slate-700 bg-[#141e38] text-[11px] font-sans text-slate-200 hover:text-white"
                        >
                          ${bill}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    type="number"
                    placeholder="Monto recibido del cliente en efectivo"
                    value={cashReceivedStr}
                    onChange={(e) => setCashReceivedStr(e.target.value)}
                    className="h-9 text-xs font-sans bg-[#090f1d] border-slate-700 text-white"
                  />
                  {Number(cashReceivedStr) >= manageFinancials.pendingToCollect + effectiveStationTip && (
                    <div className="flex items-center justify-between text-xs font-bold text-blue-400 font-sans pt-1">
                      <span>Cambio a devolver de tu caja:</span>
                      <span>
                        $
                        {formatMoney(
                          Number(cashReceivedStr) -
                            (manageFinancials.pendingToCollect + effectiveStationTip)
                        )}{' '}
                        MXN
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">
                    El importe del servicio (${formatMoney(manageFinancials.pendingToCollect)}) quedará registrado en tu caja individual para tu corte semanal.
                  </p>
                </div>
              )}

              {/* Datos SPEI */}
              {paymentMethod === 'transferencia' && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 space-y-1 text-xs font-sans">
                  <p className="font-bold text-white">Datos Oficiales para Transferencia SPEI:</p>
                  <p className="text-slate-300">Banco: {bankInfo.bank || 'Configurar en Ajustes → Pagos'}</p>
                  <p className="text-slate-300">Beneficiario: {bankInfo.accountHolder || 'VATOS ALFA'}</p>
                  <p className="text-blue-300 font-bold">CLABE: {bankInfo.clabe || 'Sin configurar'}</p>
                  <p className="text-[10px] text-slate-400 pt-1">
                    Verifica en la pantalla del cliente que la transferencia haya sido enviada antes de confirmar.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-800 font-sans">
                <span className="text-xs text-slate-300">Total con propina:</span>
                <span className="text-xl font-black text-white">
                  ${formatMoney(manageFinancials.pendingToCollect + effectiveStationTip)} MXN
                </span>
              </div>

              <Button
                type="button"
                variant="alfa"
                disabled={isSubmittingSale}
                onClick={handleExecuteStationPayment}
                className="w-full h-11 text-xs sm:text-sm font-bold"
              >
                {isSubmittingSale && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {paymentMethod === 'mercadopago'
                  ? 'Enviar Cobro a Terminal Point Smart'
                  : paymentMethod === 'efectivo'
                  ? 'Confirmar Efectivo Recibido y Cerrar'
                  : 'Confirmar Transferencia Verificada y Cerrar'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL DESBLOQUEO ANTIFRAUDE DE SERVICIO ORIGINAL ==================== */}
      <Dialog open={isUnlockItemsOpen} onOpenChange={setIsUnlockItemsOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-sm p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4 text-slate-300" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  Servicio Protegido
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Requiere código de 4 dígitos para retirar o bajar un servicio
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsUnlockItemsOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-slate-300">
              Para agregar servicios extras usa el botón <strong className="text-white">Agregar Extra</strong>. Si el cliente se equivocó al elegir su corte en el Kiosco, solicita un código temporal a Administración.
            </p>
            <Input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={unlockAuthCode}
              onChange={(e) => setUnlockAuthCode(e.target.value)}
              className="h-10 text-center tracking-widest font-mono bg-[#090f1d] border-slate-700 text-white"
            />
            <Button
              type="button"
              variant="alfa"
              disabled={isValidatingUnlock || !unlockAuthCode}
              onClick={handleConfirmUnlockOriginalItems}
              className="w-full h-9 text-xs font-bold"
            >
              {isValidatingUnlock && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Autorizar Ajuste
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL ANTIFRAUDE PARA INASISTENCIA / CANCELACIÓN ==================== */}
      <Dialog open={Boolean(resForNoShow)} onOpenChange={(open) => !open && setResForNoShow(null)}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-md p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  Autorización de Inasistencia / Cancelación
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Notifica automáticamente al cliente en su App VATOS ALFA
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setResForNoShow(null)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNoShowReason('No asiste')}
                className={cn(
                  'h-9 rounded-xl border text-xs font-bold',
                  noShowReason === 'No asiste'
                    ? 'border-blue-500 bg-[#202A49] text-white'
                    : 'border-slate-800 bg-[#0b1222] text-slate-400'
                )}
              >
                No asistió
              </button>
              <button
                type="button"
                onClick={() => setNoShowReason('Cancelada')}
                className={cn(
                  'h-9 rounded-xl border text-xs font-bold',
                  noShowReason === 'Cancelada'
                    ? 'border-blue-500 bg-[#202A49] text-white'
                    : 'border-slate-800 bg-[#0b1222] text-slate-400'
                )}
              >
                Cancelada
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Ingresa el código temporal de 4 dígitos proporcionado por Administración. Al confirmar, Janeth enviará una verificación automática al chat del cliente en la App.
            </p>

            <Input
              type="password"
              inputMode="numeric"
              placeholder="Código de 4 dígitos"
              value={noShowAuthCode}
              onChange={(e) => setNoShowAuthCode(e.target.value)}
              className="h-10 text-center tracking-widest font-mono bg-[#090f1d] border-slate-700 text-white"
            />

            <Button
              type="button"
              variant="alfa"
              disabled={isSubmittingNoShow || !noShowAuthCode}
              onClick={handleConfirmAuthorizedNoShow}
              className="w-full h-10 text-xs font-bold"
            >
              {isSubmittingNoShow && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar con Código y Notificar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL MI CAJA INDIVIDUAL Y COMISIONES DE HOY ==================== */}
      <Dialog open={isCashDrawerOpen} onOpenChange={setIsCashDrawerOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-md p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <Wallet className="h-5 w-5 text-blue-400" />
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Mi Caja de Estación — {activeBarber?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Resumen individual en tiempo real (Hoy)
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCashDrawerOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-3.5 font-sans">
            <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Fondo fijo base bajo llave:</span>
                <span className="font-semibold text-white">${formatMoney(myShiftSummary.baseFloat)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>(+) Efectivo de ventas cobrado hoy:</span>
                <span className="font-semibold text-white">
                  ${formatMoney(myShiftSummary.cashCollectedSales)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-blue-300 pt-2 border-t border-slate-800">
                <span>Efectivo físico que debe haber en tu cajón:</span>
                <span>${formatMoney(myShiftSummary.physicalDrawerTotal)} MXN</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Comisiones generadas hoy:</span>
                <span className="font-semibold text-white">
                  ${formatMoney(myShiftSummary.estimatedCommission)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>(+) Propinas en tarjeta hoy:</span>
                <span className="font-semibold text-white">
                  ${formatMoney(myShiftSummary.cardTipsEarned)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>(-) Efectivo ya en tu estación (a descontar):</span>
                <span>-${formatMoney(myShiftSummary.cashCollectedSales)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-800">
                <span className="text-white">Balance neto hoy:</span>
                <span
                  className={cn(
                    myShiftSummary.netBalanceForBarber >= 0 ? 'text-blue-400' : 'text-red-400'
                  )}
                >
                  {myShiftSummary.netBalanceForBarber >= 0
                    ? `+$${formatMoney(myShiftSummary.netBalanceForBarber)} a tu favor`
                    : `-$${formatMoney(Math.abs(myShiftSummary.netBalanceForBarber))} por entregar`}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Tu fondo fijo de ${formatMoney(myShiftSummary.baseFloat)} permanece siempre en tu estación para dar cambio. Todo el efectivo de ventas cobrado se descuenta automáticamente en tu pago semanal de nómina.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL QR APP PARA MOSTRAR AL CLIENTE ==================== */}
      <Dialog open={isAppQrModalOpen} onOpenChange={setIsAppQrModalOpen}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-md p-0 overflow-hidden rounded-2xl border-2 border-blue-500 bg-[#10172b] text-white shadow-2xl"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="relative z-10 flex items-center gap-2.5">
              <Award className="h-5 w-5 text-[#C5A880]" />
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  Invita a tu Cliente a la App VATOS ALFA
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Para que reciba su ticket digital y hable con Janeth
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAppQrModalOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-3 space-y-2">
              <span className="text-xs font-bold text-white block">Google Play</span>
              {appLinks.playStoreUrl ? (
                <img
                  src={getQrImageUrl(appLinks.playStoreUrl, 150)}
                  alt="Google Play QR"
                  className="h-32 w-32 mx-auto rounded-lg bg-white p-1"
                />
              ) : (
                <p className="text-[11px] text-slate-400 py-8">VATOS ALFA en Play Store</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-800 bg-[#0b1222] p-3 space-y-2">
              <span className="text-xs font-bold text-white block">App Store</span>
              {appLinks.appStoreUrl ? (
                <img
                  src={getQrImageUrl(appLinks.appStoreUrl, 150)}
                  alt="App Store QR"
                  className="h-32 w-32 mx-auto rounded-lg bg-white p-1"
                />
              ) : (
                <p className="text-[11px] text-slate-400 py-8">VATOS ALFA en App Store</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL SALIDA ADMINISTRATIVA ==================== */}
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
                <DialogTitle className="text-sm font-bold text-white">Salir de Modo Estación</DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Requiere código administrativo
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAdminExitOpen(false)}
              className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={adminExitCode}
              onChange={(e) => setAdminExitCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyAdminExit()}
              className="h-10 text-center tracking-widest font-mono bg-[#090f1d] border-slate-700 text-white"
            />
            <Button
              type="button"
              variant="alfa"
              disabled={isVerifyingExit || !adminExitCode}
              onClick={handleVerifyAdminExit}
              className="w-full h-9 text-xs font-bold"
            >
              {isVerifyingExit && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Desbloquear y Salir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function EstacionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070D1B] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      }
    >
      <EstacionContent />
    </Suspense>
  );
}
