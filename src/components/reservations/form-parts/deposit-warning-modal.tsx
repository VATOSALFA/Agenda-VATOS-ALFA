'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert, CreditCard, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DepositWarningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAnticipoRequiredDueToHistory: boolean;
  isAnticipoRequiredDueToOpeningHour: boolean;
  openingHourTarget: string;
  openingHourPorcentaje: number;
  montoMinimoThreshold: number;
  unattendedCount: number;
  currentTotal: number;
  penalizacionPorcentaje: number;
  anticipoPorcentajeDefecto: number;
  depositAmountCalculated: number;
  effectiveDepositAmount: number;
  onConfirmPaidNow: () => Promise<void>;
  onSendPaymentLink: () => Promise<void>;
  onLeavePending: () => Promise<void>;
}

export function DepositWarningModal({
  open,
  onOpenChange,
  isAnticipoRequiredDueToHistory,
  isAnticipoRequiredDueToOpeningHour,
  openingHourTarget,
  openingHourPorcentaje,
  montoMinimoThreshold,
  unattendedCount,
  currentTotal,
  penalizacionPorcentaje,
  anticipoPorcentajeDefecto,
  depositAmountCalculated,
  effectiveDepositAmount,
  onConfirmPaidNow,
  onSendPaymentLink,
  onLeavePending,
}: DepositWarningModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 rounded-2xl overflow-hidden shadow-2xl border border-border">
        <div
          className={cn(
            'p-4 sm:p-5 text-white border-b flex items-center justify-between relative overflow-hidden',
            isAnticipoRequiredDueToHistory
              ? 'bg-gradient-to-r from-red-950 via-slate-900 to-red-950 border-red-900/50'
              : 'bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border-[#2d3a60]/60'
          )}
        >
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              {isAnticipoRequiredDueToHistory ? (
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" />
              ) : (
                <CreditCard className="h-5 w-5 text-slate-300 shrink-0" />
              )}
              <div>
                <DialogTitle className="text-base font-bold text-white tracking-tight">
                  {isAnticipoRequiredDueToHistory
                    ? 'Escudo Antifraude • Anticipo Requerido'
                    : isAnticipoRequiredDueToOpeningHour
                    ? `Horario de Apertura (${openingHourTarget} AM) • Anticipo Requerido`
                    : 'Regla de Reserva • Anticipo Requerido'}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  {isAnticipoRequiredDueToHistory
                    ? 'Regla de reserva para clientes con historial de inasistencias'
                    : isAnticipoRequiredDueToOpeningHour
                    ? `Toda cita a las ${openingHourTarget} AM requiere anticipo obligatorio`
                    : `Cita a partir de $${montoMinimoThreshold} MXN requiere anticipo de garantía`}
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div
            className={cn(
              'p-3.5 border rounded-xl space-y-1.5',
              isAnticipoRequiredDueToHistory
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-blue-500/10 border-blue-500/30'
            )}
          >
            <p
              className={cn(
                'font-bold text-sm',
                isAnticipoRequiredDueToHistory
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-blue-800 dark:text-blue-200'
              )}
            >
              {isAnticipoRequiredDueToHistory
                ? `Este cliente tiene ${unattendedCount} inasistencias registradas.`
                : isAnticipoRequiredDueToOpeningHour
                ? `Cita programada en el horario de apertura (${openingHourTarget} AM).`
                : `Cita con total de $${currentTotal} MXN (alcanza o supera los $${montoMinimoThreshold} MXN).`}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {isAnticipoRequiredDueToHistory
                ? `Para proteger el tiempo del barbero y los costos operativos, la política de Vatos Alfa exige un anticipo del ${penalizacionPorcentaje}% ($${depositAmountCalculated} MXN).`
                : isAnticipoRequiredDueToOpeningHour
                ? `Por regla oficial de Vatos Alfa, todas las citas agendadas a las ${openingHourTarget} AM (primer turno del día) requieren un anticipo del ${openingHourPorcentaje}% ($${depositAmountCalculated} MXN) para confirmar el espacio.`
                : `Según las reglas de reserva de Vatos Alfa, citas de $${montoMinimoThreshold} MXN o más exigen un anticipo del ${anticipoPorcentajeDefecto}% ($${depositAmountCalculated} MXN) para confirmar el lugar.`}
            </p>
          </div>

          <p className="text-muted-foreground font-medium">
            ¿Cómo deseas proceder con esta reserva en el sistema?
          </p>

          <div className="space-y-2 pt-1">
            <Button
              type="button"
              className="w-full btn-vatos-alfa font-bold h-10 rounded-xl justify-center text-xs shadow-sm"
              onClick={onConfirmPaidNow}
            >
              ✓ Ya cobré el anticipo (${effectiveDepositAmount} MXN)
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10 rounded-xl justify-center text-xs font-bold border-border/80 hover:bg-muted text-foreground shadow-xs flex items-center gap-2"
              onClick={onSendPaymentLink}
            >
              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
              <span>Enviar Enlace Mercado Pago (SPEI / Tarjeta)</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full h-9 rounded-xl justify-center text-xs font-medium text-muted-foreground border-border hover:bg-muted"
              onClick={onLeavePending}
            >
              Dejar como Pendiente de Anticipo (Cobrar después)
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full h-9 rounded-xl justify-center text-xs text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Volver a revisar datos de la cita
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
