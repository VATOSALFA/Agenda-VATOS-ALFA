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
import { useState, useMemo, useCallback } from 'react';

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
import { DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Scissors, Lock, Calendar as CalendarIcon, Clock, Loader2 } from 'lucide-react';

const timeSlots = Array.from({ length: 24 * 2 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, '0');
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

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

interface Barber {
  id: string;
  nombre_completo: string;
}

interface BlockScheduleFormProps {
  onFormSubmit: () => void;
}

export function BlockScheduleForm({ onFormSubmit }: BlockScheduleFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: barbers, loading: barbersLoading } = useFirestoreQuery<Barber>('barberos');

  const form = useForm<BlockFormData>({
    resolver: zodResolver(blockSchema),
    defaultValues: {
      motivo: '',
    },
  });

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
        title: '¡Éxito!',
        description: 'El horario ha sido bloqueado correctamente.',
      });
      form.reset();
      onFormSubmit();
    } catch (error) {
      console.error('Error blocking schedule: ', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo bloquear el horario. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
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
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={barbersLoading}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={barbersLoading ? 'Cargando...' : 'Selecciona un barbero'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {barbers.map(barber => (
                      <SelectItem key={barber.id} value={barber.id}>
                        {barber.nombre_completo}
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
                        {field.value ? format(field.value, 'PPP') : <span>Selecciona una fecha</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona" />
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona" />
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
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Bloqueo
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
