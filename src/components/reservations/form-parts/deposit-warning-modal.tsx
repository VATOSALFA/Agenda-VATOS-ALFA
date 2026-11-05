'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldAlert, CreditCard, X, KeyRound, Clock, Loader2 } from 'lucide-react';
import { cn, formatMoney } from '@/lib/utils';
import { db } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { validateAndConsumeAuthCode } from '@/lib/auth-code-validator';

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
  clientName?: string;
  onConfirmPaidNow?: () => Promise<void>;
  onSendPaymentLink: () => Promise<void>;
  onLeavePending: () => Promise<void>;
  onExemptWithCode?: (data: { code: string; codeName: string; reason: string }) => Promise<void>;
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
  clientName,
  onSendPaymentLink,
  onLeavePending,
  onExemptWithCode,
}: DepositWarningModalProps) {
  const { user } = useAuth();
  const [showCodeSection, setShowCodeSection] = React.useState(false);
  const [authCode, setAuthCode] = React.useState('');
  const [exemptReason, setExemptReason] = React.useState('');
  const [codeError, setCodeError] = React.useState('');
  const [isValidatingCode, setIsValidatingCode] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setShowCodeSection(false);
      setAuthCode('');
      setExemptReason('');
      setCodeError('');
      setIsValidatingCode(false);
    }
  }, [open]);

  const handleValidateAndExempt = async () => {
    if (!authCode.trim()) {
      setCodeError('Ingresa el código de autorización (4 dígitos).');
      return;
    }
    if (!exemptReason.trim() || exemptReason.trim().length < 4) {
      setCodeError('Escribe el motivo por el cual se exenta el anticipo.');
      return;
    }
    if (!db || !onExemptWithCode) return;

    setIsValidatingCode(true);
    setCodeError('');

    try {
      const result = await validateAndConsumeAuthCode({
        db,
        code: authCode.trim(),
        requiredPermission: 'reserves',
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Recepción',
        userRole: user?.role || 'Staff',
        localId: user?.local_id || 'unknown',
        operationDescription: `Omitir anticipo de $${formatMoney(effectiveDepositAmount)} MXN para ${clientName || 'Cliente'}. Motivo: ${exemptReason.trim()}`,
        moduleLabel: 'Exención de Anticipo en Reserva',
      });

      if (!result.valid) {
        setCodeError(result.error || 'Código inválido, inactivo o expirado.');
        setIsValidatingCode(false);
        return;
      }

      await onExemptWithCode({
        code: authCode.trim(),
        codeName: result.codeName || 'Código Autorizado',
        reason: exemptReason.trim(),
      });
    } catch (e) {
      console.error('Error al validar código de exención:', e);
      setCodeError('Ocurrió un error al validar el código.');
    } finally {
      setIsValidatingCode(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="sm:max-w-md p-0 rounded-2xl overflow-hidden shadow-2xl border-2 border-blue-500 bg-background"
      >
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
                    : `Cita a partir de $${formatMoney(montoMinimoThreshold)} MXN requiere anticipo de garantía`}
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
                'font-bold text-sm font-sans',
                isAnticipoRequiredDueToHistory
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-blue-800 dark:text-blue-200'
              )}
            >
              {isAnticipoRequiredDueToHistory
                ? `Este cliente tiene ${unattendedCount} inasistencias registradas.`
                : isAnticipoRequiredDueToOpeningHour
                ? `Cita programada en el horario de apertura (${openingHourTarget} AM).`
                : `Cita con total de $${formatMoney(currentTotal)} MXN (alcanza o supera los $${formatMoney(montoMinimoThreshold)} MXN).`}
            </p>
            <p className="text-muted-foreground leading-relaxed font-sans">
              {isAnticipoRequiredDueToHistory
                ? `Para proteger el tiempo del barbero y los costos operativos, la política de Vatos Alfa exige un anticipo del ${penalizacionPorcentaje}% ($${formatMoney(depositAmountCalculated)} MXN).`
                : isAnticipoRequiredDueToOpeningHour
                ? `Por regla oficial de Vatos Alfa, todas las citas agendadas a las ${openingHourTarget} AM (primer turno del día) requieren un anticipo del ${openingHourPorcentaje}% ($${formatMoney(depositAmountCalculated)} MXN) para confirmar el espacio.`
                : `Según las reglas de reserva de Vatos Alfa, citas de $${formatMoney(montoMinimoThreshold)} MXN o más exigen un anticipo del ${anticipoPorcentajeDefecto}% ($${formatMoney(depositAmountCalculated)} MXN) para confirmar el lugar.`}
            </p>
          </div>

          <p className="text-muted-foreground font-medium">
            ¿Cómo deseas proceder con esta reserva en el sistema?
          </p>

          <div className="space-y-2 pt-1">
            <Button
              type="button"
              className="w-full btn-vatos-alfa font-bold h-10 rounded-xl justify-center text-xs shadow-sm flex items-center gap-2"
              onClick={onSendPaymentLink}
            >
              <CreditCard className="w-3.5 h-3.5 text-white" />
              <span>Enviar Enlace Mercado Pago (${formatMoney(effectiveDepositAmount)} MXN)</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full h-10 rounded-xl justify-center text-xs font-bold border-border/80 hover:bg-muted text-foreground shadow-xs flex items-center gap-2"
              onClick={onLeavePending}
            >
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Dejar Pendiente de Anticipo (30 min de tolerancia)</span>
            </Button>

            {onExemptWithCode && (
              <>
                {!showCodeSection ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 rounded-xl justify-center text-xs font-medium text-muted-foreground border-border hover:bg-muted flex items-center gap-1.5"
                    onClick={() => setShowCodeSection(true)}
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    <span>Omitir anticipo por esta ocasión (Requiere Código)</span>
                  </Button>
                ) : (
                  <div className="p-3 rounded-xl border border-blue-500/40 bg-muted/20 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                        Autorización para Omitir Anticipo
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCodeSection(false);
                          setCodeError('');
                        }}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <Input
                        type="password"
                        inputMode="numeric"
                        placeholder="Código de autorización (ej. 4 dígitos de 1 uso)"
                        value={authCode}
                        onChange={(e) => {
                          setAuthCode(e.target.value);
                          setCodeError('');
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <Input
                        type="text"
                        placeholder="Motivo obligatorio (ej. Cliente frecuente autorizado por Bety)"
                        value={exemptReason}
                        onChange={(e) => {
                          setExemptReason(e.target.value);
                          setCodeError('');
                        }}
                        className="h-8 text-xs"
                      />
                    </div>

                    {codeError && (
                      <p className="text-[11px] text-red-400 font-medium">{codeError}</p>
                    )}

                    <Button
                      type="button"
                      onClick={handleValidateAndExempt}
                      disabled={isValidatingCode}
                      className="w-full btn-vatos-alfa h-8 rounded-lg text-xs font-bold"
                    >
                      {isValidatingCode ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Verificando...
                        </span>
                      ) : (
                        'Autorizar y Confirmar Cita sin Anticipo'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}

            <Button
              type="button"
              variant="ghost"
              className="w-full h-8 rounded-xl justify-center text-xs text-muted-foreground"
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
