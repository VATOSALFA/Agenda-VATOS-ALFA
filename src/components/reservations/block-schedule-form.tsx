
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import { format, set } from 'date-fns';
import { useState, useEffect, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Scissors, Lock, Calendar as CalendarIcon, Clock, Loader2, CalendarX2, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { es } from 'date-fns/locale';
import type { Profesional } from '@/lib/types';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';

const blockSchema = z.object({
  barbero_id: z.string().min(1, 'Debes seleccionar un barbero.'),
  motivo: z.string().min(3, 'El motivo debe tener al menos 3 caracteres.').max(50, 'El motivo no puede exceder los 50 caracteres.'),
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  hora_inicio: z.string().min(1, 'Debes seleccionar una hora de inicio.'),
  hora_fin: z.string().min(1, 'Debes seleccionar una hora de fin.'),
  local_id: z.string().min(1, 'El local es requerido.'),
}).refine(data => data.hora_fin > data.hora_inicio, {
  message: 'La hora de fin debe ser posterior a la hora de inicio.',
  path: ['hora_fin'],
});

type BlockFormData = z.infer<typeof blockSchema>;

interface BlockScheduleFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onFormSubmit: () => void;
  initialData?: {
    barbero_id: string;
    fecha: Date;
    hora_inicio: string;
  }
}

