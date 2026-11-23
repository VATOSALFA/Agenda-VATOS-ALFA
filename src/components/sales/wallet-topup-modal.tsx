'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  Wallet,
  X,
  Banknote,
  CreditCard,
  Building2,
  Coins,
  Loader2,
  Check,
  Smartphone,
  Calculator,
} from 'lucide-react';
import { db, functions, httpsCallable } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useToast } from '@/hooks/use-toast';
import { cn, formatMoney } from '@/lib/utils';
import { isClientWithApp } from '@/lib/client-app-helper';
import {
  DEFAULT_SALDO_PASE_ALFA_CONFIG,
  getClientWalletBalance,
  normalizeSaldoPaseAlfaConfig,
  validateTopupAmountRules,
  type SaldoPaseAlfaConfig,
} from '@/lib/wallet-config';
import type { Client, Local } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClientInput } from '@/components/reservations/client-input';

export interface WalletTopupSuccessPayload {
  saleId: string;
  clientId: string;
  amount: number;
  bonusCoins: number;
  newBalance: number;
}

interface WalletTopupModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  localId?: string;
  onSuccess?: (payload: WalletTopupSuccessPayload) => void;
}

type BranchPaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia';

function formatAsUserTypes(raw: string): string {
  if (!raw) return '';
  const clean = raw.replace(/[^0-9.]/g, '');
  if (!clean) return '';

  const parts = clean.split('.');
  const integerPart = parts[0] || '';
  const decimalPart = parts.length > 1 ? parts.slice(1).join('') : null;

  let formattedInteger = '';
  if (integerPart) {
    const num = parseInt(integerPart, 10);
    formattedInteger = isNaN(num) ? '' : num.toLocaleString('es-MX');
  }

  if (decimalPart !== null) {
    return `${formattedInteger || '0'}.${decimalPart.slice(0, 2)}`;
  }
  return formattedInteger;
}

