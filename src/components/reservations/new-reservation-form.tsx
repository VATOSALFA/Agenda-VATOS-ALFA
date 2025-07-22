

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
import { parse, format, set, getDay } from 'date-fns';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { User, Scissors, Tag, Calendar as CalendarIcon, Clock, Loader2, RefreshCw, Circle, UserPlus, Lock, Edit, X, Mail, Phone, Bell } from 'lucide-react';
import type { Profesional, Service, Reservation } from '@/lib/types';
import type { Client } from '@/lib/types';
import { NewClientForm } from '../clients/new-client-form';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';


const reservationSchema = z.object({
  cliente_id: z.string().min(1, 'Debes seleccionar un cliente.'),
  barbero_id: z.string().min(1, 'Debes seleccionar un barbero.'),
  servicio: z.string().min(1, 'Debes seleccionar un servicio.'),
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  hora_inicio_h: z.string().min(1, 'Selecciona hora.'),
  hora_inicio_m: z.string().min(1, 'Selecciona minuto.'),
  precio: z.coerce.number().optional().default(0),
  estado: z.string().optional(),
  notas: z.string().optional(),
  nota_interna: z.string().optional(),
  notifications: z.object({
    email_notification: z.boolean().default(true),
    email_reminder: z.boolean().default(true),
    whatsapp_notification: z.boolean().default(true),
    whatsapp_reminder: z.boolean().default(true),
  }).optional()
});

type ReservationFormData = z.infer<typeof reservationSchema>;

interface NewReservationFormProps {
  onFormSubmit: () => void;
  onSaveChanges?: (data: any) => void;
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

const minutesOptions = ['00', '15', '30', '45'];


export function NewReservationForm({ isOpen, onOpenChange, onFormSubmit, onSaveChanges, initialData, isEditMode = false, isDialogChild = false }: NewReservationFormProps) {
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
      notifications: {
        email_notification: true,
        email_reminder: true,
        whatsapp_notification: true,
        whatsapp_reminder: true,
      }
    },
  });
  
  const selectedService = form.watch('servicio');
  const selectedProfessionalId = form.watch('barbero_id');
  const selectedDate = form.watch('fecha');
  const selectedHour = form.watch('hora_inicio_h');
  const selectedMinute = form.watch('hora_inicio_m');
  const selectedClientId = form.watch('cliente_id');

  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId)
  }, [selectedClientId, clients]);


  useEffect(() => {
    if (selectedService && services) {
        const service = services.find(s => s.name === selectedService);
        if (service) {
            form.setValue('precio', service.price || 0);
        }
    }
  }, [selectedService, services, form]);

  const { hoursOptions } = useMemo(() => {
    const startHour = 10;
    const endHour = 21;
    
    const hOptions = [];
    for (let i = startHour; i <= endHour; i++) {
        hOptions.push(String(i).padStart(2, '0'));
    }

    return { hoursOptions: hOptions };
  }, []);

  // Real-time availability check
  useEffect(() => {
    form.clearErrors('barbero_id'); 
    if (selectedProfessionalId && selectedDate && selectedHour && selectedMinute) {
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
    if (initialData && form) {
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
        
        const [h, m] = initialData.hora_inicio?.split(':') || ['',''];

      form.reset({
        cliente_id: initialData.cliente_id,
        barbero_id: initialData.barbero_id,
        servicio: initialData.servicio,
        fecha,
        hora_inicio_h: h,
        hora_inicio_m: m,
        estado: initialData.estado,
        precio: 'precio' in initialData ? initialData.precio || 0 : 0,
        notas: initialData.notas,
        nota_interna: initialData.nota_interna,
      });
    }
  }, [initialData, form, isOpen]);


  const getServiceDuration = useCallback((serviceName: string) => {
    if (!services) return 30;
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
  const selectedStatusLabel = statusOptions.find(s => s.value === selectedStatus)?.label;

  const FormHeader = isDialogChild ? 'div' : DialogHeader;

  const FormContent = () => (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
        <div className="p-6 flex-row items-center justify-between border-b">
           <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue asChild>
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
                                <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
                            </div>
                        </div>
                        <Accordion type="single" collapsible className="w-full mt-2">
                            <AccordionItem value="notifications">
                                <AccordionTrigger className="text-sm py-2">Notificaciones automáticas de cita y recordatorios</AccordionTrigger>
                                <AccordionContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead></TableHead>
                                                <TableHead className="text-center">Email</TableHead>
                                                <TableHead className="text-center">WhatsApp</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow>
                                                <TableCell className="font-medium">Notificaciones de cita</TableCell>
                                                <TableCell className="text-center"><FormField control={form.control} name="notifications.email_notification" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />} /></TableCell>
                                                <TableCell className="text-center"><FormField control={form.control} name="notifications.whatsapp_notification" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />} /></TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell className="font-medium">Recordatorio</TableCell>
                                                <TableCell className="text-center"><FormField control={form.control} name="notifications.email_reminder" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />} /></TableCell>
                                                <TableCell className="text-center"><FormField control={form.control} name="notifications.whatsapp_reminder" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />} /></TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </CardContent>
                </Card>
            ) : (
                <FormField control={form.control} name="cliente_id" render={({ field }) => (
                    <FormItem>
                        <div className="flex justify-between items-center">
                           <FormLabel>Cliente</FormLabel>
                           <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
                              <DialogTrigger asChild>
                                 <Button type="button" variant="link" size="sm" className="h-auto p-0">
                                    <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                                 </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-lg">
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
            )}
            
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
    </>
  );

  if(isDialogChild) {
    return <FormContent />;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
            <FormContent />
        </DialogContent>
    </Dialog>
  );
}
