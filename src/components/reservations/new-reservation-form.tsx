

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, getDocs, query, where, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import { parse, format, set, getDay, addMinutes, getHours, getMinutes, isToday as dateFnsIsToday } from 'date-fns';
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
import { User, Scissors, Tag, Calendar as CalendarIcon, Clock, Loader2, RefreshCw, Circle, UserPlus, Lock, Edit, X, Mail, Phone, Bell, Plus, Trash2 } from 'lucide-react';
import type { Profesional, Service, Reservation, TimeBlock } from '@/lib/types';
import type { Client } from '@/lib/types';
import { NewClientForm } from '../clients/new-client-form';
import { Card, CardContent } from '../ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Checkbox } from '../ui/checkbox';
import { sendWhatsappConfirmation } from '@/ai/flows/send-whatsapp-flow';
import { Avatar, AvatarFallback } from '../ui/avatar';


const createReservationSchema = (isEditMode: boolean) => z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  items: z.array(
    z.object({
      servicio: z.string().min(1, 'Debes seleccionar un servicio.'),
      barbero_id: z.string().min(1, 'Debes seleccionar un profesional.'),
    })
  ).min(1, 'Debes agregar al menos un servicio.'),
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  hora_inicio_hora: z.string().min(1, "Selecciona una hora."),
  hora_inicio_minuto: z.string().min(1, "Selecciona un minuto."),
  hora_fin_hora: z.string().min(1, "Selecciona una hora de fin."),
  hora_fin_minuto: z.string().min(1, "Selecciona un minuto de fin."),
  precio: z.coerce.number().optional().default(0),
  estado: z.string().optional(),
  notas: z.string().optional(),
  nota_interna: z.string().optional(),
  notifications: z.object({
    email_notification: z.boolean().default(true),
    email_reminder: z.boolean().default(true),
    whatsapp_notification: z.boolean().default(true),
    whatsapp_reminder: z.boolean().default(true),
  }).optional(),
  local_id: z.string().min(1, 'Se requiere un local.')
}).refine(data => {
    if (data.hora_inicio_hora && data.hora_inicio_minuto && data.hora_fin_hora && data.hora_fin_minuto) {
        const start = parseInt(data.hora_inicio_hora) * 60 + parseInt(data.hora_inicio_minuto);
        const end = parseInt(data.hora_fin_hora) * 60 + parseInt(data.hora_fin_minuto);
        return end > start;
    }
    return true;
}, {
    message: 'La hora de fin debe ser posterior a la hora de inicio.',
    path: ['hora_fin_hora'],
}).refine(data => {
    if (isEditMode) return true; // Don't validate past dates when editing
    if (!data.fecha || !data.hora_inicio_hora || !data.hora_inicio_minuto) return true;
    
    const now = new Date();
    const selectedDateTime = new Date(data.fecha);
    selectedDateTime.setHours(parseInt(data.hora_inicio_hora, 10), parseInt(data.hora_inicio_minuto, 10), 0, 0);

    // Allow a small grace period (e.g., 1 minute) to account for delays, only if it's today
    if(dateFnsIsToday(selectedDateTime)){
        now.setMinutes(now.getMinutes() - 1);
    } else {
        selectedDateTime.setHours(0,0,0,0);
        now.setHours(0,0,0,0);
    }
    
    return selectedDateTime >= now;

}, {
    message: 'No se pueden crear reservas en una fecha u hora pasada.',
    path: ['hora_inicio_hora'],
});


type ReservationFormData = z.infer<ReturnType<typeof createReservationSchema>>;

interface NewReservationFormProps {
  onFormSubmit: () => void;
  isOpen?: boolean; // For standalone dialog usage
  onOpenChange?: (isOpen: boolean) => void; // For standalone dialog usage
  isEditMode?: boolean;
  initialData?: Partial<Reservation> & {id?: string};
  isDialogChild?: boolean;
}

const statusOptions = [
    { value: 'Reservado', label: 'Reservado', color: 'bg-blue-500' },
    { value: 'Confirmado', label: 'Confirmado', color: 'bg-yellow-500' },
    { value: 'Asiste', label: 'Asiste', color: 'bg-pink-500' },
    { value: 'No asiste', label: 'No asiste', color: 'bg-orange-500' },
    { value: 'Pendiente', label: 'Pendiente', color: 'bg-red-500' },
    { value: 'En espera', label: 'En espera', color: 'bg-green-500' },
];

