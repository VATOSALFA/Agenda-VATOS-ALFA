

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, getDocs, query, where, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import { parse, format, set, parseISO, getDay } from 'date-fns';
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
import { User, Scissors, Tag, Calendar as CalendarIcon, Clock, Loader2, RefreshCw, Circle, UserPlus, Lock } from 'lucide-react';
import type { Profesional, Service, Reservation } from '@/lib/types';
import type { Client } from '@/lib/types';
import { NewClientForm } from '../clients/new-client-form';


const reservationSchema = z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  barbero_id: z.string().min(1, 'Debes seleccionar un barbero.'),
  servicio: z.string().min(1, 'Debes seleccionar un servicio.'),
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  hora_inicio_h: z.string().min(1, 'Selecciona hora.'),
  hora_inicio_m: z.string().min(1, 'Selecciona minuto.'),
  precio: z.coerce.number().optional(),
  estado: z.string().optional(),
  notas: z.string().optional(),
  nota_interna: z.string().optional(),
});

type ReservationFormData = z.infer<typeof reservationSchema>;

interface NewReservationFormProps {
  onFormSubmit: () => void;
  onSaveChanges?: (data: any) => void;
  isOpen?: boolean; // For standalone dialog usage
  onOpenChange?: (isOpen: boolean) => void; // For standalone dialog usage
  isEditMode?: boolean;
  initialData?: Partial<Reservation> & {id?: string};
}

const statusOptions = [
    { value: 'Reservado', label: 'Reservado', color: 'bg-blue-500' },
    { value: 'Confirmado', label: 'Confirmado', color: 'bg-yellow-500' },
    { value: 'Asiste', label: 'Asiste', color: 'bg-pink-500' },
    { value: 'No asiste', label: 'No asiste', color: 'bg-orange-500' },
    { value: 'Pendiente', label: 'Pendiente', color: 'bg-red-500' },
    { value: 'En espera', label: 'En espera', color: 'bg-green-500' },
];

const minutesOptions = ['00', '15', '30', '45'];


