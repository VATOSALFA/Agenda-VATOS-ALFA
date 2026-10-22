'use client';

import * as React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, CreditCard, Edit, ShieldAlert, X } from 'lucide-react';
import { cn, formatMoney } from '@/lib/utils';
import type { Client } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';

interface ClientSummaryAndDepositCardProps {
  selectedClient: Client;
  isNewClient: boolean;
  isAnticipoRequired: boolean;
  isAnyAnticipoActive: boolean;
  isAnticipoRequiredDueToHistory: boolean;
  isAnticipoRequiredDueToOpeningHour: boolean;
  isAnticipoRequiredDueToAmount: boolean;
  openingHourTarget: string;
  openingHourPorcentaje: number;
  montoMinimoThreshold: number;
  penalizacionPorcentaje: number;
  anticipoPorcentajeDefecto: number;
  maxInasistenciasPermitidas: number;
  unattendedCount: number;
  currentTotal: number;
  depositAmountCalculated: number;
  effectiveDepositAmount: number;
  clientStats: {
    totalCitas: number;
    asistidasCount: number;
    inasistenciasCount: number;
    canceladasCount: number;
  };
  isClientStatsExpanded: boolean;
  setIsClientStatsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isDepositRuleExpanded: boolean;
  setIsDepositRuleExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  manualDepositEnabled: boolean;
  setManualDepositEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  manualDepositAmount: string;
  setManualDepositAmount: React.Dispatch<React.SetStateAction<string>>;
  depositPaid: boolean;
  setDepositPaid: React.Dispatch<React.SetStateAction<boolean>>;
  depositMethod: string;
  setDepositMethod: (val: string) => void;
  isSubmitting: boolean;
  onEditClient: () => void;
  onClearClient: () => void;
  onSaveAndSendLink: () => void;
}

