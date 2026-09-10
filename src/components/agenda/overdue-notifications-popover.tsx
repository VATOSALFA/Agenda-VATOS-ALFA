'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, User, XCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Reservation, Profesional, Client } from '@/lib/types';
import { formatClientName } from './agenda-utils';
import { cn } from '@/lib/utils';

interface OverdueNotificationsPopoverProps {
  reservations: Reservation[];
  professionals: Profesional[];
  clients: Client[];
  onUpdateStatus: (reservationId: string, status: string) => void;
  onSelectReservation: (reservation: any) => void;
}

export function OverdueNotificationsPopover({
  reservations,
  professionals,
  clients,
  onUpdateStatus,
  onSelectReservation,
}: OverdueNotificationsPopoverProps) {
  const [nowMinutes, setNowMinutes] = useState<number>(0);
  const [todayStr, setTodayStr] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Update current time in Mexico City timezone
  useEffect(() => {
    const updateCurrentTime = () => {
      const timeZone = 'America/Mexico_City';
      const nowRaw = new Date();

      const mxDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(nowRaw);

      const mxTimeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(nowRaw);

      const h = parseInt(mxTimeParts.find(p => p.type === 'hour')?.value || '0', 10);
      const m = parseInt(mxTimeParts.find(p => p.type === 'minute')?.value || '0', 10);

      setTodayStr(mxDateStr);
      setNowMinutes(h * 60 + m);
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 20000); // Check every 20s
    return () => clearInterval(interval);
  }, []);

  const overdueReservations = useMemo(() => {
    if (!todayStr || !reservations || reservations.length === 0) return [];

    const taggedStatuses = [
      'Confirmado',
      'Asiste',
      'En espera',
      'Completado',
      'Venta completada',
      'No asiste',
      'Cancelado',
    ];

    return reservations.filter(res => {
      // Must be today's reservation
      if (res.fecha !== todayStr) return false;

      // Must be untagged (not in taggedStatuses)
      if (res.estado && taggedStatuses.includes(res.estado)) return false;

      // Parse start time (e.g. "16:30")
      if (!res.hora_inicio || typeof res.hora_inicio !== 'string') return false;
      const parts = res.hora_inicio.split(':');
      if (parts.length < 2) return false;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return false;

      const startMin = h * 60 + m;

      // Must be >= 10 minutes past start time
      return nowMinutes >= startMin + 10;
    });
  }, [reservations, todayStr, nowMinutes]);

  const count = overdueReservations.length;

  // Auto-expand if a new notice arrives while minimized
  const prevCountRef = useRef(count);
  useEffect(() => {
    if (count > prevCountRef.current && count > 0) {
      setIsMinimized(false);
    }
    prevCountRef.current = count;
  }, [count]);

  return (
    <>
      {/* 1. Botón original en la barra de herramientas superior */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "relative gap-1.5 h-8 rounded-xl transition-all border",
              count > 0
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-muted text-muted-foreground hover:text-foreground"
            )}
            title="Notificaciones de citas por etiquetar"
          >
            <Bell className={cn("h-4 w-4", count > 0 && "animate-bounce text-primary")} />
            <span className="hidden md:inline font-bold text-xs">Avisos</span>

            {count > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow-md animate-pulse">
                {count}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-80 sm:w-96 p-0 shadow-xl border-primary/20 bg-background" align="end">
          <div className="p-3.5 border-b bg-primary/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h4 className="font-bold text-sm text-primary">Citas por Etiquetar ({count})</h4>
            </div>
            <Badge variant={count > 0 ? "destructive" : "outline"} className="text-[10px]">
              {count > 0 ? "Atención Requerida" : "Al día"}
            </Badge>
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y">
            {overdueReservations.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground space-y-2">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto opacity-80" />
                <p className="text-xs font-medium">¡No hay citas atrasadas por etiquetar!</p>
                <p className="text-[11px] text-muted-foreground">Todas las citas pasadas de hoy tienen su estado actualizado.</p>
              </div>
            ) : (
              overdueReservations.map(res => {
                const [h, m] = res.hora_inicio.split(':').map(Number);
                const startMin = h * 60 + m;
                const overdueMins = Math.max(0, nowMinutes - startMin);

                const prof = professionals.find(p => p.id === res.barbero_id || res.items?.some(i => i.barbero_id === p.id));
                const client = clients.find(c => c.id === res.cliente_id) || res.customer;

                return (
                  <div
                    key={res.id}
                    className="p-3 hover:bg-muted/50 transition-colors flex flex-col gap-2 group cursor-pointer"
                    onClick={() => {
                      onSelectReservation(res);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-foreground flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary" />
                          {formatClientName(client?.nombre, client?.apellido)}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="font-semibold text-foreground">{res.hora_inicio} - {res.hora_fin}</span>
                          {prof && <span className="ml-1 text-[11px]">({prof.name})</span>}
                        </p>
                      </div>

                      <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] font-bold flex-shrink-0">
                        +{overdueMins} min tarde
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-muted/50">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 border-orange-500/30 font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'No asiste');
                        }}
                      >
                        <XCircle className="w-3 h-3 mr-1 text-orange-500" />
                        No Asistió
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-600 border-green-500/30 font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'Confirmado');
                        }}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                        Confirmar
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 2. Ventanita Flotante Persistente en la esquina inferior derecha */}
      {count > 0 && (
        isMinimized ? (
          /* Estado Minimizado: Píldora compacta que no obstruye pero no desaparece */
          <div
            onClick={() => setIsMinimized(false)}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-[#1a233a] hover:bg-[#222e4d] text-white rounded-full shadow-[0_12px_35px_rgba(26,35,58,0.5)] border border-blue-400/40 ring-2 ring-blue-500/20 cursor-pointer transition-all animate-in slide-in-from-bottom-5 duration-300 group hover:scale-[1.03] active:scale-[0.98]"
            title="Click para ver avisos de citas por etiquetar"
          >
            <div className="relative flex items-center justify-center">
              <Bell className="w-4 h-4 text-blue-300 animate-bounce" />
              <span className="absolute -top-2 -right-2.5 bg-red-600 text-white text-[10px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow-md animate-pulse">
                {count}
              </span>
            </div>
            <span className="text-xs font-bold tracking-wide">
              {count === 1 ? '1 aviso pendiente' : `${count} avisos pendientes`}
            </span>
            <ChevronUp className="w-4 h-4 text-blue-300 group-hover:-translate-y-0.5 transition-transform ml-1" />
          </div>
        ) : (
          /* Estado Expandido: Ventanita completa con detalles y acciones directas */
          <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-background/95 dark:bg-slate-900/95 rounded-2xl shadow-[0_18px_50px_rgba(26,35,58,0.45)] border border-blue-500/30 ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
            {/* Cabecera con colores corporativos VATOS ALFA */}
            <div className="p-3 bg-gradient-to-r from-[#1a233a] to-[#243153] text-white flex items-center justify-between border-b border-blue-500/30">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-blue-500/20 text-blue-300 rounded-lg border border-blue-400/30 flex items-center justify-center">
                  <Bell className="h-4 w-4 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-xs sm:text-sm text-white tracking-wide">Aviso de Recepción</h4>
                    <span className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                      {count}
                    </span>
                  </div>
                  <p className="text-[10px] text-blue-200/80 font-medium">Citas por etiquetar</p>
                </div>
              </div>

              {/* Botón para Minimizar (NO hay botón de cerrar permanente) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(true)}
                className="h-7 px-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors gap-1 text-[11px] font-semibold"
                title="Minimizar ventanita de aviso"
              >
                <ChevronDown className="h-4 w-4" />
                <span>Minimizar</span>
              </Button>
            </div>

            {/* Contenido: Tarjetas de citas con acciones */}
            <div className="max-h-[300px] overflow-y-auto divide-y divide-border/60 p-2.5 space-y-2">
              {overdueReservations.map(res => {
                const [h, m] = res.hora_inicio.split(':').map(Number);
                const startMin = h * 60 + m;
                const overdueMins = Math.max(0, nowMinutes - startMin);

                const prof = professionals.find(p => p.id === res.barbero_id || res.items?.some(i => i.barbero_id === p.id));
                const client = clients.find(c => c.id === res.cliente_id) || res.customer;

                return (
                  <div
                    key={res.id}
                    className="p-3 bg-card dark:bg-slate-950/60 rounded-xl border border-border/80 hover:border-primary/40 shadow-sm flex flex-col gap-2.5 transition-all"
                  >
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer group"
                      onClick={() => onSelectReservation(res)}
                      title="Ver detalles de la cita"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 truncate">
                          <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="truncate">{formatClientName(client?.nombre, client?.apellido)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="font-semibold text-foreground">{res.hora_inicio} - {res.hora_fin}</span>
                          {prof && <span className="text-[11px] font-medium text-primary truncate">({prof.name})</span>}
                        </p>
                      </div>

                      <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] font-bold flex-shrink-0">
                        +{overdueMins} min tarde
                      </Badge>
                    </div>

                    {/* Acciones directas para resolver el aviso */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30 font-bold rounded-lg transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'No asiste');
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1 text-orange-500" />
                        No Asistió
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30 font-bold rounded-lg transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'Confirmado');
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-500" />
                        Confirmar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pie informativo */}
            <div className="px-3 py-2 bg-muted/40 border-t border-border/60 text-[10px] text-muted-foreground flex items-center justify-between">
              <span>💡 Etiqueta el estado para resolver este aviso</span>
              <span className="font-bold text-foreground/80">{count} {count === 1 ? 'pendiente' : 'pendientes'}</span>
            </div>
          </div>
        )
      )}
    </>
  );
}

