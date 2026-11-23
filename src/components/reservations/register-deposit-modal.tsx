'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DollarSign, CreditCard, Loader2, Wifi, X } from 'lucide-react';
import type { Reservation, Service } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { functions, httpsCallable, db } from '@/lib/firebase-client';
import { doc, onSnapshot, deleteDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface RegisterDepositModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
  onConfirmDeposit: (depositAmount: number, paymentMethod: string, computedTotal: number) => Promise<string | undefined>;
}

export function RegisterDepositModal({
  isOpen,
  onOpenChange,
  reservation,
  onConfirmDeposit,
}: RegisterDepositModalProps) {
  const { toast } = useToast();
  const { data: services } = useFirestoreQuery<Service>('servicios');
  const { data: terminals, loading: terminalsLoading } = useFirestoreQuery<any>('terminales');

  const [amountStr, setAmountStr] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('efectivo');
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForTerminal, setIsWaitingForTerminal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const currentSaleIdRef = useRef<string | null>(null);

  // Preselect default terminal if available
  useEffect(() => {
    if (terminals && terminals.length > 0 && !selectedTerminalId) {
      setSelectedTerminalId(terminals[0].id);
    }
  }, [terminals, selectedTerminalId]);

  // Compute total dynamically in case reservation.total is 0 or missing on Firestore document
  const total = useMemo(() => {
    if (!reservation) return 0;
    if (typeof reservation.total === 'number' && reservation.total > 0) return reservation.total;
    if (typeof reservation.precio === 'number' && reservation.precio > 0) return reservation.precio;

    let sum = 0;
    if (reservation.items && reservation.items.length > 0) {
      reservation.items.forEach((item: any) => {
        const itemPrice = item.precio || item.subtotal || item.price;
        if (typeof itemPrice === 'number' && itemPrice > 0) {
          sum += itemPrice;
        } else if (services && services.length > 0) {
          const foundSvc = services.find(s => s.id === item.id || s.name?.toLowerCase() === (item.nombre || item.servicio)?.toLowerCase());
          if (foundSvc && typeof foundSvc.price === 'number') {
            sum += foundSvc.price;
          }
        }
      });
    }

    if (sum === 0 && services && services.length > 0 && (reservation as any).servicio) {
      const names = (reservation as any).servicio.split(',').map((s: string) => s.trim().toLowerCase());
      names.forEach((name: string) => {
        const found = services.find(s => s.name?.toLowerCase() === name || s.id === name);
        if (found && typeof found.price === 'number') {
          sum += found.price;
        }
      });
    }

    return sum;
  }, [reservation, services]);

  const minDeposit = Math.round(total * 0.5 * 100) / 100;

  useEffect(() => {
    if (isOpen) {
      if (total > 0) {
        const calculatedMin = Math.round(total * 0.5 * 100) / 100;
        setAmountStr(calculatedMin.toString());
      } else {
        setAmountStr('0');
      }
      setPaymentMethod('efectivo');
      setError(null);
      setIsWaitingForTerminal(false);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = undefined;
      }
    };
  }, [isOpen, total]);

  const handleCancelTerminalWait = async () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = undefined;
    }
    if (currentSaleIdRef.current && db) {
      try {
        const saleRef = doc(db, 'ventas', currentSaleIdRef.current);
        const snap = await getDoc(saleRef);
        if (snap.exists() && snap.data().pago_estado === 'Pendiente') {
          await deleteDoc(saleRef);
        }
      } catch (e) {
        console.warn("Could not delete pending sale on cancel:", e);
      }
    }
    setIsWaitingForTerminal(false);
    setIsSubmitting(false);
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      setError('Por favor ingresa un monto de anticipo válido.');
      return;
    }
    if (total > 0 && amount < minDeposit) {
      setError(`El anticipo debe ser de al menos $${minDeposit.toFixed(2)} (50% del total).`);
      return;
    }
    if (total > 0 && amount > total) {
      setError(`El anticipo no puede ser mayor al total ($${total.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // 1. Create deposit reservation record (creates 'Pendiente' sale if paymentMethod === 'mercadopago')
      const depositSaleId = await onConfirmDeposit(amount, paymentMethod, total);
      currentSaleIdRef.current = depositSaleId || null;

      // 2. If Mercado Pago / Terminal and a physical terminal is selected, trigger physical Point device API
      if (paymentMethod === 'mercadopago' && selectedTerminalId && depositSaleId && functions && db) {
        setIsWaitingForTerminal(true);
        try {
          const createPayment = httpsCallable(functions, 'createPointPayment');
          const result: any = await createPayment({
            amount: amount,
            terminalId: selectedTerminalId,
            referenceId: depositSaleId,
            payer: {
              email: reservation?.customer?.correo || 'cliente@vatosalfa.com',
              name: `${reservation?.customer?.nombre || 'Cliente'} ${reservation?.customer?.apellido || ''}`.trim()
            }
          });

          if (result.data.success) {
            toast({ title: 'Cobro Enviado a Terminal', description: 'Por favor completa el pago en la terminal Mercado Pago.' });

            // Listen for payment confirmation via webhook (or snapshot update when approved)
            const saleDocRef = doc(db, 'ventas', depositSaleId);
            const unsubscribe = onSnapshot(saleDocRef, (docSnapshot) => {
              if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                if (data && (data.pago_estado === 'deposit_paid' || data.pago_estado === 'Pagado')) {
                  setIsWaitingForTerminal(false);
                  setIsSubmitting(false);
                  toast({ title: '¡Anticipo Recibido!', description: 'Pago verificado y confirmado exitosamente en la terminal.' });
                  onOpenChange(false);
                }
              }
            });
            unsubscribeRef.current = unsubscribe;
            return;
          } else {
            throw new Error(result.data.message || 'No se pudo enviar la solicitud a la terminal.');
          }
        } catch (termErr: any) {
          console.error("Error al conectar con la terminal MP:", termErr);
          toast({
            variant: 'destructive',
            title: 'Error de Terminal',
            description: termErr?.message || 'No se pudo enviar el cobro a la terminal física.'
          });
          handleCancelTerminalWait();
          return;
        }
      }

      setIsSubmitting(false);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el anticipo.');
      setIsSubmitting(false);
      setIsWaitingForTerminal(false);
    }
  };

  if (!reservation) return null;

  const depositAmount = parseFloat(amountStr) || 0;
  const remainingBalance = Math.max(0, total - depositAmount);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && isWaitingForTerminal) {
        handleCancelTerminalWait();
      } else {
        onOpenChange(open);
      }
    }}>
      <DialogContent
        hideCloseButton={true}
        className="w-[95vw] sm:max-w-3xl max-h-[92dvh] p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background flex flex-col"
      >
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <DollarSign className="h-4 w-4 text-[#C5A880] shrink-0" />
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide leading-tight">
                  Registrar Anticipo
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-300 hidden sm:block">
                  Asegura la reserva registrando el anticipo recibido.
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isWaitingForTerminal) {
                  handleCancelTerminalWait();
                } else {
                  onOpenChange(false);
                }
              }}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
        {isWaitingForTerminal ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <Wifi className="w-5 h-5 text-primary absolute inset-0 m-auto" />
            </div>
            <div>
              <h4 className="font-bold text-base text-foreground">Esperando Pago en Terminal MP Point</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs font-sans">
                Monto del Anticipo: <strong className="text-primary">${depositAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Por favor desliza, inserta o aproxima la tarjeta del cliente en la terminal física.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelTerminalWait}
              className="mt-2 text-xs rounded-xl"
            >
              Cancelar Cobro en Terminal
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
            {/* COLUMNA IZQUIERDA: Resumen y Monto */}
            <div className="space-y-3">
              <div className="p-3 bg-muted/40 border border-border/60 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-semibold text-foreground">
                    {reservation.customer?.nombre || 'Cliente'} {reservation.customer?.apellido || ''}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total del Servicio:</span>
                  <span className="font-bold text-foreground font-sans">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                </div>
                <div className="flex justify-between items-center text-blue-400 font-semibold pt-1 border-t border-border/50">
                  <span>Mínimo Requerido (50%):</span>
                  <span className="font-sans">${minDeposit.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deposit-amount" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Monto del Anticipo ($)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                  <Input
                    id="deposit-amount"
                    type="number"
                    step="0.01"
                    min={minDeposit}
                    max={total > 0 ? total : undefined}
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="pl-7 h-10 font-bold text-base font-sans border-primary/30 focus-visible:ring-primary rounded-xl"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA: Método de Pago y Saldo Restante */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment-method" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Método de Pago
                </Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="payment-method" className="h-10 rounded-xl">
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">💵 Efectivo</SelectItem>
                    <SelectItem value="mercadopago">💳 Mercado Pago / Terminal Point</SelectItem>
                    <SelectItem value="transferencia">🏦 Transferencia Bancaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'mercadopago' && terminals && terminals.length > 0 && (
                <div className="space-y-1.5 p-2.5 bg-muted/40 rounded-xl border border-border/60 text-xs">
                  <Label htmlFor="terminal-select" className="font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-blue-400" /> Terminal Mercado Pago Point Destino:
                  </Label>
                  <Select value={selectedTerminalId} onValueChange={setSelectedTerminalId}>
                    <SelectTrigger id="terminal-select" className="h-8 text-xs rounded-lg">
                      <SelectValue placeholder="Selecciona una terminal" />
                    </SelectTrigger>
                    <SelectContent>
                      {terminals.map((t: any) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.display_name || t.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-between items-center p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs">
                <span className="font-semibold text-foreground">
                  Saldo Restante a Cobrar:
                </span>
                <span className="font-bold text-blue-400 text-sm font-sans">
                  ${remainingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                </span>
              </div>

              {error && (
                <p className="text-xs text-red-400 font-semibold bg-red-500/10 p-2.5 rounded-xl border border-red-500/30">
                  {error}
                </p>
              )}
            </div>
          </div>
        )}
        </div>

        <DialogFooter className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-border/60 bg-muted/20 gap-2 sm:gap-2">
          <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={() => {
            if (isWaitingForTerminal) {
              handleCancelTerminalWait();
            } else {
              onOpenChange(false);
            }
          }} disabled={isSubmitting && !isWaitingForTerminal}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            size="sm"
            className="btn-vatos-alfa rounded-xl font-bold h-9 px-4"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isWaitingForTerminal ? 'Esperando Terminal...' : 'Procesando...'}
              </>
            ) : paymentMethod === 'mercadopago' && selectedTerminalId ? (
              <>
                <Wifi className="mr-2 h-4 w-4" />
                Enviar a Terminal MP (${depositAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Registrar Anticipo (${depositAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
