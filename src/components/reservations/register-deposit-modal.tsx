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
import { DollarSign, CreditCard, Loader2, Wifi, CheckCircle2 } from 'lucide-react';
import type { Reservation, Service } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { functions, httpsCallable, db } from '@/lib/firebase-client';
import { doc, onSnapshot } from 'firebase/firestore';
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

      // 1. Create deposit reservation record
      const depositSaleId = await onConfirmDeposit(amount, paymentMethod, total);

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

            // Listen for payment confirmation via webhook
            const saleDocRef = doc(db, 'ventas', depositSaleId);
            const unsubscribe = onSnapshot(saleDocRef, (docSnapshot) => {
              if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                if (data && (data.pago_estado === 'deposit_paid' || data.pago_estado === 'Pagado')) {
                  setIsWaitingForTerminal(false);
                  setIsSubmitting(false);
                  toast({ title: 'Anticipo Recibido', description: 'Pago confirmado exitosamente en la terminal.' });
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
            title: 'Aviso de Terminal',
            description: termErr?.message || 'Se registró el anticipo localmente, pero no se pudo enviar el cobro a la terminal física.'
          });
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-primary">
            <DollarSign className="h-5 w-5 text-primary" />
            Registrar Anticipo de Reserva
          </DialogTitle>
          <DialogDescription>
            Registra el anticipo recibido para asegurar la cita del cliente.
          </DialogDescription>
        </DialogHeader>

        {isWaitingForTerminal ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <Wifi className="w-5 h-5 text-primary absolute inset-0 m-auto" />
            </div>
            <div>
              <h4 className="font-bold text-base text-foreground">Esperando Pago en Terminal MP Point</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Monto del Anticipo: <strong className="text-primary">${depositAmount.toFixed(2)}</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Por favor desliza, inserta o aproxima la tarjeta del cliente en la terminal.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsWaitingForTerminal(false);
                setIsSubmitting(false);
                onOpenChange(false);
              }}
              className="mt-2 text-xs"
            >
              Cerrar Ventana
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Summary Box */}
            <div className="p-3 bg-muted/60 rounded-lg space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-semibold text-foreground">
                  {reservation.customer?.nombre || 'Cliente'} {reservation.customer?.apellido || ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total del Servicio:</span>
                <span className="font-bold text-foreground">${total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-primary font-semibold">
                <span>Mínimo Requerido (50%):</span>
                <span>${minDeposit.toFixed(2)}</span>
              </div>
            </div>

            {/* Amount Field */}
            <div className="space-y-1.5">
              <Label htmlFor="deposit-amount" className="font-semibold">
                Monto del Anticipo ($)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                <Input
                  id="deposit-amount"
                  type="number"
                  step="0.01"
                  min={minDeposit}
                  max={total > 0 ? total : undefined}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="pl-7 font-bold text-base border-primary/30 focus-visible:ring-primary"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="payment-method" className="font-semibold">
                Método de Pago
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment-method">
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">💵 Efectivo</SelectItem>
                  <SelectItem value="mercadopago">💳 Mercado Pago / Terminal Point</SelectItem>
                  <SelectItem value="transferencia">🏦 Transferencia Bancaria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* If Mercado Pago selected and terminals exist, show terminal selector */}
            {paymentMethod === 'mercadopago' && terminals && terminals.length > 0 && (
              <div className="space-y-1.5 p-2.5 bg-muted/40 rounded-lg border text-xs">
                <Label htmlFor="terminal-select" className="font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-primary" /> Terminal Mercado Pago Point Destino:
                </Label>
                <Select value={selectedTerminalId} onValueChange={setSelectedTerminalId}>
                  <SelectTrigger id="terminal-select" className="h-8 text-xs">
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

            {/* Remaining Balance Summary */}
            <div className="flex justify-between items-center p-2.5 bg-primary/10 border border-primary/20 rounded-md text-xs">
              <span className="font-semibold text-primary">
                Saldo Restante a Cobrar:
              </span>
              <span className="font-bold text-primary text-sm">
                ${remainingBalance.toFixed(2)}
              </span>
            </div>

            {error && (
              <p className="text-xs text-red-600 font-semibold bg-red-500/10 p-2 rounded border border-red-500/20">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando...
              </>
            ) : paymentMethod === 'mercadopago' && selectedTerminalId ? (
              <>
                <Wifi className="mr-2 h-4 w-4" />
                Enviar a Terminal MP (${depositAmount.toFixed(2)})
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Registrar Anticipo (${depositAmount.toFixed(2)})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
