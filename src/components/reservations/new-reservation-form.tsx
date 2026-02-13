
'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, getDocs, query, where, Timestamp, updateDoc, doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';
import { parse, format, set, getDay, addMinutes, getHours, getMinutes, isToday as dateFnsIsToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClientInput } from './client-input';
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
import { User, Scissors, Tag, Calendar as CalendarIcon, Clock, Loader2, RefreshCw, Circle, UserPlus, Lock, Unlock, Edit, X, Mail, Phone, Bell, Plus, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import type { Profesional, Service as ServiceType, Reservation, TimeBlock, Local, SaleItem as SaleItemType, Product } from '@/lib/types';
import type { Client } from '@/lib/types';
import { NewClientForm } from '../clients/new-client-form';
import { sendManualBookingConfirmation } from '@/lib/actions/booking';
import { Card, CardContent } from '../ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Checkbox } from '../ui/checkbox';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Combobox } from '../ui/combobox';
import { ScrollArea } from '../ui/scroll-area';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { ServiceInput } from './service-input';

interface ReminderSettings {
  notifications: Record<string, { enabled: boolean }>;
}

interface AgendaSettings {
  overlappingReservations: boolean;
  resourceOverload: boolean;
  simultaneousReservations: boolean;
}

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
    whatsapp_notification: z.boolean().default(false),
    whatsapp_reminder: z.boolean().default(false),
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
  if (dateFnsIsToday(selectedDateTime)) {
    now.setMinutes(now.getMinutes() - 1);
  } else {
    selectedDateTime.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
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
  initialData?: Partial<Reservation> & { id?: string };
  isDialogChild?: boolean;
}

const statusOptions = [
  { value: 'Reservado', label: 'Reservado', color: 'bg-blue-500' },
  { value: 'Confirmado', label: 'Confirmado', color: 'bg-yellow-500' },
  { value: 'Asiste', label: 'Asiste', color: 'bg-pink-500' },
  { value: 'No asiste', label: 'No Asistió', color: 'bg-orange-500' },
  { value: 'Pendiente', label: 'Pendiente', color: 'bg-red-500' },
  { value: 'En espera', label: 'En Espera', color: 'bg-green-500' },
];

const ClientCombobox = React.memo(({ clients, loading, value, onChange, onSearchChange }: { clients: Client[], loading: boolean, value: string, onChange: (value: string) => void, onSearchChange?: (val: string) => void }) => {
  return (
    <ClientInput
      clients={clients}
      value={value}
      onChange={onChange}
      loading={loading}
      onSearchChange={onSearchChange}
    />
  );
});

ClientCombobox.displayName = 'ClientCombobox';


// Helper function to safely parse date from various formats
const safeParseDate = (rawDate: any): Date | null => {
  if (!rawDate) return null;
  if (rawDate instanceof Date) return rawDate;
  if (typeof rawDate === 'string') return parseISO(rawDate);
  if (typeof rawDate === 'object' && rawDate !== null && typeof (rawDate as any).seconds === 'number') {
    return new Date((rawDate as any).seconds * 1000);
  }
  return null;
}

export function NewReservationForm({ isOpen, onOpenChange, onFormSubmit, initialData, isEditMode = false, isDialogChild = false }: NewReservationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [availabilityErrors, setAvailabilityErrors] = useState<Record<number, string>>({});
  const [isProfessionalLocked, setIsProfessionalLocked] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const { user, db } = useAuth();

  const { data: clients, loading: clientsLoading, setKey: setClientQueryKey } = useFirestoreQuery<Client>('clientes');
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios', where('active', '==', true));
  const { data: serviceCategories } = useFirestoreQuery<any>('categorias_servicios');
  const { data: products } = useFirestoreQuery<Product>('productos'); // <--- Added products query
  const { data: allReservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>('reservas');
  const { data: allTimeBlocks, loading: blocksLoading } = useFirestoreQuery<TimeBlock>('bloqueos_horario');
  const { selectedLocalId } = useLocal();
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: reminderSettingsData, loading: reminderSettingsLoading } = useFirestoreQuery<ReminderSettings>('configuracion', undefined, where('__name__', '==', 'recordatorios'));
  const { data: agendaSettingsData, loading: agendaSettingsLoading } = useFirestoreQuery<AgendaSettings>('configuracion', undefined, where('__name__', '==', 'agenda'));

  const reminderSettings = reminderSettingsData?.[0];
  const agendaSettings = agendaSettingsData?.[0];

  // Helper for checking permissions
  const canSee = useCallback((permission: string) => {
    if (!user || !user.permissions) return false;
    if (user.role === 'Administrador general') return true;
    return user.permissions.includes(permission);
  }, [user]);

  const filteredProfessionals = useMemo(() => {
    let pros = professionals;
    if (!canSee('ver_agenda_global')) {
      const myProf = pros.find(p => p.email === user?.email);
      if (myProf) {
        pros = [myProf];
      } else {
        pros = [];
      }
    }
    return pros;
  }, [professionals, canSee, user]);



  const formSchema = useMemo(() => createReservationSchema(isEditMode), [isEditMode]);

  const form = useForm<ReservationFormData>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: {
      notas: '',
      nota_interna: '',
      estado: 'Reservado',
      precio: 0,
      items: [{ servicio: '', barbero_id: '' }],
      notifications: {
        email_notification: true,
        whatsapp_notification: false,
        whatsapp_reminder: false,
      }
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  const selectedClientId = form.watch('cliente_id');
  const watchedItems = form.watch('items');

  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId)
  }, [selectedClientId, clients]);

  const servicesMap = useMemo(() => {
    if (!services) return new Map<string, ServiceType>();
    return new Map(services.map(s => [s.id, s]));
  }, [services]);

  const groupedServices = useMemo(() => {
    if (!services || !serviceCategories) return [];

    // 1. Create a map of category ID -> Services
    const groups: Record<string, ServiceType[]> = {};
    const uncategorized: ServiceType[] = [];

    services.forEach(service => {
      if (service.category) {
        if (!groups[service.category]) {
          groups[service.category] = [];
        }
        groups[service.category].push(service);
      } else {
        uncategorized.push(service);
      }
    });

    // 2. Sort categories by order
    const sortedCategories = [...serviceCategories].sort((a, b) => (a.order || 0) - (b.order || 0));

    // 3. Build the result array
    const result = sortedCategories.map(cat => ({
      name: cat.name,
      items: (groups[cat.id] || []).sort((a, b) => (a.order || 0) - (b.order || 0))
    })).filter(group => group.items.length > 0);

    // 4. Add uncategorized if any
    if (uncategorized.length > 0) {
      result.push({
        name: 'Otros',
        items: uncategorized.sort((a, b) => (a.order || 0) - (b.order || 0))
      });
    }

    return result;
  }, [services, serviceCategories]);

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
      return true; // No validation needed yet
    }

    const hora_inicio = `${hora_inicio_hora}:${hora_inicio_minuto}`;
    const hora_fin = `${hora_fin_hora}:${hora_fin_minuto}`;
    const formattedDate = format(fecha, 'yyyy-MM-dd');

    if (agendaSettings && !agendaSettings.simultaneousReservations && values.cliente_id) {
      const clientConflict = allReservations.some(r => {
        if (r.estado === 'Cancelado' || r.cliente_id !== values.cliente_id || r.fecha !== formattedDate || (isEditMode && r.id === initialData?.id)) return false;
        return hora_inicio < r.hora_fin && hora_fin > r.hora_inicio;
      });
      if (clientConflict) {
        Object.keys(items).forEach((_, index) => {
          errors[index] = "El cliente ya tiene una cita en este horario.";
        });
        setAvailabilityErrors(errors);
        return false;
      }
    }

    let allItemsValid = true;
    items.forEach((item, index) => {
      if (!item.barbero_id) return;

      if (!item.barbero_id) return;

      const professional = filteredProfessionals.find(p => p.id === item.barbero_id);
      if (!professional) return;

      const dayOfWeek = format(fecha, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const daySchedule = professional.schedule?.[dayOfWeek as keyof typeof professional.schedule];

      // Check for 'available' blocks (overrides schedule)
      const hasAvailableBlock = allTimeBlocks.some(b =>
        b.barbero_id === item.barbero_id &&
        b.fecha === formattedDate &&
        (b as any).type === 'available' &&
        b.hora_inicio <= hora_inicio &&
        b.hora_fin >= hora_fin
      );

      // Check for 'block' blocks (overrides schedule)
      const hasBlock = allTimeBlocks.some(b =>
        b.barbero_id === item.barbero_id &&
        b.fecha === formattedDate &&
        (b as any).type !== 'available' &&
        ((hora_inicio >= b.hora_inicio && hora_inicio < b.hora_fin) ||
          (hora_fin > b.hora_inicio && hora_fin <= b.hora_fin) ||
          (hora_inicio <= b.hora_inicio && hora_fin >= b.hora_fin))
      );

      if (hasBlock) {
        errors[index] = `El profesional tiene el horario bloqueado.`;
        allItemsValid = false;
        return;
      }

      if (!hasAvailableBlock && !agendaSettings?.resourceOverload && (!daySchedule || !daySchedule.enabled || hora_inicio < daySchedule.start || hora_fin > daySchedule.end)) {
        errors[index] = `El profesional no está disponible en este horario.`;
        allItemsValid = false;
        return;
      }

      if (!agendaSettings?.overlappingReservations) {
        const reservationConflict = allReservations.some(r => {
          if (r.estado === 'Cancelado' || !r.items || r.fecha !== formattedDate || (isEditMode && r.id === initialData?.id)) return false;
          const hasCommonProfessional = r.items.some(i => i.barbero_id === item.barbero_id);
          if (!hasCommonProfessional) return false;
          return hora_inicio < r.hora_fin && hora_fin > r.hora_inicio;
        });

        if (reservationConflict) {
          errors[index] = `El profesional ya tiene una cita en este horario.`;
          allItemsValid = false;
          return;
        }
      }

      if (!agendaSettings?.resourceOverload) {
        const blockConflict = allTimeBlocks.some(b => {
          if (b.barbero_id !== item.barbero_id || b.fecha !== formattedDate) return false;
          if ((b as any).type === 'available') return false;
          return hora_inicio < b.hora_fin && hora_fin > b.hora_inicio;
        });

        if (blockConflict) {
          errors[index] = `El profesional tiene un bloqueo en este horario.`;
          allItemsValid = false;
          return;
        }

        // Check for breaks
        if (daySchedule?.breaks && Array.isArray(daySchedule.breaks)) {
          const breakConflict = daySchedule.breaks.some((brk: any) => {
            return hora_inicio < brk.end && hora_fin > brk.start;
          });

          if (breakConflict && !hasAvailableBlock) {
            errors[index] = `El profesional está en su horario de descanso.`;
            allItemsValid = false;
            return;
          }
        }
      }
    });
    setAvailabilityErrors(errors);
    return allItemsValid;
  }, [filteredProfessionals, allReservations, allTimeBlocks, isEditMode, initialData, agendaSettings]);

  useEffect(() => {
    if (initialData && form && services.length > 0) {
      const fecha = safeParseDate(initialData.fecha) || new Date();

      const [startHour = '', startMinute = ''] = initialData.hora_inicio?.split(':') || [];
      const [endHour = '', endMinute = ''] = initialData.hora_fin?.split(':') || [];

      let itemsToSet: { servicio: string; barbero_id: string; }[] = [];
      if (isEditMode && initialData.items && Array.isArray(initialData.items)) {
        itemsToSet = initialData.items.map((i: SaleItemType) => {
          // Try to match with a service
          const service = services?.find(s => s.id === i.id || s.name === i.servicio || s.name === i.nombre);
          if (service) {
            return {
              servicio: service.id,
              barbero_id: i.barbero_id || ''
            };
          }

          // Try to match with a product
          const product = products?.find(p => p.id === i.id || p.nombre === i.nombre || p.nombre === i.servicio);
          if (product) {
            return {
              servicio: product.id,
              barbero_id: i.barbero_id || ''
            };
          }

          // Fallback: Use existing ID if available, otherwise try empty
          return {
            servicio: i.id || '',
            barbero_id: i.barbero_id || ''
          };
        });
      } else {
        itemsToSet = [{
          servicio: '',
          barbero_id: (initialData as any).barbero_id || ''
        }];
      }

      form.reset({
        ...initialData,
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
        notifications: {
          email_notification: initialData.notifications?.email_notification ?? true,
          whatsapp_notification: initialData.notifications?.whatsapp_notification ?? (initialData.notifications ? false : true),
          whatsapp_reminder: initialData.notifications?.whatsapp_reminder ?? (initialData.notifications ? false : true)
        },
        local_id: initialData.local_id
      });
      setIsProfessionalLocked(
        initialData.professional_lock !== undefined
          ? initialData.professional_lock
          : (isEditMode && (initialData.canal_reserva?.startsWith('web_publica') || initialData.origen?.startsWith('web_publica') || false))
      );
    } else if (isOpen) {
      form.reset({
        notas: '',
        nota_interna: '',
        estado: 'Reservado',
        precio: 0,
        items: [{ servicio: '', barbero_id: '' }],
        notifications: {
          whatsapp_notification: true,
          whatsapp_reminder: true
        },
        local_id: selectedLocalId || '',
      });
    }
  }, [initialData, form, isOpen, services, isEditMode, selectedLocalId]);

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (
        name &&
        (name.startsWith('items') || ['fecha', 'hora_inicio_hora', 'hora_inicio_minuto'].includes(name))
      ) {
        const { items, fecha, hora_inicio_hora, hora_inicio_minuto } = value;

        if (!items || !servicesMap.size) return;

        const { totalPrice, totalDuration } = (items as { servicio: string }[]).reduce(
          (acc, currentItem) => {
            if (!currentItem) return acc;
            const service = servicesMap.get(currentItem.servicio);
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

  useEffect(() => {
    const subscription = form.watch((value) => {
      validateItemsAvailability(value as ReservationFormData);
    });
    return () => subscription.unsubscribe();
  }, [form, validateItemsAvailability]);


  async function onSubmit(data: any) {
    if (!validateItemsAvailability(data)) {
      toast({ variant: "destructive", title: "Conflicto de Horario", description: "Uno o más profesionales no están disponibles en el horario seleccionado." });
      return;
    }

    setIsSubmitting(true);
    let success = false;

    try {
      if (!db) throw new Error("Database not available.");

      const hora_inicio = `${data.hora_inicio_hora}:${data.hora_inicio_minuto}`;
      const hora_fin = `${data.hora_fin_hora}:${data.hora_fin_minuto}`;
      const formattedDate = format(data.fecha, 'yyyy-MM-dd');

      const itemsToSave = data.items.map((item: any) => {
        // Try to find as service
        const service = services.find(s => s.id === item.servicio);
        if (service) {
          return {
            id: service.id, // Ensure ID is saved if needed, or generated? Usually firestore generates ID for subobjects if not provided, but here we store array. Ideally items should have IDs.
            // But SaleItem usually has 'id' which might be the service ID or unique item ID?
            // In 'Reservation' type, items is SaleItem[]. SaleItem has 'id'. 
            // Here 'item.servicio' IS the ID from the form select.
            servicio: service.name,
            nombre: service.name,
            barbero_id: item.barbero_id,
            precio: service.price || 0,
            duracion: service.duration || 0,
            tipo: 'servicio'
          };
        }

        // Try to find as product
        const product = products?.find(p => p.id === item.servicio);
        if (product) {
          return {
            id: product.id,
            servicio: product.nombre,
            nombre: product.nombre,
            barbero_id: item.barbero_id,
            precio: product.public_price || 0, // SaleItem usually uses 'precio' corresponding to 'public_price'
            duracion: 0,
            tipo: 'producto'
          };
        }

        // Fallback: Check if it was an existing item to preserve its data (especially if it was a product not in list?)
        // But likely we found it in 'products' list if it loaded.
        // If totally unknown, treat as service with empty name or critical error?
        // Let's fallback to 'servicio' which holds the ID if lookup failed.
        return {
          servicio: item.servicio || '', // This is the ID
          nombre: item.servicio || '',
          barbero_id: item.barbero_id,
          precio: 0,
          duracion: 0,
          tipo: 'servicio' // Default
        };
      });

      const dataToSave: Partial<Reservation> & { hora_inicio?: string, hora_fin?: string } = {
        cliente_id: data.cliente_id,
        items: itemsToSave,
        servicio: itemsToSave.map((i: any) => i.nombre).join(', '),
        fecha: formattedDate,
        hora_inicio: hora_inicio,
        hora_fin: hora_fin,
        estado: data.estado || 'Reservado',
        precio: data.precio,
        notas: data.notas || '',
        nota_interna: data.nota_interna || '',
        notifications: data.notifications || { whatsapp_notification: true, whatsapp_reminder: true },
        local_id: data.local_id,
        professional_lock: isProfessionalLocked,
      };

      let reservationId = initialData?.id;

      if (isEditMode && initialData?.id) {
        const resRef = doc(db, 'reservas', initialData.id);
        await updateDoc(resRef, dataToSave);
      } else {
        const newRef = await addDoc(collection(db, 'reservas'), {
          ...dataToSave,
          pago_estado: 'Pendiente',
          canal_reserva: 'agenda',
          creada_por: 'admin',
          creado_en: Timestamp.now(),
        });
        reservationId = newRef.id;
      }

      // Trigger Email Notification (Server Action)
      if (reservationId && !isEditMode) {
        sendManualBookingConfirmation(reservationId).then((res: any) => {
          if (res?.error) {
            console.error("Email sending failed:", res.error);
            toast({ variant: "destructive", title: "Aviso de Email", description: `Error enviando correo: ${res.error}` });
          } else if (res?.skipped) {
            toast({ description: "Envío de correo omitido." });
          } else {
            console.log("Confirmation email sent successfully.");
            toast({ description: "Correo de confirmación enviado." });
          }
        });
      }

      success = true; // Mark as successful if we reach here

      // Notification logic after successful save
      if (data.notifications?.whatsapp_notification && !isEditMode) {
        const client = clients.find(c => c.id === data.cliente_id);
        const professional = filteredProfessionals.find(p => p.id === data.items[0]?.barbero_id);
        if (client?.telefono && professional) {
          const fullDateStr = `${format(data.fecha, "dd 'de' MMMM", { locale: es })} a las ${hora_inicio}`;
          // No need to await this, it can run in the background
          fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: client.telefono,
              contentSid: 'HX6162105c1002a6cf84fa345393869746',
              contentVariables: {
                '1': client.nombre,
                '2': dataToSave.servicio!,
                '3': fullDateStr,
                '4': professional.name,
              },
            }),
          }).catch(waError => {
            console.warn("WhatsApp notification failed to send:", waError);
          });
        }
      }

    } catch (error) {
      console.error('Error guardando la reserva: ', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar la reserva. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
      if (success) {
        toast({ title: '¡Éxito!', description: isEditMode ? 'La reserva ha sido actualizada.' : 'La reserva ha sido creada.' });
        onFormSubmit();
        if (onOpenChange) onOpenChange(false);
      }
    }
  }

  const handleClientCreated = (newClientId: string) => {
    setIsClientModalOpen(false);
    if (setClientQueryKey) setClientQueryKey((prev: number) => prev + 1);
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  const selectedStatus = form.watch('estado');
  const statusColor = statusOptions.find(s => s.value === selectedStatus)?.color || 'bg-gray-500';
  const selectedStatusLabel = statusOptions.find(s => s.value === selectedStatus)?.label;

  const isAppointmentNotificationEnabled = reminderSettings?.notifications?.['appointment_notification']?.enabled ?? false;
  const isReminderNotificationEnabled = reminderSettings?.notifications?.['appointment_reminder']?.enabled ?? false;




  const formContent = (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-6 pt-6 pb-4 flex-row items-center justify-between border-b">
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

          <ScrollArea className="flex-grow">
            <div className="space-y-6 px-6 py-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <FormField
                    control={form.control}
                    name="fecha"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "EEEE dd 'de' MMMM", { locale: es }) : <span>Selecciona una fecha</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                            <Calendar
                              locale={es}
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                if (date) {
                                  field.onChange(date);
                                  setIsCalendarOpen(false);
                                }
                              }}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              required
                              initialFocus
                            />
                          </PopoverContent>
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
                          <FormField control={form.control} name="hora_inicio_hora" render={({ field }) => (<FormItem className="flex-grow"><Select onValueChange={(value) => { field.onChange(value); form.setValue('hora_inicio_minuto', '00'); }} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger></FormControl><SelectContent>{timeOptions.hours.map(h => <SelectItem key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                          <span>:</span>
                          <FormField control={form.control} name="hora_inicio_minuto" render={({ field }) => (<FormItem className="flex-grow"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="MM" /></SelectTrigger></FormControl><SelectContent>{timeOptions.minutes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                        </div>
                      </div>
                      <span className="pt-6 px-1">a</span>
                      <div className="flex-grow space-y-1">
                        <p className="text-xs text-muted-foreground text-center">Fin</p>
                        <div className="flex items-center gap-1">
                          <FormField control={form.control} name="hora_fin_hora" render={({ field }) => (<FormItem className="flex-grow"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger></FormControl><SelectContent>{timeOptions.hours.map(h => <SelectItem key={`end-h-${h}`} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                          <span>:</span>
                          <FormField control={form.control} name="hora_fin_minuto" render={({ field }) => (<FormItem className="flex-grow"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="MM" /></SelectTrigger></FormControl><SelectContent>{timeOptions.minutes.map(m => <SelectItem key={`end-m-${m}`} value={m}>{m}</SelectItem>)}</SelectContent></Select></FormItem>)} />
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
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>{selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-sm">{selectedClient.nombre} {selectedClient.apellido}</p>
                            <p className="text-xs text-muted-foreground">{selectedClient.telefono}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsClientModalOpen(true)}><Edit className="h-4 w-4" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => form.setValue('cliente_id', '')}><X className="h-4 w-4" /></Button>
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
                      <ClientCombobox
                        clients={clients}
                        loading={clientsLoading}
                        value={field.value}
                        onChange={field.onChange}
                        onSearchChange={setClientSearchTerm}
                      />
                      <FormMessage />
                    </FormItem>
                  )} />
                )}




                <div className="space-y-4">
                  {fields.map((field, index) => {
                    const currentItem = watchedItems?.[index];
                    const currentItemId = currentItem?.servicio || form.getValues(`items.${index}.servicio`);
                    const isProduct = products?.some(p => p.id === currentItemId) ||
                      (initialData?.items?.[index] && (initialData.items[index] as any).tipo === 'producto');

                    const currentService = servicesMap.get(currentItemId);

                    // Filter professionals based on the selected service
                    const rowProfessionals = filteredProfessionals.filter(p => {
                      if (isProduct) return true; // Professionals can generally sell products
                      if (!currentItemId) return true; // If no service selected, show all available in this context

                      // STRICT VALIDATION: Priority to Professional's list
                      // If the professional has a defined 'services' list, we strictly check against it.
                      if (Array.isArray(p.services)) {
                        return p.services.includes(currentItemId);
                      }

                      // Fallback for legacy records without 'services' array: check the service's list of professionals
                      if (currentService?.professionals && Array.isArray(currentService.professionals)) {
                        return currentService.professionals.includes(p.id);
                      }

                      // If neither has explicit lists (highly unlikely in current version), default to allow to avoid blocking old data
                      return true;
                    });

                    return (
                      <Card key={field.id} className="p-4 relative bg-muted/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField control={form.control} name={`items.${index}.servicio`} render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center gap-2">
                                <FormLabel>{isProduct ? 'Producto' : 'Servicios'}</FormLabel>
                              </div>
                              <ServiceInput
                                value={field.value}
                                onChange={field.onChange}
                                groupedServices={groupedServices}
                                products={products}
                                isProduct={isProduct}
                                loading={servicesLoading}
                              />
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name={`items.${index}.barbero_id`} render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center gap-2">
                                <FormLabel>Profesional</FormLabel>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0 hover:bg-transparent"
                                  onClick={() => setIsProfessionalLocked(!isProfessionalLocked)}
                                  title={isProfessionalLocked ? "Desbloquear selección" : "Bloquear selección"}
                                >
                                  {isProfessionalLocked ? <Lock className="w-3 h-3 text-red-500" /> : <Unlock className="w-3 h-3 text-green-500" />}
                                </Button>
                              </div>
                              <Select onValueChange={field.onChange} value={field.value} disabled={isProfessionalLocked}>
                                <FormControl>
                                  <SelectTrigger className={cn(availabilityErrors[index] && 'border-destructive')}>
                                    <SelectValue placeholder={professionalsLoading ? 'Cargando...' : 'Selecciona un profesional'} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {rowProfessionals.length > 0 ? (
                                    rowProfessionals.map((barber) => (
                                      <SelectItem key={barber.id} value={barber.id}>
                                        {barber.name}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <div className="p-2 text-sm text-muted-foreground text-center">
                                      No hay profesionales disponibles para este servicio.
                                    </div>
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                              {availabilityErrors[index] && <p className="text-destructive text-sm mt-1">{availabilityErrors[index]}</p>}
                            </FormItem>
                          )} />
                        </div>
                        {fields.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ servicio: '', barbero_id: '' })} className="w-full">
                    <Plus className="mr-2 h-4 w-4" /> Agregar otro servicio
                  </Button>
                </div>
              </div>

              <Accordion type="single" collapsible className="w-full border-t">
                <AccordionItem value="info" className="border-none">
                  <AccordionTrigger className="px-6 py-4 text-sm font-medium hover:no-underline">Información adicional</AccordionTrigger>
                  <AccordionContent className="px-6 pb-4 space-y-4">
                    <FormField control={form.control} name="notifications.email_notification" render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 bg-white">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="cursor-pointer">Enviar confirmación por correo</FormLabel>
                        </div>
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="precio" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio</FormLabel>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <FormControl><Input type="number" className="pl-6" placeholder="0" {...field} /></FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="nota_interna" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nota interna</FormLabel>
                        <FormControl><Textarea rows={4} placeholder="Estas notas son solo para uso interno" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </ScrollArea>

          <DialogFooter className="flex-shrink-0 p-6 border-t mt-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange && onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Guardar Reserva'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedClient ? 'Editar Cliente' : 'Crear Nuevo Cliente'}</DialogTitle>
            <DialogDescription>
              Completa la información para registrar un nuevo cliente en el sistema.
            </DialogDescription>
          </DialogHeader>
          <NewClientForm onFormSubmit={handleClientCreated} client={selectedClient} initialName={clientSearchTerm} />
        </DialogContent>
      </Dialog>
    </>
  );

  if (isDialogChild) {
    return formContent;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="sr-only">
          <DialogTitle>{isEditMode ? 'Editar Reserva' : 'Nueva Reserva'}</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
