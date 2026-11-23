'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, CalendarIcon, Pencil, Check, X } from 'lucide-react';
import type { Profesional } from '@/lib/types';
import { format, isBefore, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

interface SpecialDayModalProps {
  profesional: Profesional;
  isOpen: boolean;
  onClose: () => void;
}

const timeOptions = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${minute}`;
});

interface SavedSpecialDay {
    id: string; // Firestore doc ID
    fecha: string; // yyyy-MM-dd
    hora_inicio: string;
    hora_fin: string;
    profesionalId: string;
    profesionalName: string;
    local_id: string;
}

interface PendingSpecialDay {
    tempId: number;
    date: Date;
    start: string;
    end: string;
}

export function SpecialDayModal({ profesional, isOpen, onClose }: SpecialDayModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Saved days from Firestore
  const [savedDays, setSavedDays] = useState<SavedSpecialDay[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Pending new days (not yet saved)
  const [pendingDays, setPendingDays] = useState<PendingSpecialDay[]>([]);

  // Editing state for saved days
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [deletingDayId, setDeletingDayId] = useState<string | null>(null);
  const [updatingDayId, setUpdatingDayId] = useState<string | null>(null);

  const { control, watch, reset } = useForm({
    defaultValues: {
      date: new Date(),
      start: '09:00',
      end: '18:00',
    }
  });

  // Load saved special days for this professional
  const loadSavedDays = useCallback(async () => {
    if (!db || !profesional.id) return;
    setLoadingSaved(true);
    try {
      const q = query(
        collection(db, 'jornadas_especiales'),
        where('profesionalId', '==', profesional.id)
      );
      const snap = await getDocs(q);
      const days: SavedSpecialDay[] = [];
      snap.forEach(docSnap => {
        days.push({ id: docSnap.id, ...docSnap.data() } as SavedSpecialDay);
      });
      // Sort by date ascending
      days.sort((a, b) => a.fecha.localeCompare(b.fecha));
      setSavedDays(days);
    } catch (error) {
      console.error("Error loading special days:", error);
    } finally {
      setLoadingSaved(false);
    }
  }, [db, profesional.id]);

  // Load when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSavedDays();
      setPendingDays([]);
      reset({ date: new Date(), start: '09:00', end: '18:00' });
    }
  }, [isOpen, loadSavedDays, reset]);

  // Add a new pending day
  const handleAddDay = () => {
    const date = watch('date');
    const start = watch('start');
    const end = watch('end');

    if (start >= end) {
      toast({ variant: 'destructive', title: 'La hora de apertura debe ser antes del cierre.' });
      return;
    }

    const newDay: PendingSpecialDay = {
        tempId: Date.now(),
        date,
        start,
        end,
    };
    setPendingDays(prev => [...prev, newDay]);
  };

  const handleDeletePending = (tempId: number) => {
    setPendingDays(prev => prev.filter(day => day.tempId !== tempId));
  };

  // Delete a saved day from Firestore
  const handleDeleteSaved = async (dayId: string) => {
    if (!db) return;
    setDeletingDayId(dayId);
    try {
      await deleteDoc(doc(db, 'jornadas_especiales', dayId));
      setSavedDays(prev => prev.filter(d => d.id !== dayId));
      toast({ title: 'Jornada eliminada' });
    } catch (error) {
      console.error("Error deleting special day:", error);
      toast({ variant: 'destructive', title: 'Error al eliminar la jornada.' });
    } finally {
      setDeletingDayId(null);
    }
  };

  // Start editing a saved day
  const handleStartEdit = (day: SavedSpecialDay) => {
    setEditingDayId(day.id);
    setEditStart(day.hora_inicio);
    setEditEnd(day.hora_fin);
  };

  const handleCancelEdit = () => {
    setEditingDayId(null);
    setEditStart('');
    setEditEnd('');
  };

  // Save edit to Firestore
  const handleSaveEdit = async (dayId: string) => {
    if (!db) return;
    if (editStart >= editEnd) {
      toast({ variant: 'destructive', title: 'La hora de apertura debe ser antes del cierre.' });
      return;
    }
    setUpdatingDayId(dayId);
    try {
      await updateDoc(doc(db, 'jornadas_especiales', dayId), {
        hora_inicio: editStart,
        hora_fin: editEnd,
      });
      setSavedDays(prev => prev.map(d =>
        d.id === dayId ? { ...d, hora_inicio: editStart, hora_fin: editEnd } : d
      ));
      setEditingDayId(null);
      toast({ title: 'Horario actualizado' });
    } catch (error) {
      console.error("Error updating special day:", error);
      toast({ variant: 'destructive', title: 'Error al actualizar el horario.' });
    } finally {
      setUpdatingDayId(null);
    }
  };

  // Save only the pending (new) days
  const onSubmitNew = async () => {
    if (!db) return;
    if (pendingDays.length === 0) {
        toast({ variant: 'destructive', title: 'No hay días nuevos para guardar.' });
        return;
    }
    setIsSubmitting(true);

    try {
        const promises = pendingDays.map(day => {
            const dataToSave = {
                profesionalId: profesional.id,
                profesionalName: profesional.name,
                local_id: profesional.local_id,
                fecha: format(day.date, 'yyyy-MM-dd'),
                hora_inicio: day.start,
                hora_fin: day.end,
                creado_en: Timestamp.now(),
            };
            return addDoc(collection(db, 'jornadas_especiales'), dataToSave);
        });

        await Promise.all(promises);

        toast({
            title: `${pendingDays.length} jornada(s) guardada(s) con éxito`,
        });
        setPendingDays([]);
        // Reload saved days to show them
        await loadSavedDays();
    } catch (error) {
        console.error("Error guardando jornada especial:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudieron guardar las jornadas. Inténtalo de nuevo."
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  // Filter: only show future or today's saved days, separate past ones
  const today = startOfDay(new Date());
  const activeSavedDays = savedDays.filter(d => {
    const dayDate = new Date(d.fecha + 'T00:00:00');
    return !isBefore(dayDate, today);
  });
  const pastSavedDays = savedDays.filter(d => {
    const dayDate = new Date(d.fecha + 'T00:00:00');
    return isBefore(dayDate, today);
  });

  const formatSavedDate = (fechaStr: string) => {
    try {
      const d = new Date(fechaStr + 'T12:00:00');
      return format(d, "eeee, dd 'de' MMMM yyyy", { locale: es });
    } catch {
      return fechaStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent hideCloseButton={true} className="w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[92dvh] flex flex-col p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 py-3 sm:px-5 sm:py-3.5 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="header-light-beam absolute inset-0 pointer-events-none" />
          <div className="flex items-center gap-2.5 z-10">
            <CalendarIcon className="h-4 w-4 text-slate-300 shrink-0" />
            <div>
              <DialogTitle className="text-sm sm:text-base font-bold text-white leading-tight">
                Jornada Especial: {profesional.name}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-300 hidden sm:block">
                Sustituye el horario regular en fechas específicas (el resto del día queda bloqueado)
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="z-10 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3.5 sm:p-4 flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* COLUMNA IZQUIERDA: Jornadas Programadas */}
            <div className="space-y-2.5">
              {loadingSaved ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : activeSavedDays.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Jornadas programadas ({activeSavedDays.length})</h4>
                  <div className="max-h-60 overflow-y-auto space-y-1.5 border border-border/60 rounded-xl p-2 bg-card">
                    {activeSavedDays.map(day => (
                      <div
                        key={day.id}
                        className="flex items-center justify-between bg-muted/40 p-2 rounded-lg gap-2"
                      >
                        {editingDayId === day.id ? (
                          <>
                            <span className="text-xs font-medium flex-1 truncate">
                              {formatSavedDate(day.fecha)}
                            </span>
                            <div className="flex items-center gap-1">
                              <Select value={editStart} onValueChange={setEditStart}>
                                <SelectTrigger className="w-[74px] h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {timeOptions.map(t => <SelectItem key={`es-${t}`} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <span className="text-xs text-muted-foreground">-</span>
                              <Select value={editEnd} onValueChange={setEditEnd}>
                                <SelectTrigger className="w-[74px] h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {timeOptions.map(t => <SelectItem key={`ee-${t}`} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-primary"
                                onClick={() => handleSaveEdit(day.id)}
                                disabled={updatingDayId === day.id}
                              >
                                {updatingDayId === day.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEdit}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-medium flex-1 truncate">
                              {formatSavedDate(day.fecha)}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap font-sans">
                              {day.hora_inicio} - {day.hora_fin}
                            </span>
                            <div className="flex gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleStartEdit(day)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleDeleteSaved(day.id)}
                                disabled={deletingDayId === day.id}
                              >
                                {deletingDayId === day.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : !loadingSaved && (
                <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border/60 rounded-xl bg-muted/20">
                  No hay jornadas especiales programadas.
                </div>
              )}

              {pastSavedDays.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  + {pastSavedDays.length} jornada(s) pasada(s) no visibles.
                </p>
              )}
            </div>

            {/* COLUMNA DERECHA: Agregar nueva jornada y Días por guardar */}
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Agregar nueva jornada</h4>
                </div>
                <div className="p-3 border border-border/60 rounded-xl bg-card space-y-3">
                  <Controller
                    name="date"
                    control={control}
                    render={({ field }) => (
                      <div className="space-y-1">
                        <Label className="text-xs">Fecha</Label>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left text-xs font-semibold rounded-xl border-border/80 bg-card hover:bg-muted/20 px-3 h-9 truncate", !field.value && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span className="truncate">{field.value ? format(field.value, "EEEE dd 'de' MMMM", { locale: es }) : <span>Selecciona fecha</span>}</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] overflow-hidden bg-popover">
                            <Calendar
                              mode="single"
                              selected={field.value || new Date()}
                              onSelect={(date) => {
                                field.onChange(date);
                                setIsCalendarOpen(false);
                              }}
                              disabled={(date) => isBefore(date, startOfDay(new Date()))}
                              initialFocus
                              locale={es}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Controller
                      name="start"
                      control={control}
                      render={({ field }) => (
                        <div className="space-y-1">
                          <Label className="text-xs">Apertura</Label>
                          <Select onValueChange={field.onChange} defaultValue={field.value}><SelectTrigger className="h-9 rounded-xl border-border/80 bg-card hover:bg-muted/20 text-xs font-semibold"><SelectValue/></SelectTrigger><SelectContent className="max-h-52 p-1 min-w-[5rem]">{timeOptions.map(time => <SelectItem key={`start-${time}`} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                        </div>
                      )}
                    />
                    <Controller
                      name="end"
                      control={control}
                      render={({ field }) => (
                        <div className="space-y-1">
                          <Label className="text-xs">Cierre</Label>
                          <Select onValueChange={field.onChange} defaultValue={field.value}><SelectTrigger className="h-9 rounded-xl border-border/80 bg-card hover:bg-muted/20 text-xs font-semibold"><SelectValue/></SelectTrigger><SelectContent className="max-h-52 p-1 min-w-[5rem]">{timeOptions.map(time => <SelectItem key={`end-${time}`} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                        </div>
                      )}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="outline" onClick={handleAddDay} className="h-8 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-500/10 gap-1.5 rounded-xl">
                      <Plus className="h-3.5 w-3.5"/>Agregar a la lista
                    </Button>
                  </div>
                </div>
              </div>

              {pendingDays.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-semibold text-xs text-foreground">Días por guardar ({pendingDays.length})</h4>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 border border-dashed border-border/60 rounded-xl p-2 bg-muted/10">
                    {pendingDays.map(day => (
                      <div key={day.tempId} className="flex items-center justify-between bg-background p-2 rounded-lg border border-border/40 text-xs">
                        <span className="font-medium text-foreground truncate">{format(day.date, "eeee, dd 'de' MMMM", { locale: es })}</span>
                        <span className="text-muted-foreground font-sans ml-2 shrink-0">{day.start} - {day.end}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400 shrink-0" onClick={() => handleDeletePending(day.tempId)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-border/60 bg-muted/20 flex items-center justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-9 text-xs border-border/60 rounded-xl">
                Cerrar
            </Button>
            {pendingDays.length > 0 && (
              <Button variant="alfa" size="sm" onClick={onSubmitNew} disabled={isSubmitting} className="h-9 px-4 text-xs gap-1.5">
                  {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Guardar {pendingDays.length} día(s)
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