export function NewReservationForm({ isOpen, onOpenChange, onFormSubmit, initialData, isEditMode = false, isDialogChild = false }: NewReservationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [availabilityErrors, setAvailabilityErrors] = useState<Record<number, string>>({});
  
  const { data: clients, loading: clientsLoading, key: clientQueryKey, setKey: setClientQueryKey } = useFirestoreQuery<Client>('clientes');
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios', where('active', '==', true));
  const { data: allReservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>('reservas');
  const { data: allTimeBlocks, loading: blocksLoading } = useFirestoreQuery<TimeBlock>('bloqueos_horario');
  
  const form = useForm<ReservationFormData>({
    resolver: zodResolver(createReservationSchema(isEditMode)),
    mode: 'onChange',
    defaultValues: {
      notas: '',
      nota_interna: '',
      estado: 'Reservado',
      precio: 0,
      items: [{ servicio: '', barbero_id: '' }],
      notifications: {
        email_notification: true,
        email_reminder: true,
        whatsapp_notification: true,
        whatsapp_reminder: true,
      }
    },
  });
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  const selectedClientId = form.watch('cliente_id');

  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId)
  }, [selectedClientId, clients]);
  
  const servicesMap = useMemo(() => {
    if (!services) return new Map<string, ServiceType>();
    return new Map(services.map(s => [s.id, s]));
  }, [services]);

  const timeOptions = useMemo(() => {
    const hours = Array.from({ length: 12 }, (_, i) => 10 + i); // 10 AM to 9 PM
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    return { hours, minutes };
  }, []);

  const validateItemsAvailability = useCallback((values: ReservationFormData) => {
    const { items, fecha, hora_inicio_hora, hora_inicio_minuto, hora_fin_hora, hora_fin_minuto } = values;
    const errors: Record<number, string> = {};

    if (!items || !fecha || !hora_inicio_hora || !hora_inicio_minuto || !hora_fin_hora || !hora_fin_minuto) {
      setAvailabilityErrors({});
      return;
    }

    const hora_inicio = `${hora_inicio_hora}:${hora_inicio_minuto}`;
    const hora_fin = `${hora_fin_hora}:${hora_fin_minuto}`;
    const formattedDate = format(fecha, 'yyyy-MM-dd');

    items.forEach((item, index) => {
      if (!item.barbero_id) return;

      const professional = professionals.find(p => p.id === item.barbero_id);
      if (!professional) return;
      
      const dayOfWeek = format(fecha, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const daySchedule = professional.schedule?.[dayOfWeek as keyof typeof professional.schedule];
      
      if (!daySchedule || !daySchedule.enabled || hora_inicio < daySchedule.start || hora_fin > daySchedule.end) {
        errors[index] = `El profesional no está disponible en este horario.`;
        return;
      }

      const reservationConflict = allReservations.some(r => {
        if (!r.items) return false;
        const isSameProfessional = r.items.some(i => i.barbero_id === item.barbero_id);
        if (r.fecha !== formattedDate || !isSameProfessional || (isEditMode && r.id === initialData?.id)) return false;
        return hora_inicio < r.hora_fin && hora_fin > r.hora_inicio;
      });

      if (reservationConflict) {
        errors[index] = `El profesional ya tiene una cita en este horario.`;
        return;
      }
      
      const blockConflict = allTimeBlocks.some(b => {
          if (b.barbero_id !== item.barbero_id || b.fecha !== formattedDate) return false;
          return hora_inicio < b.hora_fin && hora_fin > b.hora_inicio;
      });

      if(blockConflict) {
          errors[index] = `El profesional tiene un bloqueo en este horario.`;
          return;
      }
    });
    setAvailabilityErrors(errors);
  }, [professionals, allReservations, allTimeBlocks, isEditMode, initialData]);

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      // Only validate when a relevant field changes
      if (name && (name.startsWith('items') || ['fecha', 'hora_inicio_hora', 'hora_inicio_minuto'].includes(name))) {
        validateItemsAvailability(value as ReservationFormData);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, validateItemsAvailability]);


  useEffect(() => {
    if (initialData && form && services.length > 0) {
        let fecha = new Date();
        if (typeof initialData.fecha === 'string') {
            const dateParts = initialData.fecha.split('-').map(Number);
            if (dateParts.length === 3) {
                fecha = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            }
        } else if (initialData.fecha instanceof Date) {
            fecha = initialData.fecha;
        } else if ((initialData.fecha as any)?.seconds) {
            fecha = new Date((initialData.fecha as any).seconds * 1000);
        }

        const [startHour = '', startMinute = ''] = initialData.hora_inicio?.split(':') || [];
        const [endHour = '', endMinute = ''] = initialData.hora_fin?.split(':') || [];
        
        let itemsToSet;
        if(isEditMode && initialData.items && services.length > 0) {
            itemsToSet = initialData.items.map(i => ({
                servicio: services.find(s => s.name === i.servicio)?.id || '',
                barbero_id: i.barbero_id || ''
            }));
        } else {
            itemsToSet = [{ 
                servicio: '', 
                barbero_id: (initialData as any).barbero_id || '' 
            }];
        }
        
        form.reset({
            cliente_id: initialData.cliente_id,
            items: itemsToSet,
            fecha,
            hora_inicio_hora: startHour,
            hora_inicio_minuto: startMinute,
            hora_fin_hora: endHour,
            hora_fin_minuto: endMinute,
            estado: initialData.estado,
            precio: initialData.precio || 0,
            notas: initialData.notas || '',
            nota_interna: initialData.nota_interna || '',
            notifications: initialData.notifications || { email_notification: true, email_reminder: true, whatsapp_notification: true, whatsapp_reminder: true },
            local_id: initialData.local_id
        });
    }
}, [initialData, form, isOpen, services, isEditMode]);
  
  // Recalculate price and end time when items change
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (
        type === 'change' &&
        (name?.startsWith('items') || ['fecha', 'hora_inicio_hora', 'hora_inicio_minuto'].includes(name as string))
      ) {
        const { items, fecha, hora_inicio_hora, hora_inicio_minuto } = value;

        if (!items || !servicesMap.size) return;

        const { totalPrice, totalDuration } = items.reduce(
          (acc, currentItem) => {
            const service = servicesMap.get(currentItem?.servicio);
            if (service) {
              acc.totalPrice += service.price || 0;
              acc.totalDuration += service.duration || 0;
            }
            return acc;
          },
          { totalPrice: 0, totalDuration: 0 }
        );

        form.setValue('precio', totalPrice, { shouldValidate: true });

        if (fecha && hora_inicio_hora && hora_inicio_minuto && totalDuration > 0) {
          try {
            const startTime = set(fecha, {
              hours: parseInt(hora_inicio_hora, 10),
              minutes: parseInt(hora_inicio_minuto, 10),
            });
            const endTime = addMinutes(startTime, totalDuration);
            form.setValue('hora_fin_hora', format(endTime, 'HH'), { shouldValidate: true });
            form.setValue('hora_fin_minuto', format(endTime, 'mm'), { shouldValidate: true });
          } catch (e) {
            console.error("Error calculating end time", e);
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, servicesMap]);


  async function onSubmit(data: any) {
    setIsSubmitting(true);
    
    // Final validation check before submitting
    if (Object.keys(availabilityErrors).length > 0) {
        toast({ variant: "destructive", title: "Conflicto de Horario", description: "Uno o más profesionales no están disponibles en el horario seleccionado."});
        setIsSubmitting(false);
        return;
    }

    const hora_inicio = `${data.hora_inicio_hora}:${data.hora_inicio_minuto}`;
    const hora_fin = `${data.hora_fin_hora}:${data.hora_fin_minuto}`;
    const formattedDate = format(data.fecha, 'yyyy-MM-dd');
    
    try {
      const itemsToSave = data.items.map((item: any) => {
          const service = services.find(s => s.id === item.servicio);
          return {
              servicio: service?.name || '',
              barbero_id: item.barbero_id,
              precio: service?.price || 0,
              duracion: service?.duration || 0,
          }
      });

      const dataToSave: Partial<Reservation> & {hora_inicio?: string, hora_fin?: string} = {
        cliente_id: data.cliente_id,
        items: itemsToSave,
        fecha: formattedDate,
        hora_inicio: hora_inicio,
        hora_fin: hora_fin,
        estado: data.estado || 'Reservado',
        precio: data.precio,
        notas: data.notas || '',
        nota_interna: data.nota_interna || '',
        notifications: data.notifications || { email_notification: true, email_reminder: true, whatsapp_notification: true, whatsapp_reminder: true },
        local_id: data.local_id
      };
      
      if (isEditMode && initialData?.id) {
         const resRef = doc(db, 'reservas', initialData.id);
         await updateDoc(resRef, dataToSave);
         toast({ title: '¡Éxito!', description: 'La reserva ha sido actualizada.'});
      } else {
        const docRef = await addDoc(collection(db, 'reservas'), {
            ...dataToSave,
            pago_estado: 'Pendiente',
            canal_reserva: 'agenda',
            creada_por: 'admin',
            creado_en: Timestamp.now(),
        });
        toast({ title: '¡Éxito!', description: 'La reserva ha sido creada.' });
        
        if (dataToSave.notifications?.whatsapp_notification) {
            const client = clients.find(c => c.id === data.cliente_id);
            if (client && client.telefono) {
                sendWhatsappConfirmation({
                    clientName: `${client.nombre} ${client.apellido}`,
                    clientPhone: client.telefono,
                    serviceName: itemsToSave.map((i: any) => i.servicio).join(', '),
                    reservationDate: formattedDate,
                    reservationTime: hora_inicio,
                }).then(() => {
                    toast({ title: 'Notificación de WhatsApp enviada.' });
                }).catch(err => {
                    console.error("WhatsApp send failed:", err);
                    toast({ variant: 'destructive', title: 'Error de WhatsApp', description: 'No se pudo enviar la notificación.'})
                });
            }
        }
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
    if(setClientQueryKey) setClientQueryKey(prev => prev + 1); // Refetch clients
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  const selectedStatus = form.watch('estado');
  const statusColor = statusOptions.find(s => s.value === selectedStatus)?.color || 'bg-gray-500';
  const selectedStatusLabel = statusOptions.find(s => s.value === selectedStatus)?.label;

  const FormContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-2">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Editar Reserva" : "Nueva Reserva"}</DialogTitle>
            <DialogDescription>
              {isEditMode ? "Modifica los detalles de la reserva." : "Completa los detalles para agendar una nueva reserva para tu cliente."}
            </DialogDescription>
          </DialogHeader>
      </div>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pb-4 pt-2 flex-row items-center justify-between border-b">
           <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue>
                                <div className="flex items-center gap-2">
                                    <span className={cn('h-3 w-3 rounded-full', statusColor)} />
                                    <span>{selectedStatusLabel}</span>
                                </div>
                            </SelectValue>
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
        </div>

        <div className="flex-grow space-y-6 px-6 py-4 overflow-y-auto">
          {/* Main reservation fields */}
          <div className="space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <FormField
                control={form.control}
                name="fecha"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground" )}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "EEEE dd 'de' MMMM", { locale: es }) : <span>Selecciona una fecha</span>}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar locale={es} mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus /></PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
                <div className="space-y-2">
                    <FormLabel>Hora</FormLabel>
                    <div className="flex items-center gap-2">
                        <div className="flex-grow space-y-1">
                            <p className="text-xs text-muted-foreground text-center">Inicio</p>
                            <div className="flex items-center gap-1">
                                <FormField control={form.control} name="hora_inicio_hora" render={({field}) => (<FormItem className="flex-grow"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger></FormControl><SelectContent>{timeOptions.hours.map(h => <SelectItem key={h} value={String(h).padStart(2,'0')}>{String(h).padStart(2,'0')}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                                <span>:</span>
                                <FormField control={form.control} name="hora_inicio_minuto" render={({field}) => (<FormItem className="flex-grow"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="MM" /></SelectTrigger></FormControl><SelectContent>{timeOptions.minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                            </div>
                        </div>
                        <span className="pt-6 px-1">a</span>
                        <div className="flex-grow space-y-1">
                            <p className="text-xs text-muted-foreground text-center">Fin</p>
                            <div className="flex items-center gap-1">
                               <FormField control={form.control} name="hora_fin_hora" render={({field}) => (<FormItem className="flex-grow"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger></FormControl><SelectContent>{timeOptions.hours.map(h => <SelectItem key={`end-h-${h}`} value={String(h).padStart(2,'0')}>{String(h).padStart(2,'0')}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                                <span>:</span>
                                <FormField control={form.control} name="hora_fin_minuto" render={({field}) => (<FormItem className="flex-grow"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="MM" /></SelectTrigger></FormControl><SelectContent>{timeOptions.minutes.map(m => <SelectItem key={`end-m-${m}`} value={m}>{m}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                            </div>
                        </div>
                    </div>
                    <FormMessage className="text-center text-xs">
                        {form.formState.errors.hora_inicio_hora?.message}
                    </FormMessage>
                </div>
            </div>

             {selectedClient ? (
                <Card>
                    <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-10 w-10">
                                    <AvatarFallback>{selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-bold">{selectedClient.nombre} {selectedClient.apellido}</p>
                                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                                        <Mail className="h-3 w-3" /> {selectedClient.correo || 'Sin correo'}
                                        <Phone className="h-3 w-3 ml-2" /> {selectedClient.telefono}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsClientModalOpen(true)}><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <FormField control={form.control} name="cliente_id" render={({ field }) => (
                    <FormItem>
                        <div className="flex justify-between items-center">
                            <FormLabel>Cliente</FormLabel>
                            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setIsClientModalOpen(true)}>
                                <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                            </Button>
                        </div>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <FormControl><SelectTrigger><SelectValue placeholder={clientsLoading ? 'Cargando...' : 'Busca o selecciona un cliente'} /></SelectTrigger></FormControl>
                            <SelectContent>{clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}/>
            )}

            {selectedClient && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="notificaciones">
                    <AccordionTrigger>Notificaciones Adicionales</AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2">
                         <FormField control={form.control} name="notifications.email_notification" render={({ field }) => (
                            <FormItem className="flex items-center space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0 font-normal">Enviar email de notificación de reserva</FormLabel></FormItem>
                         )}/>
                          <FormField control={form.control} name="notifications.email_reminder" render={({ field }) => (
                            <FormItem className="flex items-center space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0 font-normal">Enviar email de recordatorio de reserva</FormLabel></FormItem>
                         )}/>
                          {selectedClient?.telefono && (
                            <>
                                <FormField control={form.control} name="notifications.whatsapp_notification" render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0 font-normal">Enviar WhatsApp de notificación de reserva</FormLabel></FormItem>
                                )}/>
                                <FormField control={form.control} name="notifications.whatsapp_reminder" render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0 font-normal">Enviar WhatsApp de recordatorio de reserva</FormLabel></FormItem>
                                )}/>
                            </>
                          )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
            )}


            <div className="space-y-4">
                {fields.map((field, index) => (
                    <Card key={field.id} className="p-4 relative bg-muted/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <FormField control={form.control} name={`items.${index}.servicio`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Servicios</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder={servicesLoading ? 'Cargando...' : 'Busca un servicio'} /></SelectTrigger></FormControl>
                                        <SelectContent>{services?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name={`items.${index}.barbero_id`} render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Profesional</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger className={cn(availabilityErrors[index] && 'border-destructive')}><SelectValue placeholder={professionalsLoading ? 'Cargando...' : 'Selecciona un profesional'} /></SelectTrigger></FormControl>
                                        <SelectContent>{professionals?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                     {availabilityErrors[index] && <p className="text-sm font-medium text-destructive">{availabilityErrors[index]}</p>}
                                </FormItem>
                            )}/>
                        </div>
                        {fields.length > 1 && (
                             <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-destructive" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </Card>
                ))}
                 <Button type="button" variant="outline" size="sm" onClick={() => append({ servicio: '', barbero_id: '' })} className="w-full">
                    <Plus className="mr-2 h-4 w-4" /> Agregar otro servicio
                </Button>
            </div>
          </div>

          {/* Additional Info */}
          <Accordion type="single" collapsible className="px-6">
            <AccordionItem value="item-1">
                <AccordionTrigger>Información adicional</AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
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
                </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        
        <DialogFooter className="flex-shrink-0 p-6 border-t mt-auto">
          <Button type="button" variant="outline" onClick={() => onOpenChange && onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || !form.formState.isValid}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Reserva
          </Button>
        </DialogFooter>
      </form>
    </Form>
    </div>
  );

  if (isDialogChild) {
    return <FormContent />;
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
        <FormContent />
      </DialogContent>
    </Dialog>
    <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
             <DialogHeader>
                <DialogTitle>Crear Nuevo Cliente</DialogTitle>
                <DialogDescription>
                    Completa la información para registrar un nuevo cliente en el sistema.
                </DialogDescription>
              </DialogHeader>
            <NewClientForm onFormSubmit={handleClientCreated} />
        </DialogContent>
    </Dialog>
    </>
  );
}
