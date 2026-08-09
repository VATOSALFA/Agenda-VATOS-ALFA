'use client';

import { useState, useEffect } from 'react';
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
import { DollarSign, CreditCard, Loader2 } from 'lucide-react';
import type { Reservation } from '@/lib/types';

interface RegisterDepositModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
  onConfirmDeposit: (depositAmount: number, paymentMethod: string) => Promise<void>;
}

export function RegisterDepositModal({
  isOpen,
  onOpenChange,
  reservation,
  onConfirmDeposit,
}: RegisterDepositModalProps) {
  const total = reservation?.total || 0;
  const minDeposit = Math.round(total * 0.5 * 100) / 100;

  const [amountStr, setAmountStr] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('efectivo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && total > 0) {
      setAmountStr(minDeposit.toString());
      setPaymentMethod('efectivo');
      setError(null);
    }
  }, [isOpen, total, minDeposit]);

  const handleConfirm = async () => {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      setError('Por favor ingresa un monto válido.');
      return;
    }
    if (amount < minDeposit) {
      setError(`El anticipo debe ser de al menos $${minDeposit.toFixed(2)} (50% del total).`);
      return;
    }
    if (amount > total) {
      setError(`El anticipo no puede ser mayor al total ($${total.toFixed(2)}).`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirmDeposit(amount, paymentMethod);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Error al registrar el anticipo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!reservation) return null;

  const depositAmount = parseFloat(amountStr) || 0;
  const remainingBalance = Math.max(0, total - depositAmount);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <DollarSign className="h-5 w-5 text-orange-500" />
            Registrar Anticipo de Reserva
          </DialogTitle>
          <DialogDescription>
            Registra el anticipo recibido para asegurar la cita del cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary Box */}
          <div className="p-3 bg-muted/60 rounded-lg space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente:</span>
              <span className="font-semibold text-foreground">
                {reservation.customer?.nombre} {reservation.customer?.apellido || ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total del Servicio:</span>
              <span className="font-bold text-foreground">${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-orange-600 dark:text-orange-400 font-semibold">
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
                max={total}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="pl-7 font-bold text-base"
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
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta (Débito/Crédito)</SelectItem>
                <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                <SelectItem value="mercadopago">Mercado Pago / Terminal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Remaining Balance Summary */}
          <div className="flex justify-between items-center p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-md text-xs">
            <span className="font-semibold text-orange-700 dark:text-orange-300">
              Saldo Restante a Cobrar:
            </span>
            <span className="font-bold text-orange-700 dark:text-orange-300 text-sm">
              ${remainingBalance.toFixed(2)}
            </span>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-semibold bg-red-500/10 p-2 rounded border border-red-500/20">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando...
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
