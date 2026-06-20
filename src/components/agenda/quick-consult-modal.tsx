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
import { Zap, Clock, User, AlertCircle, Sparkles } from 'lucide-react';
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

      // 3. Shift bounds
      const daySchedule = prof.schedule?.[dayOfWeek];
      if (!daySchedule || !daySchedule.enabled || !daySchedule.start || !daySchedule.end) return;

      const startTimeLimit = parseTime(daySchedule.start);
      const endTimeLimit = parseTime(daySchedule.end);

      // 4. Busy Intervals
      const busyIntervals: { start: number; end: number }[] = [];

      // Breaks
      if (daySchedule.breaks && Array.isArray(daySchedule.breaks)) {
        daySchedule.breaks.forEach((b: any) => {
          if (b.start && b.end) {
            busyIntervals.push({ start: parseTime(b.start), end: parseTime(b.end) });
          }
        });
      }

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

      // Time Blocks
      timeBlocks.forEach(block => {
        if (block.fecha === formattedDate && block.barbero_id === prof.id && block.hora_inicio && block.hora_fin) {
          busyIntervals.push({ start: parseTime(block.hora_inicio), end: parseTime(block.hora_fin) });
        }
      });

      // 5. Merge busy intervals
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

      // 6. Define blocks list including boundaries
      const allBlocks = [
        { start: -Infinity, end: startTimeLimit },
        ...mergedBusy,
        { start: endTimeLimit, end: Infinity },
      ];

      // 7. Find free gaps and generate options
      for (let i = 0; i < allBlocks.length - 1; i++) {
        const gapStart = allBlocks[i].end;
        const gapEnd = allBlocks[i + 1].start;
        const gapDuration = gapEnd - gapStart;

        if (gapDuration >= duration) {
          // If date is today, slot must start in the future
          let effectiveStart = gapStart;
          if (isDateToday) {
            // Buffer of 5 minutes for walk-in consults
            effectiveStart = Math.max(gapStart, currentMins + 5);
          }

          if (effectiveStart + duration <= gapEnd) {
            // Align start time to the next 5-minute interval
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

              // Add a secondary option in the same gap if it's very large (e.g. 60+ mins extra)
              const nextStart = alignedStart + 30; // 30 minutes later
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

    // Sort all slots by start time (mins) ascending
    return slots.sort((a, b) => a.mins - b.mins);
  }, [selectedService, date, professionals, reservations, timeBlocks]);

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
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-600">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <span>Consulta de Espacio Rápido</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Encuentra de inmediato el horario libre más próximo para atender a un cliente presencial hoy ({date ? format(date, "dd 'de' MMMM", { locale: es }) : ''}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Service Search / Select */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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

            <ScrollArea className="h-[140px] border rounded-xl bg-muted/20 p-2">
              {filteredServices.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-6 text-muted-foreground text-xs gap-1">
                  <AlertCircle className="w-4 h-4 text-muted-foreground/60" />
                  <span>No se encontraron servicios.</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredServices.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedServiceId(s.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                        selectedServiceId === s.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <span>{s.name}</span>
                      <span className={selectedServiceId === s.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}>
                        {s.duration} min | ${s.price}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Results List */}
          <div className="space-y-2 flex-grow flex flex-col min-h-0">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Horarios disponibles (Próximos)
            </label>

            {!selectedServiceId ? (
              <div className="border border-dashed rounded-2xl p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2 bg-muted/10 min-h-[160px]">
                <Sparkles className="w-5 h-5 text-muted-foreground/40 animate-pulse" />
                <span>Selecciona un servicio arriba para ver las horas disponibles.</span>
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="border border-dashed border-destructive/20 rounded-2xl p-8 text-center text-xs text-destructive flex flex-col items-center justify-center gap-2 bg-destructive/5 min-h-[160px]">
                <AlertCircle className="w-5 h-5 text-destructive/60" />
                <span>No hay espacios libres hoy de {selectedService?.duration} min para este servicio.</span>
              </div>
            ) : (
              <ScrollArea className="h-[200px] border rounded-2xl bg-muted/10 p-3">
                <div className="space-y-2">
                  {availableSlots.slice(0, 10).map((slot, idx) => (
                    <button
                      key={`${slot.barberId}-${slot.time}-${idx}`}
                      onClick={() => handleSelectSlot(slot.time, slot.barberId)}
                      className="w-full border bg-card hover:bg-muted/30 hover:border-primary/30 p-3 rounded-xl flex items-center justify-between transition-all group active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-black text-foreground">{slot.time} hrs</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" /> Con {slot.barberName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          {slot.gapMinutes} min libre
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-1 group-hover:text-primary transition-colors font-medium">
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

        <div className="flex justify-end pt-2 border-t mt-4">
          <Button variant="ghost" onClick={onClose} className="rounded-xl h-10 px-4 text-xs font-semibold">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
