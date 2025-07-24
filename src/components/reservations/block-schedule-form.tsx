

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
import { Scissors, Lock, Calendar as CalendarIcon, Clock, Loader2 } from 'lucide-react';
import { es } from 'date-fns/locale';
import type { Profesional } from '@/lib/types';

const blockSchema = z.object({
  barbero_id: z.string().min(1, 'Debes seleccionar un barbero.'),
  motivo: z.string().min(3, 'El motivo debe tener al menos 3 caracteres.').max(50, 'El motivo no puede exceder los 50 caracteres.'),
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  hora_inicio: z.string().min(1, 'Debes seleccionar una hora de inicio.'),
  hora_fin: z.string().min(1, 'Debes seleccionar una hora de fin.'),
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      });
    } else {
        form.reset({
            fecha: new Date(),
            motivo: '',
        });
    }
  }, [initialData, form, isOpen]);

  const timeSlots = useMemo(() => {
    if (!selectedBarberId || !selectedDate || !professionals) return [];
    
    const professional = professionals.find(p => p.id === selectedBarberId);
    if (!professional || !professional.schedule) return [];

    const dayOfWeek = format(selectedDate, 'eeee', { locale: es })
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // remove accents
      
    const schedule = professional.schedule[dayOfWeek as keyof typeof professional.schedule];
    
    if (!schedule || !schedule.enabled) return [];

    const [startHour, startMinute] = schedule.start.split(':').map(Number);
    const [endHour, endMinute] = schedule.end.split(':').map(Number);
    
    const slots = [];
    let currentTime = set(selectedDate, { hours: startHour, minutes: startMinute, seconds: 0, milliseconds: 0 });
    const endTime = set(selectedDate, { hours: endHour, minutes: endMinute, seconds: 0, milliseconds: 0 });

    while (currentTime <= endTime) {
      slots.push(format(currentTime, 'HH:mm'));
      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }
    return slots;
  }, [selectedBarberId, selectedDate, professionals]);


  async function onSubmit(data: BlockFormData) {
    setIsSubmitting(true);
    try {
      const formattedDate = format(data.fecha, 'yyyy-MM-dd');
      
      const conflictQuery = query(
        collection(db, 'reservas'),
        where('barbero_id', '==', data.barbero_id),
        where('fecha', '==', formattedDate),
        where('hora_fin', '>', data.hora_inicio),
        where('hora_inicio', '<', data.hora_fin)
      );

      const querySnapshot = await getDocs(conflictQuery);
      if (!querySnapshot.empty) {
        toast({
          variant: 'destructive',
          title: 'Conflicto de Horario',
          description: `El barbero ya tiene ${querySnapshot.size} reserva(s) en el rango seleccionado.`,
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
      });
      
      toast({
        title: 'Horario bloqueado con éxito',
        duration: 2000,
      });
      onFormSubmit();
      onOpenChange(false);

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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Bloquear Horario</DialogTitle>
              <DialogDescription>
                Selecciona un barbero y un rango horario para marcarlo como no disponible en la agenda.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-1 max-h-[60vh] overflow-y-auto">
              <FormField
                control={form.control}
                name="barbero_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Scissors className="mr-2 h-4 w-4" /> Barbero</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={professionalsLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={professionalsLoading ? 'Cargando...' : 'Selecciona un barbero'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {professionals.map(professional => (
                          <SelectItem key={professional.id} value={professional.id}>
                            {professional.name}
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
                    <FormLabel className="flex items-center"><Lock className="mr-2 h-4 w-4" /> Motivo del bloqueo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Almuerzo, día libre, evento" {...field} />
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
                    <FormLabel className="flex items-center"><CalendarIcon className="mr-2 h-4 w-4" /> Fecha</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Selecciona una fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          locale={es}
                          mode="single"
                          selected={field.value}
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
                      <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4" /> Hora Inicio</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={timeSlots.length === 0}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={!selectedBarberId || !selectedDate ? 'Selecciona barbero y fecha' : 'Selecciona'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
                      <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4" /> Hora Fin</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={timeSlots.length === 0}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={!selectedBarberId || !selectedDate ? 'Selecciona barbero y fecha' : 'Selecciona'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
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
