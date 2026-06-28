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
import { Zap, Clock, User, AlertCircle, Sparkles, ArrowLeft } from 'lucide-react';
import type { Profesional, Service as ServiceType, Reservation, TimeBlock } from '@/lib/types';

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
}: QuickConsultModalProps) {
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
    const dayOfWeek = format(date, 'eeee', { locale: es })
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

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

    const getDaySchedule = (barber: Profesional) => {
      const dateStr = formattedDate;

      // Check for Special Journeys (there may be multiple on the same day)
      const barberJourneys = (specialJourneys || []).filter(
        (s: any) => s.profesionalId === barber.id && s.fecha === dateStr
      );

      if (barberJourneys.length > 0) {
        // Sort journeys by start time
        const sorted = [...barberJourneys].sort((a: any, b: any) =>
          a.hora_inicio.localeCompare(b.hora_inicio)
        );

        // Merge: overall start is the earliest, overall end is the latest
        const overallStart = sorted[0].hora_inicio;
        const overallEnd = sorted.reduce(
          (latest: string, j: any) => (j.hora_fin > latest ? j.hora_fin : latest),
          sorted[0].hora_fin
        );

        // Build break segments for gaps between consecutive journeys
        const breaks: { start: string; end: string }[] = [];
        for (let i = 0; i < sorted.length - 1; i++) {
          const currentEnd = sorted[i].hora_fin;
          const nextStart = sorted[i + 1].hora_inicio;
          if (currentEnd < nextStart) {
            breaks.push({ start: currentEnd, end: nextStart });
          }
        }

        return {
          enabled: true,
          start: overallStart,
          end: overallEnd,
          breaks,
        };
      }

      if (!barber.schedule) return null;
      return barber.schedule[dayOfWeek as keyof typeof barber.schedule];
    };

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
                  barberName: prof.name,
                  barberPhoto: prof.avatarUrl,
                  gapMinutes: gapEnd - alignedStart,
                });

                const nextStart = alignedStart + 30;
                if (nextStart + duration <= gapEnd) {
                  slots.push({
                    time: formatMins(nextStart),
                    mins: nextStart,
                    barberId: prof.id,
                    barberName: prof.name,
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
  }, [selectedService, date, professionals, reservations, timeBlocks, specialJourneys]);

  const handleSelectSlot = (time: string, barberId: string) => {
    if (selectedServiceId) {
      onSelectSlot(time, barberId, selectedServiceId);
      setSelectedServiceId('');
      setSearchQuery('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[480px] p-6 rounded-3xl bg-background border shadow-2xl">
        {!selectedServiceId ? (
          // STEP 1: Select Service
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Zap className="h-5 w-5 fill-current" />
                </div>
                <span>Consulta de Espacio Rápido</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Selecciona un servicio para buscar los horarios disponibles hoy ({date ? format(date, "dd 'de' MMMM", { locale: es }) : ''}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Servicio solicitado
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar servicio..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                  {searchQuery && (
                    <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="h-10 px-3 text-xs">
                      Limpiar
                    </Button>
                  )}
                </div>

                <ScrollArea className="h-[280px] border rounded-xl bg-muted/20 p-2 mt-2">
                  {filteredServices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground text-xs gap-1">
                      <AlertCircle className="w-4 h-4 text-muted-foreground/60" />
                      <span>No se encontraron servicios.</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredServices.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedServiceId(s.id)}
                          className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors hover:bg-muted text-foreground"
                        >
                          <span>{s.name}</span>
                          <span className="text-muted-foreground">
                            {s.duration} min | ${s.price}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t mt-4">
              <Button variant="ghost" onClick={onClose} className="rounded-xl h-10 px-4 text-xs font-semibold">
                Cerrar
              </Button>
            </div>
          </>
        ) : (
          // STEP 2: View Slots
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedServiceId('')}
                  className="h-8 w-8 rounded-xl -ml-2 hover:bg-muted"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <span>Horarios Disponibles</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Espacios libres para <strong>{selectedService?.name}</strong> ({selectedService?.duration} min) hoy ({date ? format(date, "dd 'de' MMMM", { locale: es }) : ''}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                {availableSlots.length === 0 ? (
                  <div className="border border-dashed border-destructive/20 rounded-2xl p-8 text-center text-xs text-destructive flex flex-col items-center justify-center gap-2 bg-destructive/5 min-h-[280px]">
                    <AlertCircle className="w-5 h-5 text-destructive/60 animate-bounce" />
                    <span className="font-bold text-sm">Sin disponibilidad</span>
                    <span className="max-w-[280px] text-muted-foreground">No hay espacios libres hoy de {selectedService?.duration} min para este servicio.</span>
                    <Button variant="outline" size="sm" onClick={() => setSelectedServiceId('')} className="mt-4 rounded-xl font-semibold">
                      Elegir otro servicio
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] border rounded-2xl bg-muted/10 p-3">
                    <div className="space-y-2">
                      {availableSlots.slice(0, 15).map((slot, idx) => (
                        <button
                          key={`${slot.barberId}-${slot.time}-${idx}`}
                          onClick={() => handleSelectSlot(slot.time, slot.barberId)}
                          className="w-full border bg-card hover:bg-muted/30 hover:border-primary/30 py-2 px-3 rounded-xl flex items-center justify-between transition-all group active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                              <Clock className="w-3.5 h-3.5" />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-black text-foreground">{slot.time} hrs</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
                                <User className="w-3 h-3" /> Con {slot.barberName}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              {slot.gapMinutes} min libre
                            </span>
                            <p className="text-[10px] text-muted-foreground mt-0.5 group-hover:text-primary transition-colors font-medium">
                              Agendar ahora →
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>

            <div className="flex justify-between pt-2 border-t mt-4">
              <Button variant="ghost" onClick={() => setSelectedServiceId('')} className="rounded-xl h-10 px-4 text-xs font-semibold">
                Atrás
              </Button>
              <Button variant="ghost" onClick={onClose} className="rounded-xl h-10 px-4 text-xs font-semibold">
                Cerrar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
