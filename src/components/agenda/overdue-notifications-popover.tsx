'use client';

import { useState, useEffect, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, User, XCircle, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "relative gap-1.5 h-8 rounded-xl transition-all border",
            count > 0
              ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
              : "border-muted text-muted-foreground hover:text-foreground"
          )}
          title="Notificaciones de citas por etiquetar"
        >
          <Bell className={cn("h-4 w-4", count > 0 && "animate-bounce text-amber-500")} />
          <span className="hidden md:inline font-bold text-xs">Avisos</span>

          {count > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow-md animate-pulse">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 sm:w-96 p-0 shadow-xl border-amber-500/30" align="end">
        <div className="p-3.5 border-b bg-amber-500/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="font-bold text-sm text-foreground">Citas por Etiquetar ({count})</h4>
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
  );
}
