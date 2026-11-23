'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Zap, Clock, User, AlertCircle, Sparkles, ArrowLeft, X } from 'lucide-react';
import type { Profesional, Service as ServiceType, Reservation, TimeBlock, Schedule } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { isExpiredPendingDepositReservation } from '@/lib/booking-rules';
import { getNormalizedDayOfWeek, getEffectiveBarberDaySchedule } from '@/lib/scheduling/schedule-engine';

interface QuickConsultModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: ServiceType[];
  professionals: Profesional[];
  reservations: Reservation[];
  timeBlocks: TimeBlock[];
  date: Date | undefined;
  onSelectSlot: (time: string, barberId: string, serviceId: string) => void;
  specialJourneys?: any[];
  localSchedule?: Schedule;
}

export function QuickConsultModal({
  isOpen,
  onClose,
  services,
  professionals,
  reservations,
  timeBlocks,
  date,
  onSelectSlot,
  specialJourneys = [],
  localSchedule,
}: QuickConsultModalProps) {
  const { user } = useAuth();
  const isStaff = Boolean(user?.role && (user.role.toLowerCase().includes('staff') || user.role.toLowerCase().includes('barbero')));

  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeServices = useMemo(() => {
    return services.filter(s => s.active);
  }, [services]);

  const filteredServices = useMemo(() => {
    if (!searchQuery) return activeServices;
    const query = searchQuery.toLowerCase();
    return activeServices.filter(s => s.name.toLowerCase().includes(query));
  }, [activeServices, searchQuery]);

  const selectedService = useMemo(() => {
    return services.find(s => s.id === selectedServiceId);
  }, [services, selectedServiceId]);

  // Main algorithm to find slots
  const availableSlots = useMemo(() => {
    if (!selectedService || !date) return [];

    const formattedDate = format(date, 'yyyy-MM-dd');
    const dayOfWeek = getNormalizedDayOfWeek(date);

    // Current time limit if checking for today (Mexico City time or system time)
    const now = new Date();
    const isDateToday = isToday(date);
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const parseTime = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const formatMins = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const getDaySchedule = (barber: Profesional) =>
      getEffectiveBarberDaySchedule({
        barber,
        date,
        localSchedule,
        specialJourneys,
      });

    const slots: {
      time: string;
      mins: number;
      barberId: string;
      barberName: string;
      barberPhoto?: string;
      gapMinutes: number;
    }[] = [];

    professionals.forEach(prof => {
      // 1. Check if professional performs this service
      const performsService = Array.isArray(prof.services) ? prof.services.includes(selectedService.id) : true;
      if (!performsService) return;

      // 2. Duration for this service
      const customDur = selectedService.durationPorProfesional?.[prof.id];
      const duration = customDur !== undefined ? customDur : (selectedService.duration || 0);
      if (duration <= 0) return;

      // 3. Calculate working intervals
      const daySchedule = getDaySchedule(prof);
      let workingIntervals: { start: number; end: number }[] = [];

      if (daySchedule && daySchedule.enabled && daySchedule.start && daySchedule.end) {
        const startMin = parseTime(daySchedule.start);
        const endMin = parseTime(daySchedule.end);
        
        // Start with the full shift
        workingIntervals.push({ start: startMin, end: endMin });

        // Subtract default breaks
        if (daySchedule.breaks && Array.isArray(daySchedule.breaks)) {
          daySchedule.breaks.forEach((b: any) => {
            if (b.start && b.end) {
              const breakStart = parseTime(b.start);
              const breakEnd = parseTime(b.end);
              
              const newWorking: { start: number; end: number }[] = [];
              workingIntervals.forEach(interval => {
                if (breakEnd <= interval.start || breakStart >= interval.end) {
                  newWorking.push(interval);
                } else {
                  if (breakStart > interval.start) {
                    newWorking.push({ start: interval.start, end: breakStart });
                  }
                  if (breakEnd < interval.end) {
                    newWorking.push({ start: breakEnd, end: interval.end });
                  }
                }
              });
              workingIntervals = newWorking;
            }
          });
        }
      }

      // Add 'available' blocks as working intervals
      const barberAvailableBlocks = timeBlocks.filter(
        block => block.fecha === formattedDate && block.barbero_id === prof.id && block.type === 'available' && block.hora_inicio && block.hora_fin
      );

      barberAvailableBlocks.forEach(block => {
        const startMin = parseTime(block.hora_inicio);
        const endMin = parseTime(block.hora_fin);
        workingIntervals.push({ start: startMin, end: endMin });
      });

      // Merge working intervals
      const sortedWorking = [...workingIntervals].sort((a, b) => a.start - b.start);
      const mergedWorking: { start: number; end: number }[] = [];
      sortedWorking.forEach(interval => {
        if (mergedWorking.length === 0) {
          mergedWorking.push({ ...interval });
        } else {
          const last = mergedWorking[mergedWorking.length - 1];
          if (interval.start <= last.end) {
            last.end = Math.max(last.end, interval.end);
          } else {
            mergedWorking.push({ ...interval });
          }
        }
      });

      if (mergedWorking.length === 0) return;

      // 4. Busy Intervals
      const busyIntervals: { start: number; end: number }[] = [];

      // Reservations
      reservations.forEach(res => {
        if (res.estado === 'Cancelado' || res.fecha !== formattedDate) return;
        if (isExpiredPendingDepositReservation(res)) return;

        let isForProf = res.barbero_id === prof.id;
        if (!isForProf && Array.isArray(res.items)) {
          isForProf = res.items.some(i => i.barbero_id === prof.id);
        }

        if (isForProf) {
          if (res.items && res.items.length > 0) {
            res.items.forEach(item => {
              if (item.barbero_id === prof.id) {
                const itemStart = (item as any).hora_inicio || res.hora_inicio;
                const itemEnd = (item as any).hora_fin || res.hora_fin;
                if (itemStart && itemEnd) {
                  busyIntervals.push({ start: parseTime(itemStart), end: parseTime(itemEnd) });
                }
              }
            });
          } else if (res.hora_inicio && res.hora_fin) {
            busyIntervals.push({ start: parseTime(res.hora_inicio), end: parseTime(res.hora_fin) });
          }
        }
      });

      // Busy time blocks (type !== 'available')
      const barberBusyBlocks = timeBlocks.filter(
        block => block.fecha === formattedDate && block.barbero_id === prof.id && block.type !== 'available' && block.hora_inicio && block.hora_fin
      );

      barberBusyBlocks.forEach(block => {
        const startMin = parseTime(block.hora_inicio);
        const endMin = parseTime(block.hora_fin);

        // Check if this block is overridden by any available block
        const isOverridden = barberAvailableBlocks.some(avBlock => {
          const avStart = parseTime(avBlock.hora_inicio);
          const avEnd = parseTime(avBlock.hora_fin);
          return (avStart < endMin && avEnd > startMin);
        });

        if (!isOverridden) {
          busyIntervals.push({ start: startMin, end: endMin });
        }
      });

      // Merge busy intervals
      const sortedBusy = [...busyIntervals].sort((a, b) => a.start - b.start);
      const mergedBusy: { start: number; end: number }[] = [];
      sortedBusy.forEach(interval => {
        if (mergedBusy.length === 0) {
          mergedBusy.push({ ...interval });
        } else {
          const last = mergedBusy[mergedBusy.length - 1];
          if (interval.start <= last.end) {
            last.end = Math.max(last.end, interval.end);
          } else {
            mergedBusy.push({ ...interval });
          }
        }
      });

      // 5. Find free gaps and generate options within working intervals
      mergedWorking.forEach(work => {
        const workingBusy = mergedBusy
          .filter(busy => busy.start < work.end && busy.end > work.start)
          .map(busy => ({
            start: Math.max(work.start, busy.start),
            end: Math.min(work.end, busy.end)
          }));

        const allBlocks = [
          { start: -Infinity, end: work.start },
          ...workingBusy,
          { start: work.end, end: Infinity },
        ];

        for (let i = 0; i < allBlocks.length - 1; i++) {
          const gapStart = allBlocks[i].end;
          const gapEnd = allBlocks[i + 1].start;
          const gapDuration = gapEnd - gapStart;

          if (gapDuration >= duration) {
            let effectiveStart = gapStart;
            if (isDateToday) {
              effectiveStart = Math.max(gapStart, currentMins + 5);
            }

            if (effectiveStart + duration <= gapEnd) {
              const alignedStart = Math.ceil(effectiveStart / 5) * 5;
              if (alignedStart + duration <= gapEnd) {
                slots.push({
                  time: formatMins(alignedStart),
                  mins: alignedStart,
                  barberId: prof.id,
                  barberName: prof.publicName || prof.name,
                  barberPhoto: prof.avatarUrl,
                  gapMinutes: gapEnd - alignedStart,
                });

                const nextStart = alignedStart + 30;
                if (nextStart + duration <= gapEnd) {
                  slots.push({
                    time: formatMins(nextStart),
                    mins: nextStart,
                    barberId: prof.id,
                    barberName: prof.publicName || prof.name,
                    barberPhoto: prof.avatarUrl,
                    gapMinutes: gapEnd - nextStart,
                  });
                }
              }
            }
          }
        }
      });
    });

    // Sort all slots by start time (mins) ascending
    return slots.sort((a, b) => a.mins - b.mins);
  }, [selectedService, date, professionals, reservations, timeBlocks, specialJourneys, localSchedule]);

  const handleSelectSlot = (time: string, barberId: string) => {
    if (selectedServiceId) {
      onSelectSlot(time, barberId, selectedServiceId);
      setSelectedServiceId('');
      setSearchQuery('');
      onClose();
    }
  };

  if (isStaff) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent hideCloseButton={true} className="w-[95vw] sm:max-w-3xl max-h-[90dvh] p-0 overflow-hidden rounded-2xl bg-background border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] flex flex-col">
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              {selectedServiceId && (
                <button
                  type="button"
                  onClick={() => setSelectedServiceId('')}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Regresar a servicios"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              {selectedServiceId ? (
                <Clock className="h-4 w-4 text-slate-300 shrink-0" />
              ) : (
                <Zap className="h-4 w-4 text-[#C5A880] shrink-0" />
              )}
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide leading-tight">
                  {selectedServiceId ? 'Horarios Disponibles' : 'Consulta de Espacio Rápido'}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-300">
                  {selectedServiceId
                    ? `Espacios libres para ${selectedService?.name} (${selectedService?.duration} min) hoy (${date ? format(date, "dd 'de' MMMM", { locale: es }) : ''}).`
                    : `Selecciona un servicio para buscar horarios disponibles hoy (${date ? format(date, "dd 'de' MMMM", { locale: es }) : ''}).`}
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 flex-1 overflow-y-auto min-h-0">
          {!selectedServiceId ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar servicio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 rounded-xl text-xs sm:text-sm"
                />
                {searchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="h-9 px-3 text-xs rounded-xl">
                    Limpiar
                  </Button>
                )}
              </div>

              <ScrollArea className="h-[260px] border border-border/60 rounded-xl bg-muted/20 p-2.5">
                {filteredServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground text-xs gap-1">
                    <AlertCircle className="w-4 h-4 text-muted-foreground/60" />
                    <span>No se encontraron servicios.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {filteredServices.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedServiceId(s.id)}
                        className="w-full text-left px-3 py-2 rounded-xl border border-border/50 bg-card text-xs font-semibold flex items-center justify-between transition-colors hover:bg-muted/40 hover:border-blue-500/40 text-foreground"
                      >
                        <span className="truncate pr-2">{s.name}</span>
                        <span className="text-muted-foreground shrink-0 font-sans">
                          {s.duration} min • ${Number(s.price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            <div>
              {availableSlots.length === 0 ? (
                <div className="border border-dashed border-destructive/20 rounded-2xl p-8 text-center text-xs text-destructive flex flex-col items-center justify-center gap-2 bg-destructive/5 min-h-[220px]">
                  <AlertCircle className="w-5 h-5 text-destructive/60" />
                  <span className="font-bold text-sm">Sin disponibilidad</span>
                  <span className="max-w-[280px] text-muted-foreground">No hay espacios libres hoy de {selectedService?.duration} min para este servicio.</span>
                  <Button variant="outline" size="sm" onClick={() => setSelectedServiceId('')} className="mt-3 rounded-xl font-semibold">
                    Elegir otro servicio
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[300px] border border-border/60 rounded-xl bg-muted/10 p-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {availableSlots.slice(0, 16).map((slot, idx) => (
                      <button
                        key={`${slot.barberId}-${slot.time}-${idx}`}
                        onClick={() => handleSelectSlot(slot.time, slot.barberId)}
                        className="w-full border border-border/60 bg-card hover:bg-muted/30 hover:border-blue-500/50 py-2 px-3 rounded-xl flex items-center justify-between transition-all group active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                          <div className="text-left min-w-0">
                            <p className="text-sm font-bold text-foreground font-sans">{slot.time} hrs</p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium truncate">
                              <User className="w-3 h-3 shrink-0" /> {slot.barberName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {slot.gapMinutes} min
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5 group-hover:text-blue-400 transition-colors font-medium">
                            Agendar →
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-border/60 bg-muted/20 flex justify-between items-center shrink-0">
          {selectedServiceId ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedServiceId('')} className="rounded-xl h-9 px-4 text-xs font-semibold">
              Atrás
            </Button>
          ) : <div />}
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl h-9 px-4 text-xs font-semibold">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