export function BlockScheduleForm({ isOpen, onOpenChange, onFormSubmit, initialData }: BlockScheduleFormProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { selectedLocalId } = useLocal();

  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));

  const form = useForm<BlockFormData>({
    resolver: zodResolver(blockSchema),
    defaultValues: {
      motivo: '',
    },
  });

  const selectedBarberId = form.watch('barbero_id');
  const selectedDate = form.watch('fecha');

  useEffect(() => {
    if (initialData) {
      form.reset({
        barbero_id: initialData.barbero_id,
        fecha: initialData.fecha,
        hora_inicio: initialData.hora_inicio,
        motivo: '',
        local_id: selectedLocalId || '',
      });
    } else {
      form.reset({
        fecha: new Date(),
        motivo: '',
        local_id: selectedLocalId || '',
      });
    }
  }, [initialData, form, isOpen, selectedLocalId]);

  const timeSlots = useMemo(() => {
    if (!selectedBarberId || !selectedDate || !professionals) return [];

    const professional = professionals.find(p => p.id === selectedBarberId);
    if (!professional) return [];

    const dayOfWeek = format(selectedDate, 'eeee', { locale: es })
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // remove accents

    const schedule = professional.schedule?.[dayOfWeek as keyof typeof professional.schedule];

    let startHour = 8;
    let startMinute = 0;
    let endHour = 21;
    let endMinute = 0;

    if (schedule && schedule.enabled && schedule.start && schedule.end) {
      [startHour, startMinute] = schedule.start.split(':').map(Number);
      [endHour, endMinute] = schedule.end.split(':').map(Number);
    } else if (!schedule || !schedule.enabled) {
      // Si el barbero no tiene horario habilitado este día, permitir rango estándar para poder bloquearlo
      startHour = 8;
      startMinute = 0;
      endHour = 21;
      endMinute = 0;
    }

    const slots: string[] = [];
    let currentTime = set(selectedDate, { hours: startHour, minutes: startMinute, seconds: 0, milliseconds: 0 });
    const endTime = set(selectedDate, { hours: endHour, minutes: endMinute, seconds: 0, milliseconds: 0 });

    while (currentTime <= endTime) {
      slots.push(format(currentTime, 'HH:mm'));
      currentTime.setMinutes(currentTime.getMinutes() + 15);
    }

    if (initialData?.hora_inicio && !slots.includes(initialData.hora_inicio)) {
      slots.push(initialData.hora_inicio);
      slots.sort();
    }

    return slots;
  }, [selectedBarberId, selectedDate, professionals, initialData]);


  async function onSubmit(data: BlockFormData) {
    if (!db) {
      toast({ variant: 'destructive', title: 'Error de base de datos' });
      return;
    }
    setIsSubmitting(true);
    try {
      const formattedDate = format(data.fecha, 'yyyy-MM-dd');

      const conflictQuery = query(
        collection(db, 'reservas'),
        where('fecha', '==', formattedDate)
      );

      const querySnapshot = await getDocs(conflictQuery);
      const activeConflicts = querySnapshot.docs.filter(doc => {
        const res = doc.data();
        if (res.estado === 'Cancelado' || res.estado === 'No asiste') return false;

        // Verificar si pertenece al barbero seleccionado (principal o en items)
        const isForBarber = res.barbero_id === data.barbero_id ||
          (Array.isArray(res.items) && res.items.some((item: any) => item?.barbero_id === data.barbero_id));

        if (!isForBarber) return false;

        // Verificar traslape de horario
        return data.hora_inicio < res.hora_fin && data.hora_fin > res.hora_inicio;
      });

      if (activeConflicts.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Conflicto de Horario',
          description: `El barbero ya tiene ${activeConflicts.length} reserva(s) activa(s) en el rango seleccionado.`,
        });
        setIsSubmitting(false);
        return;
      }

      await addDoc(collection(db, 'bloqueos_horario'), {
        barbero_id: data.barbero_id,
        motivo: data.motivo,
        fecha: formattedDate,
        hora_inicio: data.hora_inicio,
        hora_fin: data.hora_fin,
        creado_en: Timestamp.now(),
        local_id: data.local_id,
      });

      toast({
        title: 'Horario bloqueado con éxito',
        duration: 2000,
      });
      onFormSubmit();
      handleOpenChange(false);

    } catch (error) {
      console.error('Error al guardar el bloqueo:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el bloqueo. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Safety hack: Force unlock body after animation to prevent freezing
      setTimeout(() => {
        document.body.style.removeProperty('pointer-events');
        document.body.style.removeProperty('overflow');
        document.body.removeAttribute('data-scroll-locked');
      }, 500);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        hideCloseButton={true}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="max-w-lg p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background flex flex-col"
      >
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          {/* Haz de luz animado en diagonal */}
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <CalendarX2 className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Bloquear Horario
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Selecciona un barbero y un rango horario para marcarlo como no disponible en la agenda.
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 p-5">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <FormField
                control={form.control}
                name="barbero_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Scissors className="mr-2 h-4 w-4 text-slate-400" /> Barbero</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={professionalsLoading}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-xl border-border/80 bg-card hover:bg-muted/20 focus:border-blue-500 font-medium text-xs sm:text-sm">
                          <SelectValue placeholder={professionalsLoading ? 'Cargando...' : 'Selecciona un barbero'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-60 p-1.5 min-w-[210px]">
                        {professionals.map(professional => (
                          <SelectItem
                            key={professional.id}
                            value={professional.id}
                            textValue={professional.publicName || professional.name}
                            className="py-1.5 px-2 rounded-lg cursor-pointer my-0.5"
                          >
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-6 w-6 border border-border/60 shrink-0">
                                <AvatarImage src={professional.avatarUrl} alt={professional.publicName || professional.name} />
                                <AvatarFallback className="bg-[#202A49] text-white font-bold text-[9px]">
                                  {(professional.publicName || professional.name || 'P').substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-semibold text-xs text-foreground leading-tight">
                                {professional.publicName || professional.name}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Lock className="mr-2 h-4 w-4 text-slate-400" /> Motivo del bloqueo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Almuerzo, día libre, evento" className="h-10 rounded-xl border-border/80 bg-card" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fecha"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex items-center"><CalendarIcon className="mr-2 h-4 w-4 text-slate-400" /> Fecha</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full h-10 pl-3 text-left font-semibold rounded-xl border-border/80 bg-card hover:bg-muted/20 hover:border-blue-500/50 shadow-xs",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                            {field.value ? format(field.value, "EEEE dd 'de' MMMM", { locale: es }) : format(new Date(), "EEEE dd 'de' MMMM", { locale: es })}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] overflow-hidden bg-popover" align="start">
                        <Calendar
                          locale={es}
                          mode="single"
                          selected={field.value || new Date()}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hora_inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4 text-slate-400" /> Hora Inicio</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={timeSlots.length === 0}>
                        <FormControl>
                          <SelectTrigger className="h-10 rounded-xl border-border/80 bg-card hover:bg-muted/20 focus:border-blue-500 font-medium text-xs sm:text-sm">
                            <SelectValue placeholder={!selectedBarberId || !selectedDate ? 'Selecciona barbero y fecha' : 'Selecciona'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-52 p-1 min-w-[5rem]">
                          {timeSlots.map(time => (
                            <SelectItem key={`start-${time}`} value={time}>{time}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hora_fin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4 text-slate-400" /> Hora Fin</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={timeSlots.length === 0}>
                        <FormControl>
                          <SelectTrigger className="h-10 rounded-xl border-border/80 bg-card hover:bg-muted/20 focus:border-blue-500 font-medium text-xs sm:text-sm">
                            <SelectValue placeholder={!selectedBarberId || !selectedDate ? 'Selecciona barbero y fecha' : 'Selecciona'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-52 p-1 min-w-[5rem]">
                          {timeSlots.map(time => (
                            <SelectItem key={`end-${time}`} value={time}>{time}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto btn-vatos-alfa rounded-xl font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Bloqueo
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
