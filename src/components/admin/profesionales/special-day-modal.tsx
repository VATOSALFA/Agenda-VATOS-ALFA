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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Horario especial para {profesional.name}</DialogTitle>
          <DialogDescription>
            Agrega, edita o elimina fechas y horarios especiales donde este profesional estará disponible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Saved Days Section ── */}
          {loadingSaved ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeSavedDays.length > 0 ? (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Jornadas programadas</h4>
              <div className="max-h-56 overflow-y-auto space-y-1 border rounded-lg p-2">
                {activeSavedDays.map(day => (
                  <div
                    key={day.id}
                    className="flex items-center justify-between bg-muted/50 p-2.5 rounded-md gap-2"
                  >
                    {editingDayId === day.id ? (
                      /* ── Editing Mode ── */
                      <>
                        <span className="text-sm font-medium flex-1 truncate">
                          {formatSavedDate(day.fecha)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Select value={editStart} onValueChange={setEditStart}>
                            <SelectTrigger className="w-[80px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {timeOptions.map(t => <SelectItem key={`es-${t}`} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">-</span>
                          <Select value={editEnd} onValueChange={setEditEnd}>
                            <SelectTrigger className="w-[80px] h-8 text-xs">
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
                      /* ── Read Mode ── */
                      <>
                        <span className="text-sm font-medium flex-1 truncate">
                          {formatSavedDate(day.fecha)}
                        </span>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
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
            <div className="text-sm text-muted-foreground text-center py-3 border rounded-lg bg-muted/30">
              No hay jornadas especiales programadas.
            </div>
          )}

          {/* ── Past Days (collapsed info) ── */}
          {pastSavedDays.length > 0 && (
            <p className="text-xs text-muted-foreground">
              + {pastSavedDays.length} jornada(s) pasada(s) no visibles.
            </p>
          )}

          {/* ── Add New Day Section ── */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Agregar nueva jornada</h4>
            <div className="p-4 border rounded-lg space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <Controller
                        name="date"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-1">
                                <Label>Fecha</Label>
                                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal px-2 truncate", !field.value && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                                            <span className="truncate">{field.value ? format(field.value, "dd 'de' MMM, yyyy", { locale: es }) : <span>Selecciona fecha</span>}</span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={field.value}
                                            onSelect={(date) => {
                                                field.onChange(date);
                                                setIsCalendarOpen(false);
                                            }}
                                            disabled={(date) => isBefore(date, startOfDay(new Date()))}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}
                    />
                     <Controller
                        name="start"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-1">
                                <Label>Apertura</Label>
                                <Select onValueChange={field.onChange} defaultValue={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{timeOptions.map(time => <SelectItem key={`start-${time}`} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                            </div>
                        )}
                    />
                    <Controller
                        name="end"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-1">
                                <Label>Cierre</Label>
                                <Select onValueChange={field.onChange} defaultValue={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{timeOptions.map(time => <SelectItem key={`end-${time}`} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                            </div>
                        )}
                    />
                </div>
                 <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={handleAddDay}><Plus className="mr-2 h-4 w-4"/>Agregar Día</Button>
                </div>
            </div>
          </div>

          {/* ── Pending New Days ── */}
          {pendingDays.length > 0 && (
              <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Días por guardar</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2 border-dashed">
                      {pendingDays.map(day => (
                          <div key={day.tempId} className="flex items-center justify-between bg-muted/50 p-2.5 rounded-md">
                              <span className="text-sm font-medium">{format(day.date, "eeee, dd 'de' MMMM", { locale: es })}</span>
                              <span className="text-sm text-muted-foreground">{day.start} - {day.end}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeletePending(day.tempId)}>
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                          </div>
                      ))}
                  </div>
              </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
            </Button>
            {pendingDays.length > 0 && (
              <Button onClick={onSubmitNew} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar {pendingDays.length} día(s)
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