export function ClientSummaryAndDepositCard({
  selectedClient,
  isNewClient,
  isAnticipoRequired,
  isAnyAnticipoActive,
  isAnticipoRequiredDueToHistory,
  isAnticipoRequiredDueToOpeningHour,
  isAnticipoRequiredDueToAmount,
  openingHourTarget,
  openingHourPorcentaje,
  montoMinimoThreshold,
  penalizacionPorcentaje,
  anticipoPorcentajeDefecto,
  maxInasistenciasPermitidas,
  unattendedCount,
  currentTotal,
  depositAmountCalculated,
  effectiveDepositAmount,
  clientStats,
  isClientStatsExpanded,
  setIsClientStatsExpanded,
  isDepositRuleExpanded,
  setIsDepositRuleExpanded,
  manualDepositEnabled,
  setManualDepositEnabled,
  manualDepositAmount,
  setManualDepositAmount,
  depositPaid,
  setDepositPaid,
  depositMethod,
  setDepositMethod,
  isSubmitting,
  onEditClient,
  onClearClient,
  onSaveAndSendLink,
}: ClientSummaryAndDepositCardProps) {
  const { user } = useAuth();
  const canViewPhone = React.useMemo(() => {
    if (user?.role === 'Administrador general' || user?.role === 'Administrador local') return true;
    return Boolean(user?.permissions?.includes('ver_numero_telefono'));
  }, [user]);

  return (
    <div className="space-y-2">
      {/* Tarjeta de Cliente Minimizada por Defecto Vatos Alfa */}
      <div className="p-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Avatar className="h-8 w-8 border border-border shrink-0">
              <AvatarFallback className="bg-[#1a233a] text-white font-bold text-[11px]">
                {selectedClient.nombre?.[0]}
                {selectedClient.apellido?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <p className="font-bold text-xs sm:text-sm text-foreground truncate">
                {selectedClient.nombre} {selectedClient.apellido}
              </p>
              <span className="text-xs text-muted-foreground font-sans shrink-0">
                • {canViewPhone ? selectedClient.telefono : '••••-••••'}
              </span>
              {isNewClient ? (
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] py-0 px-1.5 font-semibold shrink-0"
                >
                  Nuevo
                </Badge>
              ) : isAnticipoRequired ? (
                <Badge
                  variant="outline"
                  className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] py-0 px-1.5 font-bold shrink-0"
                >
                  🚨 Anticipo Requerido
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] py-0 px-1.5 font-semibold shrink-0"
                >
                  ✓ Frecuente
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-lg gap-1"
              onClick={() => setIsClientStatsExpanded(prev => !prev)}
              title={isClientStatsExpanded ? 'Ocultar historial de citas' : 'Ver historial de citas'}
            >
              <span className="hidden sm:inline">Historial ({clientStats.totalCitas})</span>
              {isClientStatsExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
              onClick={onEditClient}
              title="Editar datos del cliente"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
              onClick={onClearClient}
              title="Cambiar cliente"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Mini-Métricas de Asistencia y Fidelidad Desplegables */}
        {isClientStatsExpanded && (
          <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-2 animate-in fade-in duration-150">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-muted/30 rounded-lg p-1.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase">Citas</p>
                <p className="text-xs font-bold text-foreground font-sans">{clientStats.totalCitas}</p>
              </div>
              <div className="bg-blue-500/5 rounded-lg p-1.5 border border-blue-500/15">
                <p className="text-[10px] text-blue-400/80 font-medium uppercase">Asistidas</p>
                <p className="text-xs font-bold text-blue-400 font-sans">{clientStats.asistidasCount}</p>
              </div>
              <div
                className={cn(
                  'rounded-lg p-1.5 border transition-colors',
                  unattendedCount >= maxInasistenciasPermitidas
                    ? 'bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400'
                    : unattendedCount > 0
                    ? 'bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300'
                    : 'bg-muted/30 border-transparent text-muted-foreground'
                )}
              >
                <p className="text-[10px] font-medium uppercase">Inasistencias</p>
                <p
                  className={cn(
                    'text-xs font-black font-sans',
                    unattendedCount >= maxInasistenciasPermitidas && 'animate-pulse'
                  )}
                >
                  {unattendedCount}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-1.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase">Canceladas</p>
                <p className="text-xs font-bold text-muted-foreground font-sans">{clientStats.canceladasCount}</p>
              </div>
            </div>

            {selectedClient.correo && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="font-semibold text-foreground shrink-0">Correo:</span>
                <span className="truncate">{selectedClient.correo}</span>
              </div>
            )}

            {selectedClient.notas && (
              <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <span className="font-semibold text-foreground shrink-0">Nota del perfil:</span>
                <span className="italic truncate">{selectedClient.notas}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* REGLA DE RESERVA / ANTICIPO MINIMIZADA POR DEFECTO CON OPCIÓN DE EXPANDIR */}
      {isAnyAnticipoActive ? (
        <div
          className={cn(
            'rounded-xl border-2 shadow-xs overflow-hidden transition-all',
            isAnticipoRequiredDueToHistory
              ? 'border-red-500/50 bg-gradient-to-r from-red-500/10 via-red-500/5 to-red-500/10'
              : 'border-blue-500/50 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-blue-500/10'
          )}
        >
          {/* Cabecera compacta siempre visible */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsDepositRuleExpanded(prev => !prev)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsDepositRuleExpanded(prev => !prev);
              }
            }}
            className="p-2.5 px-3 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isAnticipoRequiredDueToHistory ? (
                <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              ) : (
                <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
              )}
              <span
                className={cn(
                  'font-black text-[11px] sm:text-xs uppercase tracking-wide truncate',
                  isAnticipoRequiredDueToHistory
                    ? 'text-red-800 dark:text-red-200'
                    : 'text-blue-800 dark:text-blue-200'
                )}
              >
                {isAnticipoRequiredDueToHistory
                  ? '🛡️ Escudo Antifraude: Anticipo Obligatorio'
                  : isAnticipoRequiredDueToOpeningHour
                  ? `⏰ Regla de Reserva: Horario de Apertura (${openingHourTarget} AM)`
                  : isAnticipoRequiredDueToAmount
                  ? `💳 Regla de Reserva: Anticipo por Monto (+$${formatMoney(montoMinimoThreshold)})`
                  : '💳 Anticipo Manual Personalizado'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Badge
                className={cn(
                  'text-white font-bold text-[10px] px-2 py-0 shadow-xs font-sans',
                  isAnticipoRequiredDueToHistory ? 'bg-red-600' : 'bg-blue-600'
                )}
              >
                {isAnticipoRequiredDueToHistory
                  ? `${penalizacionPorcentaje}% Anticipo`
                  : isAnticipoRequiredDueToOpeningHour
                  ? `${openingHourPorcentaje}% Anticipo`
                  : isAnticipoRequiredDueToAmount
                  ? `${anticipoPorcentajeDefecto}% Anticipo`
                  : 'Manual'}
              </Badge>
              <span className="text-xs font-bold text-foreground font-sans hidden sm:inline">
                (${formatMoney(effectiveDepositAmount)})
              </span>
              {isDepositRuleExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Contenido expandible de la regla de reserva */}
          {isDepositRuleExpanded && (
            <div
              className={cn(
                'px-3 pb-3 pt-2 border-t space-y-2.5 animate-in fade-in duration-150',
                isAnticipoRequiredDueToHistory ? 'border-red-500/20' : 'border-blue-500/20'
              )}
            >
              <div className="space-y-1">
                <p
                  className={cn(
                    'text-xs leading-snug',
                    isAnticipoRequiredDueToHistory
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-blue-800 dark:text-blue-200'
                  )}
                >
                  {isAnticipoRequiredDueToHistory ? (
                    <>
                      Este cliente acumula <strong>{unattendedCount} inasistencias previas</strong> (límite permitido:{' '}
                      {maxInasistenciasPermitidas}). Por regla oficial de Vatos Alfa,{' '}
                      <strong>debe pagar anticipo para apartar su cita</strong>.
                    </>
                  ) : isAnticipoRequiredDueToOpeningHour ? (
                    <>
                      Todas las citas agendadas en la ventana de apertura de las <strong>{openingHourTarget} AM</strong>{' '}
                      requieren obligatoriamente un anticipo del <strong>{openingHourPorcentaje}%</strong> para asegurar el
                      primer turno del día.
                    </>
                  ) : isAnticipoRequiredDueToAmount ? (
                    <>
                      El total de la cita es de <strong>${formatMoney(currentTotal)} MXN</strong> (alcanza o supera el
                      mínimo de ${formatMoney(montoMinimoThreshold)} MXN). Por regla oficial de Vatos Alfa,{' '}
                      <strong>requiere anticipo para apartar lugar</strong>.
                    </>
                  ) : (
                    <>
                      Has activado el <strong>anticipo manual</strong> para esta cita. Puedes ajustar libremente la
                      cantidad a solicitar o cobrar.
                    </>
                  )}
                </p>
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground pt-1 flex-wrap font-sans">
                  <div className="flex items-center gap-2">
                    <span>
                      Total Cita: <strong>${formatMoney(currentTotal)} MXN</strong>
                    </span>
                    <span>•</span>
                    <span
                      className={
                        isAnticipoRequiredDueToHistory
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }
                    >
                      Anticipo: <strong>${formatMoney(effectiveDepositAmount)} MXN</strong>
                    </span>
                  </div>
                  {manualDepositEnabled && !isAnticipoRequired && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualDepositEnabled(false);
                        setManualDepositAmount('');
                      }}
                      className="text-[10px] text-red-500 hover:underline font-semibold"
                    >
                      (Quitar anticipo manual)
                    </button>
                  )}
                </div>
              </div>

              {/* Campo de Monto Manual de Anticipo y Botón de Enviar Link */}
              <div
                className={cn(
                  'pt-2 border-t flex flex-wrap items-center justify-between gap-2',
                  isAnticipoRequiredDueToHistory ? 'border-red-500/20' : 'border-blue-500/20'
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-foreground">Monto Anticipo:</span>
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">
                      $
                    </span>
                    <Input
                      type="number"
                      min="0"
                      max={currentTotal}
                      step="1"
                      value={manualDepositAmount !== '' ? manualDepositAmount : effectiveDepositAmount || ''}
                      onChange={e => setManualDepositAmount(e.target.value)}
                      placeholder={String(depositAmountCalculated || 50)}
                      className="h-8 pl-6 pr-2 text-xs font-bold bg-background border-border font-sans"
                    />
                  </div>
                  <span className="text-xs font-bold text-foreground font-sans">MXN</span>
                  {manualDepositAmount !== '' && isAnticipoRequired && (
                    <button
                      type="button"
                      onClick={() => setManualDepositAmount('')}
                      className="text-[11px] text-blue-500 hover:underline font-medium font-sans"
                    >
                      (Auto: ${formatMoney(depositAmountCalculated)})
                    </button>
                  )}
                </div>

                {!depositPaid && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onSaveAndSendLink}
                    disabled={isSubmitting}
                    className="h-8 px-3 text-xs font-bold border-blue-500/40 text-blue-500 hover:text-white hover:bg-blue-600 gap-1.5 rounded-xl shadow-xs"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Enviar Link (SPEI / MP)</span>
                  </Button>
                )}
              </div>

              {/* Control de cobro en recepción */}
              <div
                className={cn(
                  'pt-2 border-t flex flex-wrap items-center justify-between gap-2',
                  isAnticipoRequiredDueToHistory ? 'border-red-500/20' : 'border-blue-500/20'
                )}
              >
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={depositPaid}
                    onChange={e => setDepositPaid(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-xs font-bold text-foreground">
                    {depositPaid
                      ? '✓ Anticipo marcado como PAGADO en recepción'
                      : 'Marcar Anticipo como PAGADO en recepción'}
                  </span>
                </label>

                {depositPaid && (
                  <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                    <span className="text-[11px] text-muted-foreground font-medium">Método:</span>
                    <Select value={depositMethod} onValueChange={setDepositMethod}>
                      <SelectTrigger className="h-7 text-xs w-32 bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="tarjeta">Terminal Point</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setManualDepositEnabled(true);
              setIsDepositRuleExpanded(true);
              if (manualDepositAmount === '') {
                setManualDepositAmount(String(Math.round(currentTotal * 0.5) || 50));
              }
            }}
            className="h-7 px-2 text-xs text-blue-500 hover:text-blue-400 font-semibold gap-1.5"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>+ Solicitar / Cobrar Anticipo Manual</span>
          </Button>
        </div>
      )}
    </div>
  );
}