function parseCashAmount(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/,/g, '').trim();
  const parsed = parseFloat(clean);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function WalletTopupModal({
  isOpen,
  onOpenChange,
  client: initialClient = null,
  localId: propLocalId,
  onSuccess,
}: WalletTopupModalProps) {
  const { user } = useAuth();
  const { selectedLocalId } = useLocal();
  const { toast } = useToast();

  const [config, setConfig] = useState<SaldoPaseAlfaConfig>(DEFAULT_SALDO_PASE_ALFA_CONFIG);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [isProgramPaused, setIsProgramPaused] = useState(false);

  const shouldLoadClientsList = isOpen && !initialClient;
  const { data: allClients = [], loading: clientsLoading } = useFirestoreQuery<Client>(
    'clientes',
    shouldLoadClientsList ? 'wallet-topup-clients' : undefined
  );
  const { data: locales = [] } = useFirestoreQuery<Local>('locales');
  const { data: terminals = [], loading: terminalsLoading } = useFirestoreQuery<any>('terminales');

  const [pickedClientId, setPickedClientId] = useState<string>('');
  const [liveClientData, setLiveClientData] = useState<Client | null>(initialClient);

  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  const [paymentMethod, setPaymentMethod] = useState<BranchPaymentMethod>('efectivo');
  const [cashReceivedStr, setCashReceivedStr] = useState<string>('');
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>('');
  const [resolvedLocalId, setResolvedLocalId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForTerminal, setIsWaitingForTerminal] = useState(false);

  const pendingSaleIdRef = useRef<string | null>(null);
  const terminalUnsubRef = useRef<(() => void) | null>(null);

  const activeClientId = initialClient?.id || pickedClientId;

  // Resolver sucursal activa
  useEffect(() => {
    if (propLocalId && propLocalId !== 'todos') {
      setResolvedLocalId(propLocalId);
    } else if (selectedLocalId && selectedLocalId !== 'todos') {
      setResolvedLocalId(selectedLocalId);
    } else if (user?.local_id && user.local_id !== 'todos') {
      setResolvedLocalId(user.local_id);
    } else if (locales.length > 0) {
      setResolvedLocalId(locales[0].id);
    }
  }, [propLocalId, selectedLocalId, user?.local_id, locales]);

  // Seleccionar terminal principal por defecto
  useEffect(() => {
    if (!terminals || terminals.length === 0) {
      setSelectedTerminalId('');
      return;
    }
    const currentLocal = locales.find((l) => l.id === resolvedLocalId);
    const mainTerm = (currentLocal as any)?.terminal_id || (currentLocal as any)?.mainTerminalId;
    if (mainTerm && terminals.some((t: any) => t.id === mainTerm)) {
      setSelectedTerminalId(mainTerm);
    } else if (!selectedTerminalId || !terminals.some((t: any) => t.id === selectedTerminalId)) {
      setSelectedTerminalId(terminals[0].id);
    }
  }, [terminals, locales, resolvedLocalId, selectedTerminalId]);

  // Cargar configuración vigente de Saldo Pase Alfa al abrir
  useEffect(() => {
    if (!isOpen || !db) return;
    let cancelled = false;
    setIsConfigLoading(true);

    getDoc(doc(db, 'configuracion', 'pase_alfa'))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.exists() ? snap.data() || {} : {};
        const normalized = normalizeSaldoPaseAlfaConfig(data.saldo_pase_alfa_config);
        setConfig(normalized);

        const privs = Array.isArray(data.privilegios) ? data.privilegios : [];
        const saldoPriv = privs.find(
          (p: any) =>
            p?.id === 'saldo_pase_alfa' ||
            String(p?.titulo || '').toLowerCase().includes('saldo pase alfa')
        );
        setIsProgramPaused(!normalized.activo || (saldoPriv && saldoPriv.activo === false));

        const activePkgs = normalized.paquetes.filter((p) => p.activo && p.monto > 0);
        if (activePkgs.length > 0) {
          const popular =
            activePkgs.find((p) => p.monto === 1000) || activePkgs[0];
          setSelectedPackageId(popular.id);
          setIsCustomMode(false);
        } else if (normalized.permitir_monto_libre) {
          setIsCustomMode(true);
        }

        // Seleccionar primer método permitido en sucursal
        if (normalized.metodos_permitidos.efectivo_sucursal) {
          setPaymentMethod('efectivo');
        } else if (normalized.metodos_permitidos.terminal_sucursal) {
          setPaymentMethod('tarjeta');
        } else if (normalized.metodos_permitidos.transferencia_sucursal) {
          setPaymentMethod('transferencia');
        }
      })
      .catch((err) => {
        console.error('Error loading saldo_pase_alfa_config:', err);
      })
      .finally(() => {
        if (!cancelled) setIsConfigLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Escuchar en vivo el documento del cliente seleccionado
  useEffect(() => {
    if (!isOpen || !db || !activeClientId) {
      setLiveClientData(initialClient || null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'clientes', activeClientId), (snap) => {
      if (snap.exists()) {
        setLiveClientData({ id: snap.id, ...(snap.data() as any) } as Client);
      }
    });
    return () => unsub();
  }, [isOpen, activeClientId, initialClient]);

  // Limpieza de listeners de terminal al desmontar o cerrar
  const cleanupTerminalListener = () => {
    if (terminalUnsubRef.current) {
      try {
        terminalUnsubRef.current();
      } catch {}
      terminalUnsubRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      cleanupTerminalListener();
      setIsWaitingForTerminal(false);
      setIsSubmitting(false);
      setCashReceivedStr('');
      setCustomAmountStr('');
      if (!initialClient) {
        setPickedClientId('');
      }
    }
    return () => cleanupTerminalListener();
  }, [isOpen, initialClient]);

  const activePackages = useMemo(
    () => config.paquetes.filter((p) => p.activo && p.monto > 0),
    [config.paquetes]
  );

  const selectedAmount = useMemo(() => {
    if (isCustomMode) {
      const clean = customAmountStr.replace(/,/g, '');
      const parsed = parseFloat(clean);
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
    }
    const pkg = activePackages.find((p) => p.id === selectedPackageId);
    return pkg ? pkg.monto : 0;
  }, [isCustomMode, customAmountStr, activePackages, selectedPackageId]);

  const currentBalance = useMemo(
    () => getClientWalletBalance(liveClientData),
    [liveClientData]
  );

  const hasAppLinked = useMemo(
    () => isClientWithApp(liveClientData),
    [liveClientData]
  );

  const amountValidation = useMemo(
    () => validateTopupAmountRules(selectedAmount, currentBalance, config),
    [selectedAmount, currentBalance, config]
  );

  const previewBonusCoins = amountValidation.ok ? amountValidation.bonusCoins : 0;
  const previewNewBalance = Math.round((currentBalance + (amountValidation.ok ? amountValidation.cleanAmount : 0)) * 100) / 100;

  const cashReceived = parseCashAmount(cashReceivedStr);
  const cashChange = paymentMethod === 'efectivo' && cashReceived > selectedAmount
    ? Math.round((cashReceived - selectedAmount) * 100) / 100
    : 0;

  const allowedBranchMethods = useMemo(() => {
    const list: { id: BranchPaymentMethod; label: string; icon: any }[] = [];
    if (config.metodos_permitidos.efectivo_sucursal) {
      list.push({ id: 'efectivo', label: 'Efectivo', icon: Banknote });
    }
    if (config.metodos_permitidos.terminal_sucursal) {
      list.push({ id: 'tarjeta', label: 'Terminal Point', icon: CreditCard });
    }
    if (config.metodos_permitidos.transferencia_sucursal) {
      list.push({ id: 'transferencia', label: 'Transferencia', icon: Building2 });
    }
    return list;
  }, [config.metodos_permitidos]);

  const appEligibleClients = useMemo(
    () => allClients.filter((c) => isClientWithApp(c)),
    [allClients]
  );

  const cancelPendingTerminalTopup = async () => {
    const pendingId = pendingSaleIdRef.current;
    cleanupTerminalListener();
    setIsWaitingForTerminal(false);
    setIsSubmitting(false);
    if (!pendingId || !db) return;
    pendingSaleIdRef.current = null;

    try {
      await runTransaction(db, async (tx) => {
        const saleRef = doc(db, 'ventas', pendingId);
        const snap = await tx.get(saleRef);
        if (!snap.exists()) return;
        const data = snap.data() || {};
        if (data.pago_estado === 'Pagado' || data.monedero_acreditado === true) return;
        const cancelRef = doc(db, 'ventas_canceladas', pendingId);
        tx.set(cancelRef, {
          ...data,
          cancelado_en: Timestamp.now(),
          motivo_cancelacion: 'recarga_terminal_cancelada_recepcion',
        });
        tx.delete(saleRef);
      });
      toast({
        title: 'Envío cancelado',
        description: 'Se canceló la espera de pago en terminal. Recuerda cancelar en el dispositivo físico si sigue en pantalla.',
      });
    } catch (err) {
      console.error('Error cancelling pending terminal topup:', err);
    }
  };

  const handleConfirmTopup = async () => {
    if (!db || !liveClientData) return;

    if (!hasAppLinked) {
      toast({
        variant: 'destructive',
        title: 'Exclusivo Miembros App',
        description: 'El cliente debe tener su cuenta vinculada en la App Móvil VATOS ALFA para usar Saldo Pase Alfa.',
      });
      return;
    }

    if (!amountValidation.ok) {
      toast({
        variant: 'destructive',
        title: 'Monto no válido',
        description: amountValidation.error,
      });
      return;
    }

    if (!resolvedLocalId) {
      toast({
        variant: 'destructive',
        title: 'Selecciona sucursal',
        description: 'No se pudo determinar la sucursal activa para registrar el ingreso en caja.',
      });
      return;
    }

    if (paymentMethod === 'efectivo' && cashReceivedStr !== '' && cashReceived + 0.001 < amountValidation.cleanAmount) {
      toast({
        variant: 'destructive',
        title: 'Efectivo insuficiente',
        description: `El efectivo recibido ($${formatMoney(cashReceived)}) es menor al monto de recarga ($${formatMoney(amountValidation.cleanAmount)}).`,
      });
      return;
    }

    const { cleanAmount, bonusCoins } = amountValidation;
    const clientFullName = `${liveClientData.nombre || ''} ${liveClientData.apellido || ''}`.trim() || 'Cliente';
    const staffId = user?.uid || 'staff';
    const staffName = user?.displayName || (user as any)?.name || user?.email || 'Recepción';

    // FLUJO A: COBRO EN TERMINAL POINT
    if (paymentMethod === 'tarjeta') {
      if (!selectedTerminalId) {
        toast({
          variant: 'destructive',
          title: 'Selecciona una terminal',
          description: 'Elige una terminal Point activa para enviar el cobro.',
        });
        return;
      }

      setIsSubmitting(true);
      setIsWaitingForTerminal(true);

      const saleDocRef = doc(collection(db, 'ventas'));
      const tempSaleId = saleDocRef.id;
      pendingSaleIdRef.current = tempSaleId;

      try {
        await runTransaction(db, async (tx) => {
          const clientRef = doc(db, 'clientes', liveClientData.id);
          const freshClientSnap = await tx.get(clientRef);
          if (!freshClientSnap.exists()) {
            throw new Error('Cliente no encontrado en base de datos.');
          }
          const freshBalance = getClientWalletBalance(freshClientSnap.data());
          const recheck = validateTopupAmountRules(cleanAmount, freshBalance, config);
          if (!recheck.ok) {
            throw new Error(recheck.error);
          }

          tx.set(saleDocRef, {
            id: tempSaleId,
            tipo: 'recarga_monedero',
            tipo_venta: 'recarga_monedero',
            cliente_id: liveClientData.id,
            cliente_nombre: clientFullName,
            local_id: resolvedLocalId,
            metodo_pago: 'tarjeta',
            pago_estado: 'Pendiente',
            estado: 'pending',
            status: 'pending',
            origen: 'recepcion',
            subtotal: cleanAmount,
            descuento: { valor: 0, tipo: 'fixed', monto: 0 },
            total: cleanAmount,
            monto_pagado_real: cleanAmount,
            saldo_pendiente: 0,
            propina: 0,
            bono_recarga_coins: bonusCoins,
            monedero_acreditado: false,
            creado_por_id: staffId,
            creado_por_nombre: staffName,
            fecha_hora_venta: serverTimestamp(),
            creado_en: Timestamp.now(),
            detalle_pago_combinado: {
              efectivo: 0,
              tarjeta: cleanAmount,
              transferencia: 0,
              pagos_en_linea: 0,
              monedero: 0,
            },
            items: [
              {
                id: 'recarga_saldo_pase_alfa',
                nombre: bonusCoins > 0
                  ? `Recarga Saldo Pase Alfa (+${bonusCoins} Alfa Coins)`
                  : 'Recarga Saldo Pase Alfa',
                tipo: 'recarga_monedero',
                barbero_id: null,
                barbero_nombre: 'Recarga de Saldo',
                precio_unitario: cleanAmount,
                cantidad: 1,
                subtotal: cleanAmount,
                descuento: { valor: 0, tipo: 'fixed', monto: 0 },
              },
            ],
          });
        });

        const createPayment = httpsCallable(functions, 'createPointPayment');
        const result: any = await createPayment({
          amount: cleanAmount,
          terminalId: selectedTerminalId,
          referenceId: tempSaleId,
          payer: { email: liveClientData.correo || '', name: clientFullName },
        });

        if (!result?.data?.success) {
          throw new Error('No se pudo enviar la orden a la terminal Point.');
        }

        toast({
          title: 'Orden enviada a Terminal Point',
          description: `Completa el cobro por $${formatMoney(cleanAmount)} MXN en la terminal.`,
        });

        cleanupTerminalListener();
        let handledApproval = false;
        terminalUnsubRef.current = onSnapshot(saleDocRef, async (snap) => {
          if (handledApproval || !snap.exists()) return;
          const sData = snap.data() || {};
          if (sData.pago_estado === 'Pagado' || sData.mercado_pago_status === 'approved') {
            handledApproval = true;
            cleanupTerminalListener();
            pendingSaleIdRef.current = null;

            let finalBalance = previewNewBalance;
            // Fallback transaccional si el webhook aprobó pero aún no había acreditado monedero
            if (!sData.monedero_acreditado) {
              try {
                await runTransaction(db, async (tx) => {
                  const sSnap = await tx.get(saleDocRef);
                  const cRef = doc(db, 'clientes', liveClientData.id);
                  const cSnap = await tx.get(cRef);
                  if (!sSnap.exists() || !cSnap.exists()) return;
                  if (sSnap.data()?.monedero_acreditado === true) {
                    finalBalance = getClientWalletBalance(cSnap.data());
                    return;
                  }
                  const cData = cSnap.data() || {};
                  const prevBal = getClientWalletBalance(cData);
                  const nextBal = Math.round((prevBal + cleanAmount) * 100) / 100;
                  finalBalance = nextBal;
                  const prevCoins = Number(
                    cData.alfaCoins ?? cData.alfa_coins ?? cData.puntosLealtad ?? cData.puntos_lealtad ?? cData.puntos ?? 0
                  );
                  const nextCoins = prevCoins + bonusCoins;

                  tx.update(cRef, {
                    saldo_monedero: nextBal,
                    saldoMonedero: nextBal,
                    saldo_pase_alfa: nextBal,
                    total_recargado_monedero: Math.round((Number(cData.total_recargado_monedero || 0) + cleanAmount) * 100) / 100,
                    ultima_recarga_monedero: serverTimestamp(),
                    ...(bonusCoins > 0
                      ? {
                          puntos: nextCoins,
                          alfaCoins: nextCoins,
                          alfa_coins: nextCoins,
                          puntosLealtad: nextCoins,
                          puntos_lealtad: nextCoins,
                        }
                      : {}),
                    recompensa_pendiente: {
                      id: `rw_${tempSaleId}`,
                      fecha: new Date().toISOString(),
                      tipo_recompensa: 'recarga_saldo',
                      monto_recargado: cleanAmount,
                      saldo_nuevo: nextBal,
                      coins_ganadas: bonusCoins,
                      total_coins: nextCoins,
                      visto: false,
                    },
                  });

                  const movRef = doc(db, 'movimientos_monedero', `mov_${tempSaleId}`);
                  tx.set(movRef, {
                    id: `mov_${tempSaleId}`,
                    cliente_id: liveClientData.id,
                    cliente_nombre: clientFullName,
                    tipo: 'recarga',
                    es_abono: true,
                    monto: cleanAmount,
                    saldo_anterior: prevBal,
                    saldo_nuevo: nextBal,
                    bono_alfa_coins: bonusCoins,
                    metodo_pago: 'tarjeta',
                    referencia_id: tempSaleId,
                    local_id: resolvedLocalId,
                    concepto: bonusCoins > 0
                      ? `Recarga en sucursal (Terminal Point, +${bonusCoins} Alfa Coins)`
                      : 'Recarga en sucursal (Terminal Point)',
                    creado_por_id: staffId,
                    creado_por_nombre: staffName,
                    fecha: Timestamp.now(),
                  });

                  tx.update(saleDocRef, {
                    monedero_acreditado: true,
                    lealtad_aplicada: {
                      aplicado: true,
                      fecha_aplicacion: new Date().toISOString(),
                      cliente_id: liveClientData.id,
                      coins_ganados_venta: 0,
                      coins_canjeados_venta: 0,
                      descuento_coins_monto: 0,
                      sellos_sumados: 0,
                      corte_gratis_10_otorgado: false,
                      sellos_consumidos: 0,
                      visitas_pase_alfa_sumadas: 0,
                      consumo_real_sumado: 0,
                      is_wallet_topup: true,
                      topup_amount: cleanAmount,
                      topup_bonus_coins: bonusCoins,
                    },
                  });
                });
              } catch (fallbackErr) {
                console.error('Fallback wallet credit check error:', fallbackErr);
              }
            } else {
              const freshClient = await getDoc(doc(db, 'clientes', liveClientData.id));
              if (freshClient.exists()) {
                finalBalance = getClientWalletBalance(freshClient.data());
              }
            }

            setIsWaitingForTerminal(false);
            setIsSubmitting(false);
            toast({
              title: '¡Saldo Pase Alfa acreditado!',
              description: `Se abonaron $${formatMoney(cleanAmount)} MXN${bonusCoins > 0 ? ` y +${bonusCoins} Alfa Coins` : ''} a ${clientFullName}.`,
            });
            onSuccess?.({
              saleId: tempSaleId,
              clientId: liveClientData.id,
              amount: cleanAmount,
              bonusCoins,
              newBalance: finalBalance,
            });
            onOpenChange(false);
          }
        });
      } catch (err: any) {
        console.error('Error sending topup to Point terminal:', err);
        await cancelPendingTerminalTopup();
        toast({
          variant: 'destructive',
          title: 'Error en Terminal Point',
          description: err?.message || 'No se pudo enviar el cobro a la terminal.',
        });
      }
      return;
    }

    // FLUJO B: COBRO INMEDIATO EN EFECTIVO O TRANSFERENCIA EN SUCURSAL
    setIsSubmitting(true);
    try {
      const saleDocRef = doc(collection(db, 'ventas'));
      const newSaleId = saleDocRef.id;
      let committedNewBalance = previewNewBalance;

      await runTransaction(db, async (tx) => {
        const clientRef = doc(db, 'clientes', liveClientData.id);
        const freshSnap = await tx.get(clientRef);
        if (!freshSnap.exists()) {
          throw new Error('No se encontró el expediente del cliente.');
        }

        const cData = freshSnap.data() || {};
        const prevBal = getClientWalletBalance(cData);
        const recheck = validateTopupAmountRules(cleanAmount, prevBal, config);
        if (!recheck.ok) {
          throw new Error(recheck.error);
        }

        const nextBal = Math.round((prevBal + cleanAmount) * 100) / 100;
        committedNewBalance = nextBal;

        const prevCoins = Number(
          cData.alfaCoins ??
            cData.alfa_coins ??
            cData.puntosLealtad ??
            cData.puntos_lealtad ??
            cData.puntos ??
            0
        );
        const nextCoins = prevCoins + bonusCoins;

        tx.update(clientRef, {
          saldo_monedero: nextBal,
          saldoMonedero: nextBal,
          saldo_pase_alfa: nextBal,
          total_recargado_monedero: Math.round((Number(cData.total_recargado_monedero || 0) + cleanAmount) * 100) / 100,
          ultima_recarga_monedero: serverTimestamp(),
          ...(bonusCoins > 0
            ? {
                puntos: nextCoins,
                alfaCoins: nextCoins,
                alfa_coins: nextCoins,
                puntosLealtad: nextCoins,
                puntos_lealtad: nextCoins,
              }
            : {}),
          recompensa_pendiente: {
            id: `rw_${newSaleId}`,
            fecha: new Date().toISOString(),
            tipo_recompensa: 'recarga_saldo',
            monto_recargado: cleanAmount,
            saldo_nuevo: nextBal,
            coins_ganadas: bonusCoins,
            total_coins: nextCoins,
            visto: false,
          },
        });

        const movRef = doc(db, 'movimientos_monedero', `mov_${newSaleId}`);
        const methodLabel = paymentMethod === 'efectivo' ? 'Efectivo' : 'Transferencia';
        tx.set(movRef, {
          id: `mov_${newSaleId}`,
          cliente_id: liveClientData.id,
          cliente_nombre: clientFullName,
          tipo: 'recarga',
          es_abono: true,
          monto: cleanAmount,
          saldo_anterior: prevBal,
          saldo_nuevo: nextBal,
          bono_alfa_coins: bonusCoins,
          metodo_pago: paymentMethod,
          referencia_id: newSaleId,
          local_id: resolvedLocalId,
          concepto: bonusCoins > 0
            ? `Recarga en sucursal (${methodLabel}, +${bonusCoins} Alfa Coins)`
            : `Recarga en sucursal (${methodLabel})`,
          creado_por_id: staffId,
          creado_por_nombre: staffName,
          fecha: Timestamp.now(),
        });

        tx.set(saleDocRef, {
          id: newSaleId,
          tipo: 'recarga_monedero',
          tipo_venta: 'recarga_monedero',
          cliente_id: liveClientData.id,
          cliente_nombre: clientFullName,
          local_id: resolvedLocalId,
          metodo_pago: paymentMethod,
          pago_estado: 'Pagado',
          estado: 'completed',
          status: 'completed',
          origen: 'recepcion',
          subtotal: cleanAmount,
          descuento: { valor: 0, tipo: 'fixed', monto: 0 },
          total: cleanAmount,
          monto_pagado_real: cleanAmount,
          monto_pagado: cleanAmount,
          saldo_pendiente: 0,
          propina: 0,
          bono_recarga_coins: bonusCoins,
          monedero_acreditado: true,
          creado_por_id: staffId,
          creado_por_nombre: staffName,
          fecha_hora_venta: serverTimestamp(),
          fecha_pago: Timestamp.now(),
          creado_en: Timestamp.now(),
          detalle_pago_combinado: {
            efectivo: paymentMethod === 'efectivo' ? cleanAmount : 0,
            tarjeta: 0,
            transferencia: paymentMethod === 'transferencia' ? cleanAmount : 0,
            pagos_en_linea: 0,
            monedero: 0,
          },
          items: [
            {
              id: 'recarga_saldo_pase_alfa',
              nombre: bonusCoins > 0
                ? `Recarga Saldo Pase Alfa (+${bonusCoins} Alfa Coins)`
                : 'Recarga Saldo Pase Alfa',
              tipo: 'recarga_monedero',
              barbero_id: null,
              barbero_nombre: 'Recarga de Saldo',
              precio_unitario: cleanAmount,
              cantidad: 1,
              subtotal: cleanAmount,
              descuento: { valor: 0, tipo: 'fixed', monto: 0 },
            },
          ],
          lealtad_aplicada: {
            aplicado: true,
            fecha_aplicacion: new Date().toISOString(),
            cliente_id: liveClientData.id,
            coins_ganados_venta: 0,
            coins_canjeados_venta: 0,
            descuento_coins_monto: 0,
            sellos_sumados: 0,
            corte_gratis_10_otorgado: false,
            sellos_consumidos: 0,
            visitas_pase_alfa_sumadas: 0,
            consumo_real_sumado: 0,
            is_wallet_topup: true,
            topup_amount: cleanAmount,
            topup_bonus_coins: bonusCoins,
          },
        });
      });

      toast({
        title: '¡Saldo Pase Alfa recargado!',
        description: `Se abonaron $${formatMoney(cleanAmount)} MXN${bonusCoins > 0 ? ` y +${bonusCoins} Alfa Coins` : ''} a ${clientFullName}.`,
      });

      onSuccess?.({
        saleId: newSaleId,
        clientId: liveClientData.id,
        amount: cleanAmount,
        bonusCoins,
        newBalance: committedNewBalance,
      });
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error processing wallet top-up:', err);
      toast({
        variant: 'destructive',
        title: 'No se pudo completar la recarga',
        description: err?.message || 'Ocurrió un error al abonar el saldo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && isWaitingForTerminal) {
          cancelPendingTerminalTopup();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        hideCloseButton={true}
        className="sm:max-w-3xl lg:max-w-4xl w-[96vw] max-h-[92vh] p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background flex flex-col"
      >
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-4 py-2.5 sm:px-5 sm:py-3 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Wallet className="h-4.5 w-4.5 text-[#C5A880] shrink-0" />
              <div className="min-w-0">
                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                  Recargar Saldo Pase Alfa
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-300 mt-0.5 truncate">
                  Abono prepago a monedero exclusivo para miembros con App Móvil
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isWaitingForTerminal) cancelPendingTerminalTopup();
                onOpenChange(false);
              }}
              className="p-1 text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Cuerpo con Scroll Azul Vatos Alfa */}
        <div className="p-3.5 sm:p-4 overflow-y-auto flex-1">
          {isConfigLoading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <span>Cargando reglas de Saldo Pase Alfa...</span>
            </div>
          ) : isProgramPaused ? (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5 text-xs text-red-400">
              El beneficio <strong>Saldo Pase Alfa</strong> está pausado actualmente en Configuración &gt; App Móvil &gt; Pase Alfa.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
              {/* COLUMNA IZQUIERDA: CLIENTE + PAQUETE + RESUMEN */}
              <div className="space-y-3">
              {/* 1. Cliente Miembro */}
              {!initialClient ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-[#C5A880]" />
                    <span>Miembro Pase Alfa (con App Móvil vinculada)</span>
                  </Label>
                  <ClientInput
                    value={pickedClientId}
                    onChange={(id) => setPickedClientId(id)}
                    clients={appEligibleClients}
                    loading={clientsLoading}
                  />
                  {!pickedClientId && (
                    <p className="text-[11px] text-muted-foreground">
                      Solo se muestran clientes que cuentan con la App Móvil VATOS ALFA instalada y vinculada.
                    </p>
                  )}
                </div>
              ) : null}

              {liveClientData && (
                <div className="p-3 rounded-xl border border-[#C5A880]/30 bg-muted/20 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                        {liveClientData.nombre} {liveClientData.apellido || ''}
                      </span>
                      {hasAppLinked ? (
                        <Badge
                          variant="outline"
                          className="h-4 py-0 px-1.5 text-[10px] font-medium border-[#C5A880]/40 text-[#C5A880]"
                        >
                          Pase Alfa
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="h-4 py-0 px-1.5 text-[10px] font-medium border-red-500/40 text-red-400"
                        >
                          Sin App
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Saldo actual disponible en monedero
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-base sm:text-lg font-bold text-foreground font-sans">
                      ${formatMoney(currentBalance)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">MXN</span>
                  </div>
                </div>
              )}

              {liveClientData && !hasAppLinked && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 text-xs text-red-400">
                  Este cliente aún no tiene su cuenta vinculada en la App Móvil VATOS ALFA. Pídele iniciar sesión en la App antes de abonar Saldo Pase Alfa.
                </div>
              )}

              {/* 2. Selección de Paquete o Monto Libre */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    Selecciona paquete de recarga
                  </Label>
                  {config.permitir_monto_libre && activePackages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCustomMode((prev) => !prev)}
                      className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      {isCustomMode ? 'Ver paquetes sugeridos' : 'Ingresar otro monto'}
                    </button>
                  )}
                </div>

                {!isCustomMode && activePackages.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {activePackages.map((pkg) => {
                      const isSelected = selectedPackageId === pkg.id;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => setSelectedPackageId(pkg.id)}
                          className={cn(
                            'p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1',
                            isSelected
                              ? 'border-blue-500 bg-blue-500/10 shadow-xs'
                              : 'border-border/60 bg-card/60 hover:bg-muted/30'
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-sm font-bold text-foreground font-sans">
                              ${formatMoney(pkg.monto)}
                            </span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                          </div>
                          {pkg.bono_alfa_coins > 0 ? (
                            <div className="flex items-center gap-1 text-[11px] font-semibold text-[#C5A880]">
                              <Coins className="h-3 w-3 text-[#C5A880] shrink-0" />
                              <span>+{pkg.bono_alfa_coins} Alfa Coins</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Sin bono extra</span>
                          )}
                          {pkg.etiqueta && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {pkg.etiqueta}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none pointer-events-none font-sans">
                        $
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={`${formatMoney(config.monto_minimo)} - ${formatMoney(config.monto_maximo)}`}
                        value={customAmountStr}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const formatted = formatAsUserTypes(e.target.value);
                          setCustomAmountStr(formatted);
                        }}
                        onBlur={() => {
                          if (customAmountStr.trim()) {
                            const num = parseCashAmount(customAmountStr);
                            if (num > 0) {
                              setCustomAmountStr(formatMoney(num));
                            } else {
                              setCustomAmountStr('');
                            }
                          }
                        }}
                        className="pl-7 h-9 text-xs font-semibold font-sans"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Mínimo ${formatMoney(config.monto_minimo)} MXN · Máximo ${formatMoney(config.monto_maximo)} MXN
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Resumen en Vivo del Abono */}
              {selectedAmount > 0 && (
                <div className="p-3 rounded-xl border border-border/60 bg-muted/15 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Monto a cobrar hoy (Ingreso en caja):</span>
                    <span className="font-bold text-foreground font-sans">
                      ${formatMoney(selectedAmount)} MXN
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Nuevo Saldo Pase Alfa del cliente:</span>
                    <span className="font-bold text-blue-400 font-sans">
                      ${formatMoney(previewNewBalance)} MXN
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Bono promocional por recarga:</span>
                    <span className="font-semibold text-[#C5A880] flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5 text-[#C5A880]" />
                      +{previewBonusCoins} Alfa Coins
                    </span>
                  </div>
                  {!amountValidation.ok && (
                    <p className="text-[11px] text-red-400 pt-1 border-t border-border/40">
                      {amountValidation.error}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA: MÉTODO DE PAGO + CALCULADORA + TERMINAL */}
            <div className="space-y-3">
              {/* 4. Método de Cobro en Recepción */}
              {allowedBranchMethods.length === 0 ? (
                <div className="p-3 rounded-xl border border-border/60 bg-muted/20 text-xs text-muted-foreground">
                  Las recargas en sucursal están desactivadas. El cliente puede recargar directamente desde su App Móvil.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Método de cobro en sucursal
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {allowedBranchMethods.map((m) => {
                      const Icon = m.icon;
                      const active = paymentMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={isWaitingForTerminal}
                          onClick={() => setPaymentMethod(m.id)}
                          className={cn(
                            'p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-all cursor-pointer',
                            active
                              ? 'border-blue-500 bg-blue-500/10 text-foreground'
                              : 'border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted/30'
                          )}
                        >
                          <Icon className={cn('h-4 w-4', active ? 'text-blue-400' : 'text-muted-foreground')} />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Calculadora de cambio si es Efectivo */}
                  {paymentMethod === 'efectivo' && selectedAmount > 0 && (
                    <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Calculator className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          Calculadora de Efectivo y Cambio
                        </span>
                        <span className="text-[11px] text-muted-foreground font-sans">
                          A cobrar: ${formatMoney(selectedAmount)} MXN
                        </span>
                      </div>

                      {/* Denominaciones rápidas de cobro en efectivo */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] font-semibold text-muted-foreground mr-0.5">Cobro rápido:</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setCashReceivedStr(formatMoney(selectedAmount))}
                          className={cn(
                            "h-7 px-2.5 text-xs font-semibold rounded-lg transition-all font-sans",
                            cashReceived === selectedAmount
                              ? "border-blue-500 bg-blue-500/15 text-blue-300 border"
                              : "border-border/60 hover:bg-muted/40 text-foreground"
                          )}
                        >
                          Exacto (${formatMoney(selectedAmount)})
                        </Button>
                        {Array.from(new Set([500, 1000, 2000]))
                          .filter(bill => bill >= selectedAmount)
                          .map(bill => (
                            <Button
                              key={bill}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setCashReceivedStr(formatMoney(bill))}
                              className={cn(
                                "h-7 px-2.5 text-xs font-semibold rounded-lg transition-all font-sans",
                                cashReceived === bill
                                  ? "border-blue-500 bg-blue-500/15 text-blue-300 border"
                                  : "border-border/60 hover:bg-muted/40 text-foreground"
                              )}
                            >
                              ${formatMoney(bill)}
                            </Button>
                          ))}
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none select-none font-sans">
                            $
                          </span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={cashReceivedStr}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const formatted = formatAsUserTypes(e.target.value);
                              setCashReceivedStr(formatted);
                            }}
                            onBlur={() => {
                              if (cashReceivedStr.trim()) {
                                const num = parseCashAmount(cashReceivedStr);
                                if (num > 0) {
                                  setCashReceivedStr(formatMoney(num));
                                } else {
                                  setCashReceivedStr('');
                                }
                              }
                            }}
                            className={cn(
                              "pl-6 h-8 text-xs font-semibold font-sans rounded-lg",
                              cashReceived > 0 && cashReceived < selectedAmount && "border-red-500/40 focus-visible:ring-red-500/30"
                            )}
                          />
                        </div>

                        {cashReceived > 0 && (
                          <div className="text-right shrink-0">
                            {cashChange > 0 ? (
                              <>
                                <span className="text-[10px] text-muted-foreground block">Cambio a entregar</span>
                                <span className="text-xs font-bold text-blue-400 font-sans">
                                  ${formatMoney(cashChange)} MXN
                                </span>
                              </>
                            ) : cashReceived === selectedAmount ? (
                              <span className="text-[11px] font-semibold text-blue-300 font-sans">
                                ✓ Pago exacto
                              </span>
                            ) : (
                              <span className="text-[10px] text-red-400 font-sans">
                                Faltan ${formatMoney(selectedAmount - cashReceived)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Selector de Terminal Point */}
                  {paymentMethod === 'tarjeta' && (
                    <div className="space-y-1.5">
                      <Select
                        value={selectedTerminalId}
                        onValueChange={setSelectedTerminalId}
                        disabled={terminalsLoading || isWaitingForTerminal}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue
                            placeholder={
                              terminalsLoading
                                ? 'Buscando terminales Point...'
                                : 'Selecciona terminal Point'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          {terminals.map((t: any) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs">
                              {t.display_name || t.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {terminals.length === 0 && !terminalsLoading && (
                        <p className="text-[11px] text-red-400">
                          No hay terminales Point activas configuradas en modo PDV.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Selección de sucursal cuando el usuario está en "Todos los locales" */}
                  {(!selectedLocalId || selectedLocalId === 'todos') && locales.length > 1 && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Sucursal donde ingresa el pago
                      </Label>
                      <Select value={resolvedLocalId} onValueChange={setResolvedLocalId}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecciona sucursal" />
                        </SelectTrigger>
                        <SelectContent className="border-2 border-blue-500 rounded-xl">
                          {locales.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id} className="text-xs">
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Estado de espera en Terminal Point */}
              {isWaitingForTerminal && (
                <div className="p-3 rounded-xl border border-blue-500/40 bg-blue-500/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        Esperando pago en Terminal Point...
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        El saldo se acreditará automáticamente al aprobarse en terminal.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelPendingTerminalTopup}
                    className="h-7 px-2.5 text-[11px] shrink-0"
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Pie de Modal */}
        <div className="p-3.5 sm:px-5 border-t border-border/60 bg-muted/10 flex items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (isWaitingForTerminal) cancelPendingTerminalTopup();
              onOpenChange(false);
            }}
            className="h-9 px-4 text-xs font-semibold rounded-xl"
          >
            Cerrar
          </Button>
          {!isProgramPaused && allowedBranchMethods.length > 0 && (
            <Button
              type="button"
              variant="alfa"
              size="sm"
              disabled={
                isSubmitting ||
                isWaitingForTerminal ||
                !liveClientData ||
                !hasAppLinked ||
                !amountValidation.ok ||
                (paymentMethod === 'tarjeta' && !selectedTerminalId)
              }
              onClick={handleConfirmTopup}
              className="h-9 px-5 text-xs font-semibold rounded-xl cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : paymentMethod === 'tarjeta' ? (
                <>
                  <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                  <span>Enviar ${formatMoney(selectedAmount)} a Terminal</span>
                </>
              ) : (
                <>
                  <Wallet className="h-3.5 w-3.5 mr-1.5" />
                  <span>Abonar ${formatMoney(selectedAmount)} MXN</span>
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