export function NewReservationForm({ isOpen, onOpenChange, onFormSubmit, onSaveChanges, initialData, isEditMode = false }: NewReservationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  
  const { data: clients, loading: clientsLoading, key: clientQueryKey, setKey: setClientQueryKey } = useFirestoreQuery<Client>('clientes');
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', where('active', '==', true));
  
  const form = useForm<ReservationFormData>({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      notas: '',
      nota_interna: '',
      estado: 'Reservado',
      precio: 0,
    },
  });
  
  const selectedService = form.watch('servicio');
  const selectedProfessionalId = form.watch('barbero_id');
  const selectedDate = form.watch('fecha');
  const selectedHour = form.watch('hora_inicio_h');
  const selectedMinute = form.watch('hora_inicio_m');

  useEffect(() => {
    if (selectedService) {
        const service = services.find(s => s.name === selectedService);
        if (service) {
            form.setValue('precio', service.price);
        }
    }
  }, [selectedService, services, form]);

  const { hoursOptions, timeSlots } = useMemo(() => {
    if (!selectedProfessionalId || !selectedDate) {
      return { hoursOptions: [], timeSlots: [] };
    }
    const professional = professionals.find(p => p.id === selectedProfessionalId);
    if (!professional || !professional.schedule) {
      return { hoursOptions: [], timeSlots: [] };
    }

    const dayOfWeekIndex = getDay(selectedDate);
    const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const dayOfWeek = dayNames[dayOfWeekIndex];
    
    const schedule = professional.schedule[dayOfWeek as keyof typeof professional.schedule];
    
    if (!schedule || !schedule.enabled) {
      return { hoursOptions: [], timeSlots: [] };
    }

    const [startHour] = schedule.start.split(':').map(Number);
    const [endHour] = schedule.end.split(':').map(Number);
    
    const hOptions = [];
    for (let i = startHour; i <= endHour; i++) {
        hOptions.push(String(i).padStart(2, '0'));
    }

    const slots = [];
    let currentTime = set(selectedDate, { hours: startHour, minutes: 0 });
    const endTime = set(selectedDate, { hours: endHour, minutes: 0 });

    while (currentTime < endTime) {
        slots.push(format(currentTime, 'HH:mm'));
        currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30 minutes
    }

    return { hoursOptions: hOptions, timeSlots: slots };
  }, [selectedProfessionalId, selectedDate, professionals]);

  // Real-time availability check
  useEffect(() => {
    if (selectedProfessionalId && selectedDate && selectedHour && selectedMinute) {
      form.clearErrors('barbero_id'); // Clear previous errors
      const professional = professionals.find(p => p.id === selectedProfessionalId);
      if (!professional || !professional.schedule) return;

      const dayOfWeekIndex = getDay(selectedDate);
      const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      const dayOfWeek = dayNames[dayOfWeekIndex];
      const schedule = professional.schedule[dayOfWeek as keyof typeof professional.schedule];
      
      const selectedTime = `${selectedHour}:${selectedMinute}`;

      if (!schedule || !schedule.enabled || selectedTime < schedule.start || selectedTime >= schedule.end) {
        form.setError('barbero_id', {
            type: 'manual',
            message: `El horario o día de la reserva no está disponible para este prestador(${professional.name})`
        });
      }
    }
  }, [selectedProfessionalId, selectedDate, selectedHour, selectedMinute, professionals, form]);


  useEffect(() => {
    if (initialData) {
        let fecha = new Date();
        if (typeof initialData.fecha === 'string') {
            const [year, month, day] = initialData.fecha.split('-').map(Number);
            fecha = new Date(year, month - 1, day);
        } else if (initialData.fecha instanceof Date) {
            fecha = initialData.fecha;
        }
        
        const [h, m] = initialData.hora_inicio?.split(':') || ['',''];

      form.reset({
        cliente_id: initialData.cliente_id,
        barbero_id: initialData.barbero_id,
        servicio: initialData.servicio,
        fecha,
        hora_inicio_h: h,
        hora_inicio_m: m,
        estado: initialData.estado,
        precio: 'precio' in initialData ? initialData.precio : 0,
        notas: initialData.notas,
        nota_interna: initialData.nota_interna,
      });
    }
  }, [initialData, form, isOpen]);


  const getServiceDuration = useCallback((serviceName: string) => {
    const service = services.find(s => s.name === serviceName);
    return service ? service.duration : 30; // default to 30 mins
  }, [services]);

  async function onSubmit(data: any) {
    if (isEditMode && onSaveChanges) {
        const hora_inicio = `${data.hora_inicio_h}:${data.hora_inicio_m}`;
        onSaveChanges({...data, hora_inicio});
        return;
    }
    
    setIsSubmitting(true);
    try {
      const hora_inicio = `${data.hora_inicio_h}:${data.hora_inicio_m}`;
      const serviceDuration = getServiceDuration(data.servicio);
      const startTime = set(data.fecha, { hours: data.hora_inicio_h, minutes: data.hora_inicio_m });
      const endTime = new Date(startTime.getTime() + serviceDuration * 60000);
      const formattedDate = format(data.fecha, 'yyyy-MM-dd');

      const dataToSave = {
        ...data,
        fecha: formattedDate,
        hora_inicio: hora_inicio,
        hora_fin: format(endTime, 'HH:mm'),
        estado: data.estado || 'Reservado',
      };
      
      delete dataToSave.hora_inicio_h;
      delete dataToSave.hora_inicio_m;
      
      if (isEditMode && initialData?.id) {
         const resRef = doc(db, 'reservas', initialData.id);
         await updateDoc(resRef, dataToSave);
         toast({ title: '¡Éxito!', description: 'La reserva ha sido actualizada.'});
      } else {
        await addDoc(collection(db, 'reservas'), {
            ...dataToSave,
            pago_estado: 'Pendiente',
            canal_reserva: 'agenda',
            creada_por: 'admin',
            creado_en: Timestamp.now(),
        });
        toast({ title: '¡Éxito!', description: 'La reserva ha sido creada.' });
      }

      onFormSubmit();
      if(onOpenChange) onOpenChange(false);
      
    } catch (error) {
      console.error('Error guardando la reserva: ', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar la reserva. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleClientCreated = (newClientId: string) => {
    setIsClientModalOpen(false);
    setClientQueryKey(prev => prev + 1);
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  const selectedStatus = form.watch('estado');
  const statusColor = statusOptions.find(s => s.value === selectedStatus)?.color || 'bg-gray-500';

  const FormContent = () => (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
        <DialogHeader className="p-6 flex-row items-center justify-between border-b">
          <div className="space-y-1">
            <DialogTitle>{isEditMode ? 'Editar Reserva' : 'Nueva Reserva'}</DialogTitle>
          </div>
           <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-[180px]">
                        <div className="flex items-center gap-2">
                           <span className={cn('h-3 w-3 rounded-full', statusColor)} />
                           <SelectValue />
                        </div>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {statusOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                                <span className={cn('h-2.5 w-2.5 rounded-full', opt.color)} />
                                {opt.label}
                            </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
        </DialogHeader>

        <div className="flex-grow space-y-6 px-6 py-4 overflow-y-auto">
          {/* Main reservation fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
               <FormField
                  control={form.control}
                  name="fecha"
                  render={({ field }) => (
                    <FormItem className="flex flex-col col-span-3">
                      <FormLabel>Fecha</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground" )}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, "EEEE dd 'de' MMMM 'de' yyyy", { locale: es }) : <span>Selecciona una fecha</span>}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar locale={es} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="col-span-2">
                    <FormLabel>Hora</FormLabel>
                    <div className="flex items-center gap-2">
                        <FormField control={form.control} name="hora_inicio_h" render={({field}) => (<FormItem className="flex-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger></FormControl><SelectContent>{hoursOptions.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)} />
                        <span>:</span>
                        <FormField control={form.control} name="hora_inicio_m" render={({field}) => (<FormItem className="flex-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="MM"/></SelectTrigger></FormControl><SelectContent>{minutesOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)} />
                        <Button variant="ghost" size="icon" type="button"><RefreshCw className="h-4 w-4 text-muted-foreground" /></Button>
                    </div>
                </div>
            </div>

            <FormField control={form.control} name="cliente_id" render={({ field }) => (
                <FormItem>
                    <div className="flex justify-between items-center">
                       <FormLabel>Cliente</FormLabel>
                        <Dialog>
                          <DialogTrigger asChild>
                             <Button type="button" variant="link" size="sm" className="h-auto p-0">
                                <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                             </Button>
                          </DialogTrigger>
                          <DialogContent>
                             <NewClientForm onFormSubmit={handleClientCreated} />
                          </DialogContent>
                        </Dialog>
                    </div>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder={clientsLoading ? 'Cargando...' : 'Busca o selecciona un cliente'} /></SelectTrigger></FormControl>
                        <SelectContent>{clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )}/>
            
            <FormField control={form.control} name="barbero_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Profesional</FormLabel>
                    <div className="flex gap-2">
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder={professionalsLoading ? 'Cargando...' : 'Selecciona un profesional'} /></SelectTrigger></FormControl>
                            <SelectContent>{professionals?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="outline" type="button" size="icon" className="shrink-0"><Lock className="h-4 w-4"/></Button>
                    </div>
                    <FormMessage />
                </FormItem>
            )}/>

             <FormField control={form.control} name="servicio" render={({ field }) => (
                <FormItem>
                    <FormLabel>Servicios</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder={servicesLoading ? 'Cargando...' : 'Busca un servicio'} /></SelectTrigger></FormControl>
                        <SelectContent>{services?.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )}/>
          </div>

          {/* Additional Info */}
          <div className="space-y-4 pt-6 border-t">
            <h3 className="font-semibold text-lg">Información adicional</h3>
             <FormField control={form.control} name="precio" render={({ field }) => (
                <FormItem>
                    <FormLabel>Precio</FormLabel>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <FormControl><Input type="number" className="pl-6" placeholder="0" {...field} /></FormControl>
                    </div>
                    <FormMessage />
                </FormItem>
            )}/>
            <FormField control={form.control} name="notas" render={({ field }) => (
                <FormItem>
                    <FormLabel>Notas compartidas con el cliente</FormLabel>
                    <FormControl><Textarea rows={4} placeholder="Estas notas serán visibles para el cliente" {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )}/>
             <FormField control={form.control} name="nota_interna" render={({ field }) => (
                <FormItem>
                    <FormLabel>Nota interna</FormLabel>
                    <FormControl><Textarea rows={4} placeholder="Estas notas son solo para uso interno" {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )}/>
          </div>
        </div>
        
        <DialogFooter className="p-6 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange && onOpenChange(false)}>Cancelar</Button>
          <Button type="button" variant="secondary">Agregar otra reserva</Button>
          <Button type="submit" disabled={isSubmitting || form.formState.isSubmitting || !!form.formState.errors.barbero_id}>
            {(isSubmitting || form.formState.isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar reserva
          </Button>
        </DialogFooter>
      </form>
    </Form>

    <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
            <NewClientForm onFormSubmit={handleClientCreated} />
        </DialogContent>
    </Dialog>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
            <FormContent />
        </DialogContent>
    </Dialog>
  );
}
