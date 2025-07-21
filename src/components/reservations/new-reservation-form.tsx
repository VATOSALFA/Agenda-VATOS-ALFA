
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import { parse, format, set } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { User, Scissors, Tag, Calendar as CalendarIcon, Clock, Loader2 } from 'lucide-react';
import type { Profesional, Service } from '@/lib/types';
import type { Client } from '@/lib/types';


const reservationSchema = z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  barbero_id: z.string().min(1, 'Debes seleccionar un barbero.'),
  servicio: z.string().min(1, 'Debes seleccionar un servicio.'),
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  hora_inicio: z.string().min(1, 'Debes seleccionar una hora de inicio.'),
  notas: z.string().optional(),
});

type ReservationFormData = z.infer<typeof reservationSchema>;

interface NewReservationFormProps {
  onFormSubmit: () => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialData?: {
    cliente_id?: string;
    barbero_id?: string;
    fecha?: Date;
    hora_inicio?: string;
  };
}

export function NewReservationForm({ isOpen, onOpenChange, onFormSubmit, initialData }: NewReservationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', where('active', '==', true));
  
  const form = useForm<ReservationFormData>({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      notas: '',
      ...initialData,
      fecha: initialData?.fecha || new Date(),
    },
  });
  
  useEffect(() => {
    if (initialData) {
      form.reset({
        ...initialData,
        fecha: initialData.fecha || new Date(),
        notas: '',
      });
    }
  }, [initialData, form]);

  const selectedBarberId = form.watch('barbero_id');
  const selectedDate = form.watch('fecha');
  const selectedService = form.watch('servicio');

  const getServiceDuration = useCallback((serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
    return service ? service.duration : 30; // default to 30 mins
  }, [services]);

  const generateTimeSlots = useCallback((professional: Profesional | undefined, date: Date | undefined) => {
    if (!professional || !date || !professional.schedule) return [];
    
    const dayOfWeek = format(date, 'eeee', { locale: es }).toLowerCase();
    const schedule = professional.schedule[dayOfWeek as keyof typeof professional.schedule];
    
    if (!schedule || !schedule.enabled) return [];

    const [startHour, startMinute] = schedule.start.split(':').map(Number);
    const [endHour, endMinute] = schedule.end.split(':').map(Number);
    
    const slots = [];
    let currentTime = set(date, { hours: startHour, minutes: startMinute, seconds: 0, milliseconds: 0 });
    const endTime = set(date, { hours: endHour, minutes: endMinute, seconds: 0, milliseconds: 0 });

    while (currentTime < endTime) {
      slots.push(format(currentTime, 'HH:mm'));
      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }
    return slots;
  }, []);

  useEffect(() => {
    const fetchAvailableTimes = async () => {
      if (!selectedBarberId || !selectedDate || !selectedService) {
        if(initialData?.hora_inicio) {
           setAvailableTimes([initialData.hora_inicio]);
        } else {
           setAvailableTimes([]);
        }
        return;
      }
      
      const professional = professionals.find(b => b.id === selectedBarberId);
      if (!professional) {
        setAvailableTimes([]);
        return;
      }
      
      const allSlots = generateTimeSlots(professional, selectedDate);
      if (allSlots.length === 0) {
        setAvailableTimes([]);
        return;
      }

      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
      
      const reservationsQuery = query(
        collection(db, 'reservas'),
        where('barbero_id', '==', selectedBarberId),
        where('fecha', '==', formattedDate)
      );

      const blocksQuery = query(
        collection(db, 'bloqueos_horario'),
        where('barbero_id', '==', selectedBarberId),
        where('fecha', '==', formattedDate)
      );
      
      const [reservationsSnap, blocksSnap] = await Promise.all([
        getDocs(reservationsQuery),
        getDocs(blocksQuery),
      ]);

      const bookedSlots = new Set<string>();

      reservationsSnap.forEach(doc => {
        const { hora_inicio, hora_fin } = doc.data();
        for (let slot of allSlots) {
          if (slot >= hora_inicio && slot < hora_fin) {
            bookedSlots.add(slot);
          }
        }
      });

      blocksSnap.forEach(doc => {
        const { hora_inicio, hora_fin } = doc.data();
         for (let slot of allSlots) {
          if (slot >= hora_inicio && slot < hora_fin) {
            bookedSlots.add(slot);
          }
        }
      });
      
      const filteredSlots = allSlots.filter(slot => !bookedSlots.has(slot));
      setAvailableTimes(filteredSlots);
    };

    fetchAvailableTimes();
  }, [selectedBarberId, selectedDate, selectedService, professionals, services, generateTimeSlots, initialData]);

  async function onSubmit(data: ReservationFormData) {
    setIsSubmitting(true);
    try {
      const serviceDuration = getServiceDuration(data.servicio);
      const [hour, minute] = data.hora_inicio.split(':').map(Number);
      const startTime = set(data.fecha, { hours: hour, minutes: minute });
      
      const endTime = new Date(startTime.getTime() + serviceDuration * 60000);

      const formattedDate = format(data.fecha, 'yyyy-MM-dd');
      const conflictsQuery = query(
        collection(db, 'reservas'),
        where('barbero_id', '==', data.barbero_id),
        where('fecha', '==', formattedDate),
        where('hora_inicio', '<', format(endTime, 'HH:mm')),
        where('hora_fin', '>', data.hora_inicio)
      );
      const conflictsSnap = await getDocs(conflictsQuery);

      if (!conflictsSnap.empty) {
        toast({
          variant: 'destructive',
          title: 'Error de Horario',
          description: 'El horario seleccionado ya no está disponible. Por favor, elige otro.',
        });
        setIsSubmitting(false);
        return;
      }

      await addDoc(collection(db, 'reservas'), {
        ...data,
        fecha: formattedDate,
        hora_fin: format(endTime, 'HH:mm'),
        estado: 'confirmada',
        canal_reserva: 'agenda',
        creada_por: 'admin',
        creado_en: Timestamp.now(),
      });

      toast({
        title: '¡Éxito!',
        description: 'La reserva ha sido creada correctamente.',
      });
      form.reset();
      onFormSubmit();
    } catch (error) {
      console.error('Error creating reservation: ', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo crear la reserva. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
     <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <DialogHeader>
                <DialogTitle>Nueva Reserva</DialogTitle>
                <DialogDescription>
                    Completa los detalles para agendar una nueva cita.
                </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 px-1 max-h-[60vh] overflow-y-auto">
                <FormField
                    control={form.control}
                    name="cliente_id"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Cliente</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={clientsLoading}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder={clientsLoading ? "Cargando clientes..." : "Selecciona un cliente"} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {clients.map(client => (
                            <SelectItem key={client.id} value={client.id}>
                                {client.nombre} {client.apellido}
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
                    name="barbero_id"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center"><Scissors className="mr-2 h-4 w-4" /> Barbero</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={professionalsLoading}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder={professionalsLoading ? "Cargando barberos..." : "Selecciona un barbero"} />
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
                    name="servicio"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center"><Tag className="mr-2 h-4 w-4" /> Servicio</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={servicesLoading}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder={servicesLoading ? 'Cargando servicios...' : 'Selecciona un servicio'} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {services.map(service => (
                            <SelectItem key={service.id} value={service.name}>
                                {service.name}
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
                                {field.value ? (
                                format(field.value, "PPP", { locale: es })
                                ) : (
                                <span>Selecciona una fecha</span>
                                )}
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

                <FormField
                    control={form.control}
                    name="hora_inicio"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center"><Clock className="mr-2 h-4 w-4" /> Hora de Inicio</FormLabel>
                        <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        disabled={!selectedBarberId || !selectedDate || !selectedService || availableTimes.length === 0}
                        >
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder={
                                !selectedBarberId || !selectedDate || !selectedService 
                                    ? "Completa los campos anteriores" 
                                    : availableTimes.length === 0 
                                    ? "No hay horarios disponibles" 
                                    : "Selecciona una hora"
                                } />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {initialData?.hora_inicio && !availableTimes.includes(initialData.hora_inicio) && (
                                <SelectItem value={initialData.hora_inicio}>
                                    {initialData.hora_inicio}
                                </SelectItem>
                            )}
                            {availableTimes.map(time => (
                            <SelectItem key={time} value={time}>
                                {time}
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
                    name="notas"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Notas (Opcional)</FormLabel>
                        <FormControl>
                        <Textarea placeholder="Alergias, preferencias especiales, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                </div>
                
                <DialogFooter>
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Reserva
                </Button>
                </DialogFooter>
            </form>
            </Form>
        </DialogContent>
     </Dialog>
  );
}
