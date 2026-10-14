
'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, collection, getDocs, query, where, Timestamp, updateDoc, doc, getDoc, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { cn, formatMoney } from '@/lib/utils';
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
import { User, Scissors, Tag, Calendar as CalendarIcon, Clock, Loader2, RefreshCw, Circle, UserPlus, Lock, Unlock, Edit, X, Mail, Phone, Bell, Plus, Trash2, Check, ChevronsUpDown, AlertTriangle, CalendarPlus, ShieldAlert, CheckCircle2, AlertCircle, Sparkles, CreditCard, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Profesional, Service as ServiceType, Reservation, TimeBlock, Local, SaleItem as SaleItemType, Product } from '@/lib/types';
import type { Client } from '@/lib/types';
import { NewClientForm } from '../clients/new-client-form';
import { sendManualBookingConfirmation } from '@/lib/actions/booking';
import { isShortNoticeAppointment, DEFAULT_BOOKING_RULES, ReglasReservasConfig } from '@/lib/booking-rules';
import { Card, CardContent } from '../ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Checkbox } from '../ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
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
  cliente_id: z.string({ required_error: 'Debes seleccionar un cliente.' }).min(1, 'Debes seleccionar un cliente.'),
  items: z.array(
    z.object({
      servicio: z.string({ required_error: 'Debes seleccionar un servicio.' }).min(1, 'Debes seleccionar un servicio.'),
      barbero_id: z.string({ required_error: 'Debes seleccionar un profesional.' }).min(1, 'Debes seleccionar un profesional.'),
      duracion: z.number().optional(),
      hora_inicio_hora: z.string().optional(),
      hora_inicio_minuto: z.string().optional(),
      professional_lock: z.boolean().optional().default(false)
    })
  ).min(1, 'Debes agregar al menos un servicio.'),
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  hora_inicio_hora: z.string({ required_error: 'Selecciona una hora.' }).min(1, "Selecciona una hora."),
  hora_inicio_minuto: z.string({ required_error: 'Selecciona un minuto.' }).min(1, "Selecciona un minuto."),
  hora_fin_hora: z.string({ required_error: 'Selecciona una hora de fin.' }).min(1, "Selecciona una hora de fin."),
  hora_fin_minuto: z.string({ required_error: 'Selecciona un minuto de fin.' }).min(1, "Selecciona un minuto de fin."),
  precio: z.coerce.number().optional().default(0),
  estado: z.string().optional(),
  notas: z.string().optional(),
  nota_interna: z.string().optional(),
  notifications: z.object({
    email_notification: z.boolean().default(true),
    whatsapp_notification: z.boolean().default(false),
    whatsapp_reminder: z.boolean().default(false),
  }).optional(),
  local_id: z.string({ required_error: 'Se requiere un local.' }).min(1, 'Se requiere un local.')
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
  onFormSubmit: (newReservation?: any) => void;
  isOpen?: boolean; // For standalone dialog usage
  onOpenChange?: (isOpen: boolean) => void; // For standalone dialog usage
  isEditMode?: boolean;
  initialData?: Partial<Reservation> & { id?: string };
  isDialogChild?: boolean;
  isSandboxMode?: boolean;
}

const statusOptions = [
  { value: 'Reservado', label: 'Reservado', color: 'bg-blue-500', hex: '#3b82f6' },
  { value: 'Confirmado', label: 'Confirmado', color: 'bg-yellow-400', hex: '#facc15' },
  { value: 'En espera', label: 'En Espera', color: 'bg-emerald-500', hex: '#22c55e' },
  { value: 'Asiste', label: 'Asiste', color: 'bg-pink-400', hex: '#ec4899' },
  { value: 'No asiste', label: 'No Asistió', color: 'bg-orange-400', hex: '#f97316' },
  { value: 'Pendiente', label: 'Pendiente de Pago', color: 'bg-red-500', hex: '#ef4444' },
  { value: 'Cancelado', label: 'Cancelado', color: 'bg-slate-400', hex: '#94a3b8' },
];

const getStatusInfo = (status?: string) => {
  const norm = (status || '').toLowerCase().trim();
  if (norm.includes('confirm')) return { label: 'Confirmado', hex: '#facc15', color: 'bg-yellow-400' };
  if (norm.includes('espera')) return { label: 'En Espera', hex: '#22c55e', color: 'bg-emerald-500' };
  if (norm.includes('asist') && !norm.includes('no')) return { label: 'Asiste', hex: '#ec4899', color: 'bg-pink-400' };
  if (norm.includes('no asist') || norm.includes('no_asist') || norm.includes('inasist')) return { label: 'No Asistió', hex: '#f97316', color: 'bg-orange-400' };
  if (norm.includes('pend') || norm.includes('adeudo')) return { label: 'Pendiente', hex: '#ef4444', color: 'bg-red-500' };
  if (norm.includes('cancel')) return { label: 'Cancelado', hex: '#94a3b8', color: 'bg-slate-400' };
  return { label: 'Reservado', hex: '#3b82f6', color: 'bg-blue-500' };
};

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

export function NewReservationForm({
  isOpen,
  onOpenChange,
  onFormSubmit,
  initialData,
  isEditMode = false,
  isDialogChild = false,
  isSandboxMode: propSandboxMode = false
}: NewReservationFormProps) {
  const isTargetSandbox = Boolean((initialData as any)?.isSandbox || propSandboxMode);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [availabilityErrors, setAvailabilityErrors] = useState<Record<number, string>>({});
  const [isProfessionalLocked, setIsProfessionalLocked] = useState(false);
  const [showConfirmLockModal, setShowConfirmLockModal] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<any>(null);
  const [pendingConfirmProfs, setPendingConfirmProfs] = useState<string[]>([]);
  const [currentConfirmIdx, setCurrentConfirmIdx] = useState<number>(-1);
  const [confirmedLocks, setConfirmedLocks] = useState<Record<string, boolean>>({});
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [depositPaid, setDepositPaid] = useState<boolean>(false);
  const [depositMethod, setDepositMethod] = useState<string>('efectivo');
  const [showDepositWarningModal, setShowDepositWarningModal] = useState<boolean>(false);
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const { user, db } = useAuth();
  const { selectedLocalId } = useLocal();

  // Helper for checking permissions
  const canSee = useCallback((permission: string) => {
    if (!user || !user.permissions) return false;
    if (user.role === 'Administrador general') return true;
    return user.permissions.includes(permission);
  }, [user]);

  const formSchema = useMemo(() => createReservationSchema(isEditMode), [isEditMode]);

  const form = useForm<ReservationFormData>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: {
      fecha: new Date(),
      notas: '',
      nota_interna: '',
      estado: 'Reservado',
      precio: 0,
      items: [{ servicio: '', barbero_id: '', duracion: 0 }],
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

  const watchedDate = form.watch('fecha');
  const selectedDateStr = useMemo(() => {
    if (!watchedDate) return format(new Date(), 'yyyy-MM-dd');
    const parsed = safeParseDate(watchedDate);
    return parsed ? format(parsed, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  }, [watchedDate]);

  const { data: clients, loading: clientsLoading, setKey: setClientQueryKey } = useFirestoreQuery<Client>('clientes');
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios', where('active', '==', true));
  const { data: locales } = useFirestoreQuery<Local>('locales');
  const { data: serviceCategories } = useFirestoreQuery<any>('categorias_servicios');
  const { data: products } = useFirestoreQuery<Product>('productos');
  const { data: allReservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>(
    'reservas',
    `reservations-form-${selectedDateStr}-${selectedLocalId}`,
    where('fecha', '==', selectedDateStr)
  );
  const { data: allTimeBlocks, loading: blocksLoading } = useFirestoreQuery<TimeBlock>(
    'bloqueos_horario',
    `blocks-form-${selectedDateStr}-${selectedLocalId}`,
    where('fecha', '==', selectedDateStr)
  );
  const { data: reminderSettingsData, loading: reminderSettingsLoading } = useFirestoreQuery<ReminderSettings>('configuracion', undefined, where('__name__', '==', 'recordatorios'));
  const { data: agendaSettingsData, loading: agendaSettingsLoading } = useFirestoreQuery<AgendaSettings>('configuracion', undefined, where('__name__', '==', 'agenda'));
  const { data: bookingRulesData } = useFirestoreQuery<ReglasReservasConfig>('configuracion', undefined, where('__name__', '==', 'reglas_reservas'));
  const { data: specialJourneys, loading: specialJourneysLoading } = useFirestoreQuery<any>('jornadas_especiales');

  const reminderSettings = reminderSettingsData?.[0];
  const agendaSettings = agendaSettingsData?.[0];
  const currentLocal = useMemo(() => {
    const locId = form.watch('local_id') || selectedLocalId;
    return locales?.find(l => l.id === locId);
  }, [locales, form, selectedLocalId]);
  const bookingRules = bookingRulesData?.[0] || DEFAULT_BOOKING_RULES;
  const maxInasistenciasPermitidas = Math.max(1, Number(bookingRules.max_inasistencias_permitidas) || 2);
  const penalizacionPorcentaje = Number(bookingRules.penalizacion_anticipo_porcentaje) || 50;
  const isPenalizacionActive = bookingRules.penalizacion_inasistencias_activa !== false;

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

  const selectedClientId = form.watch('cliente_id');
  const watchedItems = form.watch('items');

  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId)
  }, [selectedClientId, clients]);

  const [selectedClientReservations, setSelectedClientReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (!selectedClient || !db) {
      setSelectedClientReservations([]);
      return;
    }
    let isSubscribed = true;
    const fetchReservations = async () => {
      try {
        const q = query(collection(db, 'reservas'), where('cliente_id', '==', selectedClient.id));
        const snap = await getDocs(q);
        if (isSubscribed) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
          setSelectedClientReservations(list);
        }
      } catch (err) {
        console.error("Error checking client reservations in form:", err);
      }
    };
    fetchReservations();
    return () => { isSubscribed = false; };
  }, [selectedClient, db]);

  const servicesMap = useMemo(() => {
    if (!services) return new Map<string, ServiceType>();
    return new Map(services.map(s => [s.id, s]));
  }, [services]);

  const clientStats = useMemo(() => {
    if (!selectedClient) {
      return { totalCitas: 0, asistidasCount: 0, inasistenciasCount: 0, canceladasCount: 0 };
    }
    if (selectedClientReservations.length > 0) {
      const total = selectedClientReservations.length;
      const asistidas = selectedClientReservations.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado' || r.pago_estado === 'Pagado').length;
      const inasistencias = selectedClientReservations.filter(r => r.estado === 'No asiste').length;
      const canceladas = selectedClientReservations.filter(r => r.estado === 'Cancelado').length;
      return {
        totalCitas: Math.max(total, Number(selectedClient.citas_totales) || 0),
        asistidasCount: Math.max(asistidas, Number(selectedClient.citas_asistidas) || 0),
        inasistenciasCount: Math.max(inasistencias, Number(selectedClient.citas_no_asistidas) || 0),
        canceladasCount: Math.max(canceladas, Number(selectedClient.citas_canceladas) || 0),
      };
    }
    return {
      totalCitas: Number(selectedClient.citas_totales) || 0,
      asistidasCount: Number(selectedClient.citas_asistidas) || 0,
      inasistenciasCount: Number(selectedClient.citas_no_asistidas) || 0,
      canceladasCount: Number(selectedClient.citas_canceladas) || 0,
    };
  }, [selectedClient, selectedClientReservations]);

  const unattendedCount = clientStats.inasistenciasCount;

  const isAnticipoRequiredDueToHistory = isPenalizacionActive && unattendedCount >= maxInasistenciasPermitidas;

  const isMontoMinimoActive = bookingRules.anticipo_monto_minimo_activo !== false;
  const montoMinimoThreshold = Number(bookingRules.anticipo_monto_minimo) || 190;
  const anticipoPorcentajeDefecto = Number(bookingRules.anticipo_porcentaje_defecto) || 50;

  const isNewClient = useMemo(() => {
    if (!selectedClient) return false;
    return clientStats.totalCitas === 0;
  }, [selectedClient, clientStats.totalCitas]);

  const currentTotal = useMemo(() => {
    const rawPrice = form.watch('precio');
    if (rawPrice !== undefined && Number(rawPrice) > 0) return Number(rawPrice);
    let sum = 0;
    (watchedItems || []).forEach(item => {
      if (item.servicio) {
        const s = servicesMap.get(item.servicio);
        if (s && s.price) sum += Number(s.price);
      }
    });
    return sum;
  }, [form, watchedItems, servicesMap]);

  const isAnticipoRequiredDueToAmount = isMontoMinimoActive && montoMinimoThreshold > 0 && currentTotal >= montoMinimoThreshold;
  const isAnticipoRequired = isAnticipoRequiredDueToHistory || isAnticipoRequiredDueToAmount;

  const depositAmountCalculated = useMemo(() => {
    const pct = isAnticipoRequiredDueToHistory ? penalizacionPorcentaje : anticipoPorcentajeDefecto;
    return Math.round(currentTotal * (pct / 100));
  }, [currentTotal, isAnticipoRequiredDueToHistory, penalizacionPorcentaje, anticipoPorcentajeDefecto]);

  // Popular / Most sold services calculation
  const [popularCounts, setPopularCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!db) return;
    let isSubscribed = true;

    const fetchPopularServices = async () => {
      try {
        const qReservas = query(collection(db, 'reservas'), limit(300));
        const qVentas = query(collection(db, 'ventas'), limit(300));

        const [snapReservas, snapVentas] = await Promise.allSettled([
          getDocs(qReservas),
          getDocs(qVentas),
        ]);

        const counts: Record<string, number> = {};

        if (snapReservas.status === 'fulfilled') {
          snapReservas.value.forEach(docSnap => {
            const data = docSnap.data();
            if (Array.isArray(data.items)) {
              data.items.forEach((item: any) => {
                if (item.id) {
                  counts[item.id] = (counts[item.id] || 0) + (Number(item.cantidad) || 1);
                }
                if (item.servicio || item.nombre) {
                  const norm = (item.servicio || item.nombre).toLowerCase().trim();
                  counts[norm] = (counts[norm] || 0) + (Number(item.cantidad) || 1);
                }
              });
            } else if (typeof data.servicio === 'string') {
              const names = data.servicio.split(',').map((s: string) => s.toLowerCase().trim());
              names.forEach((name: string) => {
                if (name) counts[name] = (counts[name] || 0) + 1;
              });
            }
          });
        }

        if (snapVentas.status === 'fulfilled') {
          snapVentas.value.forEach(docSnap => {
            const data = docSnap.data();
            if (Array.isArray(data.items)) {
              data.items.forEach((item: any) => {
                if (item.id) {
                  counts[item.id] = (counts[item.id] || 0) + (Number(item.cantidad) || 1);
                }
                if (item.servicio || item.nombre) {
                  const norm = (item.servicio || item.nombre).toLowerCase().trim();
                  counts[norm] = (counts[norm] || 0) + (Number(item.cantidad) || 1);
                }
              });
            }
          });
        }

        if (isSubscribed) {
          setPopularCounts(counts);
        }
      } catch (err) {
        console.warn('Error fetching popular services counts:', err);
      }
    };

    fetchPopularServices();

    return () => {
      isSubscribed = false;
    };
  }, [db]);

  const popularServices = useMemo(() => {
    if (!services || services.length === 0) return [];

    // Calculate score for each service
    const scoredServices = services.map(service => {
      const idCount = popularCounts[service.id] || 0;
      const nameCount = popularCounts[service.name.toLowerCase().trim()] || 0;
      let count = idCount + nameCount;

      if ((service as any).is_popular || (service as any).popular || (service as any).destacado) {
        count += 500;
      }

      return {
        service,
        count
      };
    });

    // Sort descending by sales count
    scoredServices.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (a.service.order ?? 999) - (b.service.order ?? 999);
    });

    const topWithSales = scoredServices.filter(s => s.count > 0).slice(0, 5);
    if (topWithSales.length >= 2) {
      return topWithSales.map(s => s.service);
    }

    // Fallback heuristic for barber shop if no sales recorded yet
    const fallbackKeywords = ['corte', 'barba', 'fade', 'ritual', 'perfilado', 'afeitado', 'express', 'arreglo'];
    const fallbackSorted = [...services].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aMatch = fallbackKeywords.some(kw => aName.includes(kw));
      const bMatch = fallbackKeywords.some(kw => bName.includes(kw));
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return (a.order ?? 999) - (b.order ?? 999);
    });

    return fallbackSorted.slice(0, 5);
  }, [services, popularCounts]);

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
    const sortedCategories = [...serviceCategories].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    // 3. Build the result array with MÁS VENDIDOS at top
    const result: Array<{ name: string; isPopular?: boolean; items: ServiceType[] }> = [];

    if (popularServices.length > 0) {
      result.push({
        name: 'MÁS VENDIDOS',
        isPopular: true,
        items: popularServices,
      });
    }

    // 4. Add standard categories
    sortedCategories.forEach(cat => {
      const items = (groups[cat.id] || []).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      if (items.length > 0) {
        result.push({
          name: cat.name,
          items,
        });
      }
    });

    // 5. Add uncategorized if any
    if (uncategorized.length > 0) {
      result.push({
        name: 'Otros',
        items: uncategorized.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      });
    }

    return result;
  }, [services, serviceCategories, popularServices]);

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
        if (r.estado === 'Cancelado' || r.estado === 'No asiste' || r.cliente_id !== values.cliente_id || r.fecha !== formattedDate || (isEditMode && r.id === initialData?.id)) return false;
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
    const globalStartMins = parseInt(hora_inicio_hora, 10) * 60 + parseInt(hora_inicio_minuto, 10);
    const profCurrentStartMins = new Map<string, number>();

    let allItemsValid = true;    items.forEach((item, index) => {
      if (!item.barbero_id) return;

      const professional = filteredProfessionals.find(p => p.id === item.barbero_id);
      if (!professional) return;

      // Calculate this item's specific start and end times
      const service = servicesMap.get(item.servicio);
      const customDur = service?.durationPorProfesional?.[item.barbero_id || ''];
      const dur = item.duracion !== undefined ? item.duracion : (customDur !== undefined ? customDur : (service?.duration || 0));
      const profId = item.barbero_id || 'unassigned';

      let item_hora_inicio = '';
      let item_hora_fin = '';

      try {
        let startMins;
        if (item.hora_inicio_hora && item.hora_inicio_minuto) {
          item_hora_inicio = `${item.hora_inicio_hora}:${item.hora_inicio_minuto}`;
          const [sh, sm] = item_hora_inicio.split(':').map(Number);
          startMins = sh * 60 + sm;
        } else {
          startMins = profCurrentStartMins.get(profId) ?? globalStartMins;
          const sh = Math.floor(startMins / 60);
          const sm = startMins % 60;
          item_hora_inicio = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
        }

        const endMins = startMins + dur;
        profCurrentStartMins.set(profId, endMins);

        const endH = Math.floor(endMins / 60);
        const endM = endMins % 60;
        item_hora_fin = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      } catch (e) {
        console.error("Error calculating item end time in validation", e);
        item_hora_inicio = item_hora_inicio || hora_inicio;
        item_hora_fin = item_hora_fin || item_hora_inicio;
      }

      const dayOfWeek = format(fecha, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const daySchedule = professional.schedule?.[dayOfWeek as keyof typeof professional.schedule];

      // Get all available blocks for this professional on this date
      const availableBlocks = allTimeBlocks.filter(b => 
        b.barbero_id === item.barbero_id &&
        b.fecha === formattedDate &&
        (b as any).type === 'available'
      );
      const profSpecialJourneys = specialJourneys.filter((sj: any) => 
        sj.profesionalId === item.barbero_id && 
        sj.fecha === formattedDate
      );

      // Helper function to check if a specific time range is fully covered by an available block or special journey
      const isRangeCovered = (start: string, end: string) => {
        if (start >= end) return true;
        const coveredByBlock = availableBlocks.some(b => b.hora_inicio <= start && b.hora_fin >= end);
        const coveredBySpecial = profSpecialJourneys.some((sj: any) => sj.hora_inicio <= start && sj.hora_fin >= end);
        return coveredByBlock || coveredBySpecial;
      };

      // Check for 'block' blocks (overrides schedule)
      const hasBlock = allTimeBlocks.some(b =>
        b.barbero_id === item.barbero_id &&
        b.fecha === formattedDate &&
        (b as any).type !== 'available' &&
        item_hora_inicio < b.hora_fin && item_hora_fin > b.hora_inicio
      );

      if (hasBlock) {
        errors[index] = `El profesional tiene el horario bloqueado.`;
        allItemsValid = false;
        return;
      }

      if (!agendaSettings?.resourceOverload) {
        if (!daySchedule || !daySchedule.enabled) {
          // If schedule is disabled, the entire reservation must be covered by a special schedule
          if (!isRangeCovered(item_hora_inicio, item_hora_fin)) {
            errors[index] = `El profesional no está disponible en este horario.`;
            allItemsValid = false;
            return;
          }
        } else {
          // Check if any part before schedule start is uncovered
          if (item_hora_inicio < daySchedule.start && !isRangeCovered(item_hora_inicio, item_hora_fin < daySchedule.start ? item_hora_fin : daySchedule.start)) {
            errors[index] = `El profesional no está disponible en este horario.`;
            allItemsValid = false;
            return;
          }
          // Check if any part after schedule end is uncovered
          if (item_hora_fin > daySchedule.end && !isRangeCovered(item_hora_inicio > daySchedule.end ? item_hora_inicio : daySchedule.end, item_hora_fin)) {
            errors[index] = `El profesional no está disponible en este horario.`;
            allItemsValid = false;
            return;
          }
        }
      }

      if (!agendaSettings?.overlappingReservations) {
        const reservationConflict = allReservations.some(r => {
          if (r.estado === 'Cancelado' || r.estado === 'No asiste' || !r.items || r.fecha !== formattedDate || (isEditMode && r.id === initialData?.id)) return false;
          const profItems = r.items.filter(i => i.barbero_id === item.barbero_id);
          if (profItems.length === 0) return false;

          // Calculate this professional's actual time range within the existing reservation
          const profIds = new Set(r.items.map(i => i.barbero_id).filter(Boolean));
          let profHoraFin = r.hora_fin; // Default to global end

          if (profIds.size > 1) {
            // Multi-professional reservation: calculate per-professional end time
            const totalProfDurationMins = profItems.reduce((acc, i: any) => acc + (i.duracion || 0), 0);
            if (totalProfDurationMins > 0) {
              const [startH, startM] = r.hora_inicio.split(':').map(Number);
              const endMinutes = startH * 60 + startM + totalProfDurationMins;
              const endH = Math.floor(endMinutes / 60);
              const endM = endMinutes % 60;
              profHoraFin = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
            }
          }

          return item_hora_inicio < profHoraFin && item_hora_fin > r.hora_inicio;
        });

        if (reservationConflict) {
          errors[index] = `El profesional ya tiene una cita en este horario.`;
          allItemsValid = false;
          return;
        }
      }

      if (!agendaSettings?.resourceOverload) {
        // Check for breaks (ignore breaks for special journeys)
        if (profSpecialJourneys.length === 0 && daySchedule?.breaks && Array.isArray(daySchedule.breaks)) {
          const breakConflict = daySchedule.breaks.some((brk: any) => {
            if (item_hora_inicio >= brk.end || item_hora_fin <= brk.start) return false; // No overlap

            // Calculate exact overlap with this break
            const overlapStart = item_hora_inicio > brk.start ? item_hora_inicio : brk.start;
            const overlapEnd = item_hora_fin < brk.end ? item_hora_fin : brk.end;

            // Is this overlap covered by a special schedule (available block)?
            return !isRangeCovered(overlapStart, overlapEnd);
          });

          if (breakConflict) {
            errors[index] = `El profesional está en su horario de descanso.`;
            allItemsValid = false;
            return;
          }
        }
      }
    });
    setAvailabilityErrors(errors);
    return allItemsValid;
  }, [filteredProfessionals, allReservations, allTimeBlocks, specialJourneys, isEditMode, initialData, agendaSettings]);

  useEffect(() => {
    if (initialData && form && services.length > 0) {
      const fecha = safeParseDate(initialData.fecha) || new Date();

      const [startHour = '', startMinute = ''] = initialData.hora_inicio?.split(':') || [];
      const [endHour = '', endMinute = ''] = initialData.hora_fin?.split(':') || [];

      let itemsToSet: { servicio: string; barbero_id: string; duracion: number; hora_inicio_hora?: string; hora_inicio_minuto?: string; professional_lock?: boolean }[] = [];
      if (isEditMode && initialData.items && Array.isArray(initialData.items)) {
        itemsToSet = initialData.items.map((i: SaleItemType) => {
          const [itemH = '', itemM = ''] = (i as any).hora_inicio?.split(':') || [];
          const itemLock = (i as any).professional_lock !== undefined
            ? (i as any).professional_lock
            : (initialData.professional_lock ?? false);
          // Try to match with a service
          const service = services?.find(s => s.id === i.id || s.name === i.servicio || s.name === i.nombre);
          if (service) {
            const customDur = service.durationPorProfesional?.[i.barbero_id || ''];
            return {
              servicio: service.id,
              barbero_id: i.barbero_id || '',
              duracion: (i as any).duracion !== undefined ? (i as any).duracion : (customDur !== undefined ? customDur : (service.duration || 0)),
              hora_inicio_hora: itemH,
              hora_inicio_minuto: itemM,
              professional_lock: itemLock
            };
          }

          // Try to match with a product
          const product = products?.find(p => p.id === i.id || p.nombre === i.nombre || p.nombre === i.servicio);
          if (product) {
            return {
              servicio: product.id,
              barbero_id: i.barbero_id || '',
              duracion: (i as any).duracion || 0,
              hora_inicio_hora: itemH,
              hora_inicio_minuto: itemM,
              professional_lock: itemLock
            };
          }

          // Fallback: Use existing ID if available, otherwise try empty
          return {
            servicio: i.id || '',
            barbero_id: i.barbero_id || '',
            duracion: (i as any).duracion || 0,
            hora_inicio_hora: itemH,
            hora_inicio_minuto: itemM,
            professional_lock: itemLock
          };
        });
      } else {
        const preSrvId = (initialData as any).preselectedServiceId || '';
        const srv = services?.find(s => s.id === preSrvId);
        const profId = (initialData as any).barbero_id || '';
        const customDur = srv?.durationPorProfesional?.[profId];
        const dur = srv ? (customDur !== undefined ? customDur : (srv.duration || 0)) : 0;

        itemsToSet = [{
          servicio: preSrvId,
          barbero_id: profId,
          duracion: dur,
          hora_inicio_hora: '',
          hora_inicio_minuto: '',
          professional_lock: false
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
      setDepositPaid(initialData.pago_estado === 'anticipo_pagado' || initialData.pago_estado === 'deposit_paid' || Boolean((initialData as any).anticipo_pagado));
      setDepositMethod((initialData as any).metodo_pago_anticipo || 'efectivo');
    } else if (isOpen) {
      form.reset({
        fecha: new Date(),
        notas: '',
        nota_interna: '',
        estado: 'Reservado',
        precio: 0,
        items: [{ servicio: '', barbero_id: '', duracion: 0, professional_lock: false }],
        notifications: {
          whatsapp_notification: true,
          whatsapp_reminder: true
        },
        local_id: selectedLocalId || '',
      });
      setDepositPaid(false);
      setDepositMethod('efectivo');
      setShowDepositWarningModal(false);
      setPendingSaveData(null);
    }
  }, [initialData, form, isOpen, services, isEditMode, selectedLocalId]);

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (name && ['hora_fin_hora', 'hora_fin_minuto'].includes(name)) {
        const { items, hora_inicio_hora, hora_inicio_minuto, hora_fin_hora, hora_fin_minuto } = value;
        if (items && items.length > 0 && hora_inicio_hora && hora_inicio_minuto && hora_fin_hora && hora_fin_minuto) {
          const startMins = parseInt(hora_inicio_hora, 10) * 60 + parseInt(hora_inicio_minuto, 10);
          const endMins = parseInt(hora_fin_hora, 10) * 60 + parseInt(hora_fin_minuto, 10);
          const totalDuration = endMins - startMins;

          if (totalDuration > 0) {
            if (items.length === 1) {
              const currentDur = items[0]?.duracion;
              if (currentDur !== totalDuration) {
                form.setValue('items.0.duracion', totalDuration, { shouldValidate: true });
              }
            } else {
              const lastIdx = items.length - 1;
              const lastItem = items[lastIdx];
              if (lastItem) {
                let lastItemStartMins = startMins;
                if (lastItem.hora_inicio_hora && lastItem.hora_inicio_minuto) {
                  lastItemStartMins = parseInt(lastItem.hora_inicio_hora, 10) * 60 + parseInt(lastItem.hora_inicio_minuto, 10);
                } else {
                  const profCurrentStartMins = new Map<string, number>();
                  for (let i = 0; i < lastIdx; i++) {
                    const currentItem = items[i];
                    if (!currentItem) continue;
                    const service = servicesMap.get(currentItem.servicio || '');
                    const profId = currentItem.barbero_id || 'unassigned';
                    const customDur = service?.durationPorProfesional?.[profId];
                    const dur = currentItem.duracion !== undefined ? currentItem.duracion : (customDur !== undefined ? customDur : (service?.duration || 0));

                    let itemStartMins;
                    if (currentItem.hora_inicio_hora && currentItem.hora_inicio_minuto) {
                      itemStartMins = parseInt(currentItem.hora_inicio_hora, 10) * 60 + parseInt(currentItem.hora_inicio_minuto, 10);
                    } else {
                      itemStartMins = profCurrentStartMins.get(profId) ?? startMins;
                    }
                    const itemEndMins = itemStartMins + dur;
                    profCurrentStartMins.set(profId, itemEndMins);
                  }
                  const lastItemProfId = lastItem.barbero_id || 'unassigned';
                  lastItemStartMins = profCurrentStartMins.get(lastItemProfId) ?? startMins;
                }
                const newLastItemDur = Math.max(0, endMins - lastItemStartMins);
                if (lastItem.duracion !== newLastItemDur) {
                  form.setValue(`items.${lastIdx}.duracion`, newLastItemDur, { shouldValidate: true });
                }
              }
            }
          }
        }
      } else if (
        name &&
        (name.startsWith('items') || ['fecha', 'hora_inicio_hora', 'hora_inicio_minuto'].includes(name))
      ) {
        const { items, fecha, hora_inicio_hora, hora_inicio_minuto } = value;

        if (!items || !servicesMap.size) return;

        const { totalPrice, maxDuration } = (items as { servicio: string; barbero_id: string; duracion?: number }[]).reduce(
          (acc, currentItem) => {
            if (!currentItem) return acc;
            const service = servicesMap.get(currentItem.servicio);
            if (service) {
              acc.totalPrice += service.price || 0;
              const profId = currentItem.barbero_id || 'unassigned';
              const customDur = service.durationPorProfesional?.[profId];
              acc.durations[profId] = (acc.durations[profId] || 0) + (currentItem.duracion !== undefined ? currentItem.duracion : (customDur !== undefined ? customDur : (service.duration || 0)));
              acc.maxDuration = Math.max(acc.maxDuration, acc.durations[profId]);
            }
            return acc;
          },
          { totalPrice: 0, maxDuration: 0, durations: {} as Record<string, number> }
        );

        // Only auto-update price if not in edit mode OR if a service-related field specifically changed
        // This prevents manual overrides from being lost when re-opening for edit or changing date
        const isServiceChange = name && (name.startsWith('items') && (name.endsWith('.servicio') || name === 'items'));
        if (!isEditMode || isServiceChange) {
          form.setValue('precio', totalPrice, { shouldValidate: true });
        }

        if (fecha && hora_inicio_hora && hora_inicio_minuto) {
          try {
            const globalStartMins = parseInt(hora_inicio_hora, 10) * 60 + parseInt(hora_inicio_minuto, 10);
            let latestEndMins = globalStartMins;
            const profCurrentStartMins = new Map<string, number>();

            items.forEach((currentItem: any) => {
              if (!currentItem) return;
              const service = servicesMap.get(currentItem.servicio);
              const profId = currentItem.barbero_id || 'unassigned';
              const customDur = service?.durationPorProfesional?.[profId];
              const dur = currentItem.duracion !== undefined ? currentItem.duracion : (customDur !== undefined ? customDur : (service?.duration || 0));

              let itemStartMins;
              if (currentItem.hora_inicio_hora && currentItem.hora_inicio_minuto) {
                itemStartMins = parseInt(currentItem.hora_inicio_hora, 10) * 60 + parseInt(currentItem.hora_inicio_minuto, 10);
              } else {
                itemStartMins = profCurrentStartMins.get(profId) ?? globalStartMins;
              }
              const itemEndMins = itemStartMins + dur;
              profCurrentStartMins.set(profId, itemEndMins);

              if (itemEndMins > latestEndMins) {
                latestEndMins = itemEndMins;
              }
            });

            const globalEndTime = set(fecha, {
              hours: Math.floor(latestEndMins / 60),
              minutes: latestEndMins % 60,
            });

            const newHH = format(globalEndTime, 'HH');
            const newMM = format(globalEndTime, 'mm');

            if (form.getValues('hora_fin_hora') !== newHH) {
              form.setValue('hora_fin_hora', newHH, { shouldValidate: true });
            }
            if (form.getValues('hora_fin_minuto') !== newMM) {
              form.setValue('hora_fin_minuto', newMM, { shouldValidate: true });
            }
          } catch (e) {
            console.error("Error calculating end time", e);
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, servicesMap, isEditMode]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      validateItemsAvailability(value as ReservationFormData);
    });
    return () => subscription.unsubscribe();
  }, [form, validateItemsAvailability]);


  async function executeSave(data: any) {
    setIsSubmitting(true);
    let success = false;
    let createdReservationObj: any = null;

    try {
      if (!db) throw new Error("Database not available.");

      let earliestStart = Infinity;
      let latestEnd = -Infinity;
      const formattedDate = format(data.fecha, 'yyyy-MM-dd');
      const globalStartMins = parseInt(data.hora_inicio_hora, 10) * 60 + parseInt(data.hora_inicio_minuto, 10);
      const profCurrentStartMins = new Map<string, number>();

      const itemsToSave = data.items.map((item: any, idx: number) => {
        // Try to find as service
        const service = services.find(s => s.id === item.servicio);
        let id = '';
        let name = '';
        let precio = 0;
        let duracion = item.duracion || 0;
        let tipo = 'servicio';

        if (service) {
          id = service.id;
          name = service.name;
          precio = data.items.length === 1 ? (data.precio || 0) : (service.price || 0);
          const customDur = service.durationPorProfesional?.[item.barbero_id || ''];
          duracion = item.duracion !== undefined ? item.duracion : (customDur !== undefined ? customDur : (service.duration || 0));
        } else {
          // Try to find as product
          const product = products?.find(p => p.id === item.servicio);
          if (product) {
            id = product.id;
            name = product.nombre;
            precio = data.items.length === 1 ? (data.precio || 0) : (product.public_price || 0);
            duracion = item.duracion !== undefined ? item.duracion : 0;
            tipo = 'producto';
          } else {
            name = item.servicio || '';
            precio = data.items.length === 1 ? (data.precio || 0) : 0;
          }
        }

        let item_hora_inicio = undefined;
        let item_hora_fin = undefined;
        const profId = item.barbero_id || 'unassigned';
        let startMins;

        if (item.hora_inicio_hora && item.hora_inicio_minuto) {
          item_hora_inicio = `${item.hora_inicio_hora}:${item.hora_inicio_minuto}`;
          try {
            const startParsed = parse(item_hora_inicio, 'HH:mm', new Date());
            const endParsed = addMinutes(startParsed, duracion);
            item_hora_fin = format(endParsed, 'HH:mm');
          } catch (e) {
            console.error("Error parsing item start time", e);
          }
          const [sh, sm] = item_hora_inicio.split(':').map(Number);
          startMins = sh * 60 + sm;
        } else {
          startMins = profCurrentStartMins.get(profId) ?? globalStartMins;
        }

        const endMins = startMins + duracion;
        profCurrentStartMins.set(profId, endMins);

        if (startMins < earliestStart) earliestStart = startMins;
        if (endMins > latestEnd) latestEnd = endMins;

        return {
          id,
          servicio: name,
          nombre: name,
          barbero_id: item.barbero_id,
          precio,
          duracion,
          tipo,
          professional_lock: item.professional_lock ?? false,
          ...(item_hora_inicio ? { hora_inicio: item_hora_inicio, hora_fin: item_hora_fin } : {})
        };
      });

      const globalStartHour = String(Math.floor(earliestStart / 60)).padStart(2, '0');
      const globalStartMin = String(earliestStart % 60).padStart(2, '0');
      const globalEndHour = String(Math.floor(latestEnd / 60)).padStart(2, '0');
      const globalEndMin = String(latestEnd % 60).padStart(2, '0');

      const hora_inicio = `${globalStartHour}:${globalStartMin}`;
      const hora_fin = `${globalEndHour}:${globalEndMin}`;

      const primaryBarberoId = itemsToSave.find((i: any) => i.barbero_id)?.barbero_id || (initialData as any)?.barbero_id || '';

      const effectiveDepositPaid = data._depositPaidOverride !== undefined ? data._depositPaidOverride : depositPaid;
      const targetDepositAmount = isAnticipoRequired
        ? depositAmountCalculated
        : (Number((data as any).monto_anticipo) || 0);

      const selectedClient = clients.find(c => c.id === data.cliente_id);
      const dataToSave: Partial<Reservation> & { hora_inicio?: string; hora_fin?: string; cliente_nombre?: string; cliente_telefono?: string; cliente_email?: string } = {
        cliente_id: data.cliente_id,
        cliente_nombre: selectedClient ? `${selectedClient.nombre || ''} ${selectedClient.apellido || ''}`.trim() : (data.cliente_nombre || ''),
        cliente_telefono: selectedClient?.telefono || data.cliente_telefono || '',
        cliente_email: selectedClient?.correo || (selectedClient as any)?.email || data.cliente_email || '',
        barbero_id: primaryBarberoId,
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
        professional_lock: itemsToSave.some((i: any) => i.professional_lock === true),
        requiere_anticipo: isAnticipoRequired || (data as any).requiere_anticipo || false,
        anticipo_esperado: targetDepositAmount,
        ...(effectiveDepositPaid ? {
          pago_estado: 'deposit_paid',
          monto_anticipo: targetDepositAmount,
          monto_pagado: targetDepositAmount,
          monto_pagado_real: targetDepositAmount,
          anticipo_pagado: targetDepositAmount,
          anticipoPagado: targetDepositAmount,
          saldo_pendiente: Math.max(0, (Number(data.precio) || 0) - targetDepositAmount),
          metodo_pago_anticipo: depositMethod,
          deposit_paid_at: Timestamp.now(),
        } : {
          pago_estado: isAnticipoRequired ? 'pendiente_anticipo' : (data.pago_estado && data.pago_estado !== 'deposit_paid' && data.pago_estado !== 'anticipo_pagado' ? data.pago_estado : 'Pendiente'),
          monto_anticipo: 0,
          monto_pagado: 0,
          monto_pagado_real: 0,
          anticipo_pagado: 0,
          anticipoPagado: 0,
          saldo_pendiente: Number(data.precio) || 0,
        }),
      };

      let reservationId = initialData?.id;

      if (isEditMode && initialData?.id) {
        const targetCollection = (initialData as any)?.isSandbox ? 'reservas_sandbox' : 'reservas';
        const resRef = doc(db, targetCollection, initialData.id);
        await updateDoc(resRef, dataToSave);
      } else {
        const isShortNotice = isShortNoticeAppointment({
          fecha: formattedDate,
          hora_inicio: hora_inicio,
          creado_en: Timestamp.now(),
        });

        const activeCreatorName = (() => {
          if (user?.displayName && user.displayName.trim() && user.displayName.toLowerCase() !== 'admin') {
            return user.displayName.trim();
          }
          if ((user as any)?.name && (user as any).name.trim() && (user as any).name.toLowerCase() !== 'admin') {
            return (user as any).name.trim();
          }
          if (user?.role === 'Administrador general') {
            return 'José Alejandro Pacheco';
          }
          if (user?.role) {
            return user.role;
          }
          if (user?.email) {
            const prefix = user.email.split('@')[0];
            return prefix.charAt(0).toUpperCase() + prefix.slice(1);
          }
          return 'Recepción';
        })();

        const targetCollection = isTargetSandbox ? 'reservas_sandbox' : 'reservas';
        const newRef = await addDoc(collection(db, targetCollection), {
          ...dataToSave,
          isSandbox: isTargetSandbox,
          canal_reserva: isTargetSandbox ? 'agenda_sandbox' : 'agenda',
          creada_por: activeCreatorName,
          creado_en: Timestamp.now(),
          whatsappReminderNotNeeded: isShortNotice,
          whatsappReminderSent: isShortNotice ? true : false,
        });
        reservationId = newRef.id;

        const client = clients.find(c => c.id === data.cliente_id);
        createdReservationObj = {
          id: reservationId,
          ...dataToSave,
          isSandbox: isTargetSandbox,
          canal_reserva: isTargetSandbox ? 'agenda_sandbox' : 'agenda',
          creada_por: activeCreatorName,
          whatsappReminderNotNeeded: isShortNotice,
          whatsappReminderSent: isShortNotice ? true : false,
          customer: client || {
            nombre: data.cliente_nombre || '',
            telefono: data.cliente_telefono || '',
            correo: data.cliente_email || '',
          },
        };
      }

      // Trigger Email Notification (Server Action) - only for production real bookings
      if (reservationId && !isEditMode && !isTargetSandbox) {
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

      // Notification logic after successful save - only for production real bookings
      if (data.notifications?.whatsapp_notification && !isEditMode && !isTargetSandbox) {
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
                '4': professional.publicName || professional.name,
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
        toast({
          title: isTargetSandbox ? '¡Cita en Sandbox Registrada!' : '¡Éxito!',
          description: isTargetSandbox
            ? (isEditMode ? 'La reserva de prueba ha sido actualizada en Sandbox.' : 'La reserva de prueba se guardó en Sandbox (no afecta la operación real).')
            : (isEditMode ? 'La reserva ha sido actualizada.' : 'La reserva ha sido creada.')
        });
        if (isAnticipoRequiredDueToHistory && !isEditMode) {
          toast({
            variant: 'destructive',
            title: '🛡️ Escudo de Inasistencias Activo',
            description: `Este cliente acumula ${unattendedCount} inasistencias previas (límite: ${maxInasistenciasPermitidas}). Recuerda cobrarle el anticipo del ${penalizacionPorcentaje}% ($${depositAmountCalculated} MXN).`,
            duration: 10000,
          });
        } else if (isAnticipoRequiredDueToAmount && !isEditMode) {
          toast({
            title: '💳 Anticipo Requerido por Monto',
            description: `Esta cita supera los $${montoMinimoThreshold} MXN. Requiere anticipo del ${anticipoPorcentajeDefecto}% ($${depositAmountCalculated} MXN).`,
            duration: 10000,
          });
        } else if (isPenalizacionActive && unattendedCount === (maxInasistenciasPermitidas - 1) && !isEditMode) {
          toast({
            title: `⚠️ Atención: ${unattendedCount} Inasistencia Previa`,
            description: `Este cliente tiene ${unattendedCount} falta previa registrada. Con ${maxInasistenciasPermitidas} faltas se le exigirá anticipo obligatorio del ${penalizacionPorcentaje}%.`,
            duration: 8000,
          });
        }
        onFormSubmit(createdReservationObj);
        if (onOpenChange) onOpenChange(false);
      }
    }
  }

  const proceedWithSubmission = async (dataToSubmit: any, forceDepositPaid?: boolean) => {
    const isPaid = forceDepositPaid !== undefined ? forceDepositPaid : depositPaid;

    if (!isEditMode) {
      const uniqueBarberos = Array.from(
        new Set(
          dataToSubmit.items
            .map((item: any) => item.barbero_id)
            .filter(Boolean)
        )
      ) as string[];

      if (uniqueBarberos.length > 0) {
        setPendingSubmitData({ ...dataToSubmit, _depositPaidOverride: isPaid });
        setPendingConfirmProfs(uniqueBarberos);
        setCurrentConfirmIdx(0);
        setConfirmedLocks({});
        setShowConfirmLockModal(true);
        return;
      }
    }

    await executeSave({ ...dataToSubmit, _depositPaidOverride: isPaid });
  };

  async function onSubmit(data: any) {
    if (!validateItemsAvailability(data)) {
      toast({ variant: "destructive", title: "Conflicto de Horario", description: "Uno o más profesionales no están disponibles en el horario seleccionado." });
      return;
    }

    // Alerta inteligente de anticipo por inasistencias o regla de monto (>= $190 MXN) antes de guardar
    if (isAnticipoRequired && !depositPaid && !isEditMode) {
      setPendingSaveData(data);
      setShowDepositWarningModal(true);
      return;
    }

    await proceedWithSubmission(data);
  }

  const handleClientCreated = (newClientId: string) => {
    setIsClientModalOpen(false);
    if (setClientQueryKey) setClientQueryKey((prev: number) => prev + 1);
    form.setValue('cliente_id', newClientId, { shouldValidate: true });
  }

  const selectedStatus = form.watch('estado');
  const currentStatusInfo = getStatusInfo(selectedStatus);

  const isAppointmentNotificationEnabled = reminderSettings?.notifications?.['appointment_notification']?.enabled ?? false;
  const isReminderNotificationEnabled = reminderSettings?.notifications?.['appointment_reminder']?.enabled ?? false;




  const formContent = (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
          {/* CABECERA OFICIAL VATOS ALFA */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-[#2d3a60]/60 flex-shrink-0 relative overflow-hidden">
            {/* Haz de luz animado sutil */}
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <CalendarPlus className="h-6 w-6 text-white shrink-0" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                      {isEditMode ? 'Editar Cita' : 'Nueva Cita en Agenda'}
                    </DialogTitle>
                    <Badge variant="outline" className="bg-white/10 text-slate-200 border-white/20 text-[10px] py-0 px-2 font-mono">
                      {currentLocal?.name || 'Vatos Alfa'}
                    </Badge>
                    {isTargetSandbox && (
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-400/40 text-[10px] py-0 px-2 font-bold uppercase tracking-wider">
                        Modo Sandbox (Prueba)
                      </Badge>
                    )}
                  </div>
                  <DialogDescription className="text-xs text-slate-300 font-normal mt-0.5">
                    {isEditMode ? 'Modifica el horario, profesional o servicios de la reserva.' : 'Registra la cita en la agenda verificando historial del cliente.'}
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Selector de Estado Integrado */}
                <FormField
                  control={form.control}
                  name="estado"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8.5 px-3 bg-white/10 border-white/20 text-white hover:bg-white/15 rounded-xl text-xs font-semibold focus:ring-0 gap-2 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="rounded-full shrink-0 shadow-xs"
                                style={{
                                  backgroundColor: currentStatusInfo.hex,
                                  boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.45)',
                                  width: '10px',
                                  height: '10px',
                                  minWidth: '10px',
                                  minHeight: '10px',
                                  borderRadius: '9999px',
                                  display: 'inline-block'
                                }}
                              />
                              <SelectValue placeholder={currentStatusInfo.label}>
                                {currentStatusInfo.label}
                              </SelectValue>
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          {statusOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} textValue={opt.label} className="cursor-pointer py-1.5">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="rounded-full shrink-0 shadow-xs"
                                  style={{
                                    backgroundColor: opt.hex,
                                    width: '10px',
                                    height: '10px',
                                    minWidth: '10px',
                                    minHeight: '10px',
                                    borderRadius: '9999px',
                                    display: 'inline-block'
                                  }}
                                />
                                <span className="font-semibold text-xs text-inherit">{opt.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* Botón Cerrar (X) de Alto Contraste */}
                <button
                  type="button"
                  onClick={() => onOpenChange && onOpenChange(false)}
                  className="p-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/15 transition-all focus:outline-hidden"
                  title="Cerrar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
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
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full h-10 justify-start text-left font-semibold rounded-xl border-border/80 bg-card hover:bg-muted/20 hover:border-blue-500/50 capitalize transition-all shadow-xs",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                                {field.value ? (
                                  format(field.value, "EEEE dd 'de' MMMM", { locale: es })
                                ) : (
                                  format(new Date(), "EEEE dd 'de' MMMM", { locale: es })
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] overflow-hidden bg-popover" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                            <Calendar
                              locale={es}
                              mode="single"
                              selected={field.value || new Date()}
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
                            {/* Botones de selección rápida Vatos Alfa */}
                            <div className="p-2 border-t border-border/40 flex items-center justify-between gap-2 bg-muted/15">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs font-semibold text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg flex-1"
                                onClick={() => {
                                  field.onChange(new Date());
                                  setIsCalendarOpen(false);
                                }}
                              >
                                Hoy
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs font-semibold text-slate-400 hover:text-foreground hover:bg-muted/50 rounded-lg flex-1"
                                onClick={() => {
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  field.onChange(tomorrow);
                                  setIsCalendarOpen(false);
                                }}
                              >
                                Mañana
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <FormLabel>Horario</FormLabel>
                    <div className="flex items-center gap-2">
                      {/* Horario Inicio */}
                      <div className="flex-1 bg-card border border-border/80 rounded-xl p-1.5 shadow-xs">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center mb-1">Inicio</p>
                        <div className="flex items-center justify-center gap-1">
                          <FormField
                            control={form.control}
                            name="hora_inicio_hora"
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <Select
                                  onValueChange={(value) => {
                                    field.onChange(value);
                                    form.setValue('hora_inicio_minuto', '00');
                                  }}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-8.5 px-2 text-center font-bold text-xs sm:text-sm rounded-lg bg-muted/20 border-border/60 hover:bg-muted/30 focus:border-blue-500">
                                      <SelectValue placeholder="HH" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="min-w-[4.5rem] max-h-48 p-1">
                                    {timeOptions.hours.map(h => (
                                      <SelectItem key={h} value={String(h).padStart(2, '0')}>
                                        {String(h).padStart(2, '0')}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <span className="font-bold text-muted-foreground text-xs">:</span>
                          <FormField
                            control={form.control}
                            name="hora_inicio_minuto"
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="h-8.5 px-2 text-center font-bold text-xs sm:text-sm rounded-lg bg-muted/20 border-border/60 hover:bg-muted/30 focus:border-blue-500">
                                      <SelectValue placeholder="MM" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="min-w-[4.5rem] max-h-48 p-1">
                                    {timeOptions.minutes.map(m => (
                                      <SelectItem key={m} value={m}>{m}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <span className="text-xs font-semibold text-muted-foreground px-0.5">a</span>

                      {/* Horario Fin */}
                      <div className="flex-1 bg-card border border-border/80 rounded-xl p-1.5 shadow-xs">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center mb-1">Fin</p>
                        <div className="flex items-center justify-center gap-1">
                          <FormField
                            control={form.control}
                            name="hora_fin_hora"
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  disabled={!watchedItems?.some(item => !!item.servicio)}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-8.5 px-2 text-center font-bold text-xs sm:text-sm rounded-lg bg-muted/20 border-border/60 hover:bg-muted/30 focus:border-blue-500">
                                      <SelectValue placeholder="HH" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="min-w-[4.5rem] max-h-48 p-1">
                                    {timeOptions.hours.map(h => (
                                      <SelectItem key={`end-h-${h}`} value={String(h).padStart(2, '0')}>
                                        {String(h).padStart(2, '0')}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          <span className="font-bold text-muted-foreground text-xs">:</span>
                          <FormField
                            control={form.control}
                            name="hora_fin_minuto"
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  disabled={!watchedItems?.some(item => !!item.servicio)}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-8.5 px-2 text-center font-bold text-xs sm:text-sm rounded-lg bg-muted/20 border-border/60 hover:bg-muted/30 focus:border-blue-500">
                                      <SelectValue placeholder="MM" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="min-w-[4.5rem] max-h-48 p-1">
                                    {timeOptions.minutes.map(m => (
                                      <SelectItem key={`end-m-${m}`} value={m}>{m}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                    <FormMessage className="text-center text-xs">
                      {form.formState.errors.hora_inicio_hora?.message}
                    </FormMessage>
                  </div>
                </div>

                {selectedClient ? (
                  <div className="space-y-3">
                    {/* Tarjeta de Cliente Estilizada Vatos Alfa */}
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-border shrink-0">
                            <AvatarFallback className="bg-[#1a233a] text-white font-bold text-xs">
                              {selectedClient.nombre?.[0]}{selectedClient.apellido?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-sm text-foreground">
                                {selectedClient.nombre} {selectedClient.apellido}
                              </p>
                              {isNewClient ? (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] py-0 px-1.5 font-semibold">
                                  Nuevo
                                </Badge>
                              ) : isAnticipoRequired ? (
                                <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] py-0 px-1.5 font-bold animate-pulse">
                                  🚨 Anticipo Requerido
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] py-0 px-1.5 font-semibold">
                                  ✓ Frecuente
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 font-mono">
                              <span>{selectedClient.telefono}</span>
                              {selectedClient.correo && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[200px]">{selectedClient.correo}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                            onClick={() => { setIsEditingClient(true); setIsClientModalOpen(true); }}
                            title="Editar datos del cliente"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => {
                              form.setValue('cliente_id', '');
                              setDepositPaid(false);
                            }}
                            title="Cambiar cliente"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Mini-Métricas de Asistencia y Fidelidad para Recepción */}
                      <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/60 text-center">
                        <div className="bg-muted/30 rounded-lg p-1.5">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase">Citas</p>
                          <p className="text-xs font-bold text-foreground">{clientStats.totalCitas}</p>
                        </div>
                        <div className="bg-blue-500/5 rounded-lg p-1.5 border border-blue-500/15">
                          <p className="text-[10px] text-blue-400/80 font-medium uppercase">Asistidas</p>
                          <p className="text-xs font-bold text-blue-400">{clientStats.asistidasCount}</p>
                        </div>
                        <div className={cn(
                          "rounded-lg p-1.5 border transition-colors",
                          unattendedCount >= maxInasistenciasPermitidas
                            ? "bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400"
                            : unattendedCount > 0
                            ? "bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300"
                            : "bg-muted/30 border-transparent text-muted-foreground"
                        )}>
                          <p className="text-[10px] font-medium uppercase">Inasistencias</p>
                          <p className={cn("text-xs font-black", unattendedCount >= maxInasistenciasPermitidas && "animate-pulse")}>
                            {unattendedCount}
                          </p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-1.5">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase">Canceladas</p>
                          <p className="text-xs font-bold text-muted-foreground">{clientStats.canceladasCount}</p>
                        </div>
                      </div>

                      {/* Nota del perfil si existe */}
                      {selectedClient.notas && (
                        <div className="mt-2.5 pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <span className="font-semibold text-foreground shrink-0">Nota del perfil:</span>
                          <span className="italic truncate">{selectedClient.notas}</span>
                        </div>
                      )}
                    </div>

                    {/* BANNERS INTELIGENTES DE ACCIÓN PARA RECEPCIÓN */}
                    {isAnticipoRequired ? (
                      <div className={cn(
                        "p-4 rounded-xl border-2 shadow-sm space-y-3",
                        isAnticipoRequiredDueToHistory
                          ? "border-red-500/50 bg-gradient-to-r from-red-500/10 via-red-500/5 to-red-500/10"
                          : "border-blue-500/50 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-blue-500/10"
                      )}>
                        <div className="flex items-start gap-3">
                          {isAnticipoRequiredDueToHistory ? (
                            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                          ) : (
                            <CreditCard className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={cn(
                                "font-black text-xs uppercase tracking-wide flex items-center gap-1.5",
                                isAnticipoRequiredDueToHistory ? "text-red-800 dark:text-red-200" : "text-blue-800 dark:text-blue-200"
                              )}>
                                {isAnticipoRequiredDueToHistory ? "🛡️ Escudo Antifraude: Anticipo Obligatorio" : "💳 Regla de Reserva: Anticipo por Monto (+$190 MXN)"}
                              </span>
                              <Badge className={cn(
                                "text-white font-bold text-[10px] px-2 py-0.5 shadow-xs",
                                isAnticipoRequiredDueToHistory ? "bg-red-600" : "bg-blue-600"
                              )}>
                                {isAnticipoRequiredDueToHistory ? `${penalizacionPorcentaje}% Anticipo` : `${anticipoPorcentajeDefecto}% Anticipo`}
                              </Badge>
                            </div>
                            <p className={cn(
                              "text-xs leading-snug",
                              isAnticipoRequiredDueToHistory ? "text-red-700 dark:text-red-300" : "text-blue-800 dark:text-blue-200"
                            )}>
                              {isAnticipoRequiredDueToHistory ? (
                                <>Este cliente acumula <strong>{unattendedCount} inasistencias previas</strong> (límite permitido: {maxInasistenciasPermitidas}). Por regla oficial de Vatos Alfa, <strong>debe pagar anticipo para apartar su cita</strong>.</>
                              ) : (
                                <>El total de la cita es de <strong>${currentTotal} MXN</strong> (alcanza o supera el mínimo de ${montoMinimoThreshold} MXN). Por regla oficial de Vatos Alfa, <strong>requiere anticipo para apartar lugar</strong>.</>
                              )}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-foreground pt-1 flex-wrap">
                              <span>Total Cita: <strong>${currentTotal} MXN</strong></span>
                              <span>•</span>
                              <span className={isAnticipoRequiredDueToHistory ? "text-red-700 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}>
                                Anticipo Requerido: <strong>${depositAmountCalculated} MXN</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Control de cobro en recepción */}
                        <div className={cn("pt-2 border-t flex flex-wrap items-center justify-between gap-2", isAnticipoRequiredDueToHistory ? "border-red-500/20" : "border-blue-500/20")}>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={depositPaid}
                              onChange={(e) => setDepositPaid(e.target.checked)}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="text-xs font-bold text-foreground">
                              {depositPaid ? '✓ Anticipo marcado como PAGADO en recepción' : 'Marcar Anticipo como PAGADO en recepción'}
                            </span>
                          </label>

                          {depositPaid && (
                            <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                              <span className="text-[11px] text-muted-foreground font-medium">Método:</span>
                              <Select value={depositMethod} onValueChange={setDepositMethod}>
                                <SelectTrigger className="h-7 text-xs w-32 bg-background border-border">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="efectivo">Efectivo</SelectItem>
                                  <SelectItem value="tarjeta">Tarjeta (Terminal)</SelectItem>
                                  <SelectItem value="transferencia">Transferencia</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isPenalizacionActive && unattendedCount === (maxInasistenciasPermitidas - 1) && unattendedCount > 0 ? (
                      <div className="p-3 bg-muted/40 border border-border/70 rounded-xl flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 text-xs">
                          <p className="font-bold text-foreground flex items-center gap-1.5">
                            ⚠️ Atención: 1 Inasistencia Previa Registrada
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            Si este cliente acumula una falta más ({maxInasistenciasPermitidas} en total), el sistema le exigirá anticipo obligatorio del {penalizacionPorcentaje}% en todas sus próximas reservas. Recuerda confirmarle su asistencia por WhatsApp.
                          </p>
                        </div>
                      </div>
                    ) : isNewClient ? (
                      <div className="p-2.5 px-3 bg-blue-500/10 border border-blue-500/25 rounded-xl flex items-center gap-2.5 text-xs">
                        <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
                        <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                          <strong>Primera visita del cliente:</strong> Asegúrate de verificar su teléfono para el envío automático de confirmaciones.
                        </p>
                      </div>
                    ) : (
                      <div className="p-2.5 px-3 bg-blue-500/5 border border-blue-500/15 rounded-xl flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                        <p className="text-[11px] text-blue-400 font-medium">
                          Cliente confiable sin inasistencias previas ({clientStats.totalCitas} citas registradas).
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <FormField control={form.control} name="cliente_id" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-1">
                        <FormLabel>Cliente</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/30 transition-colors"
                          onClick={() => { setIsEditingClient(false); setIsClientModalOpen(true); }}
                          title="Registrar nuevo cliente"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </div>
                      <ClientCombobox
                        clients={clients}
                        loading={clientsLoading}
                        value={field.value}
                        onChange={(val) => {
                          field.onChange(val);
                          setDepositPaid(false);
                        }}
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
                        <div className={cn("grid grid-cols-1 gap-3 items-start", fields.length > 1 ? "md:grid-cols-[1fr_1fr_110px]" : "md:grid-cols-2")}>
                          <FormField control={form.control} name={`items.${index}.servicio`} render={({ field }) => (
                            <FormItem>
                              <ServiceInput
                                value={field.value}
                                onChange={(val) => {
                                  field.onChange(val);
                                  const srv = servicesMap.get(val);
                                  if (srv) {
                                    const profId = form.getValues(`items.${index}.barbero_id`);
                                    const customDur = profId ? srv.durationPorProfesional?.[profId] : undefined;
                                    form.setValue(`items.${index}.duracion`, customDur !== undefined ? customDur : (srv.duration || 0), { shouldValidate: true });
                                  } else {
                                    form.setValue(`items.${index}.duracion`, 0, { shouldValidate: true });
                                  }
                                }}
                                groupedServices={groupedServices}
                                products={products}
                                isProduct={isProduct}
                                loading={servicesLoading}
                              />
                              <FormMessage />
                            </FormItem>
                          )} />

                          <FormField control={form.control} name={`items.${index}.barbero_id`} render={({ field }) => {
                            const itemLock = form.watch(`items.${index}.professional_lock`) ?? false;
                            return (
                              <FormItem>
                                <div className="flex items-center gap-2">
                                  <Select 
                                    onValueChange={(val) => {
                                      field.onChange(val);
                                      const srv = servicesMap.get(currentItemId);
                                      if (srv) {
                                        const customDur = srv.durationPorProfesional?.[val];
                                        form.setValue(`items.${index}.duracion`, customDur !== undefined ? customDur : (srv.duration || 0), { shouldValidate: true });
                                      }
                                    }} 
                                    value={field.value} 
                                    disabled={itemLock}
                                  >
                                    <FormControl>
                                      <SelectTrigger className={cn(
                                        "h-10 rounded-xl border-border/80 bg-card hover:bg-muted/20 focus:border-blue-500 font-medium text-xs sm:text-sm flex-1",
                                        availabilityErrors[index] && 'border-destructive'
                                      )}>
                                        <SelectValue placeholder={professionalsLoading ? 'Cargando...' : 'Selecciona un profesional'} />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="max-h-60 p-1.5 min-w-[210px]">
                                      {rowProfessionals.length > 0 ? (
                                        rowProfessionals.map((barber) => (
                                          <SelectItem
                                            key={barber.id}
                                            value={barber.id}
                                            textValue={barber.publicName || barber.name}
                                            className="py-1.5 px-2 rounded-lg cursor-pointer my-0.5"
                                          >
                                            <div className="flex items-center gap-2.5">
                                              <Avatar className="h-6 w-6 border border-border/60 shrink-0">
                                                <AvatarImage src={barber.avatarUrl} alt={barber.publicName || barber.name} />
                                                <AvatarFallback className="bg-[#202A49] text-white font-bold text-[9px]">
                                                  {(barber.publicName || barber.name || 'P').substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                              </Avatar>
                                              <div className="flex flex-col text-left">
                                                <span className="font-semibold text-xs text-inherit leading-tight">
                                                  {barber.publicName || barber.name}
                                                </span>
                                              </div>
                                            </div>
                                          </SelectItem>
                                        ))
                                      ) : (
                                        <div className="p-3 text-xs text-muted-foreground text-center">
                                          No hay profesionales disponibles para este servicio.
                                        </div>
                                      )}
                                    </SelectContent>
                                  </Select>

                                  {/* Icono de candado a la derecha de Selecciona un profesional */}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-10 w-10 shrink-0 rounded-xl border bg-card transition-all",
                                      itemLock
                                        ? "border-blue-500/40 text-blue-500 bg-blue-500/10 hover:bg-blue-500/20"
                                        : "border-border/80 text-slate-400 hover:text-foreground hover:bg-muted/30"
                                    )}
                                    onClick={() => form.setValue(`items.${index}.professional_lock`, !itemLock, { shouldValidate: true })}
                                    title={itemLock ? "Desbloquear selección de profesional" : "Bloquear profesional para que no se reasigne"}
                                  >
                                    {itemLock ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                  </Button>
                                </div>
                                <FormMessage />
                                {availabilityErrors[index] && <p className="text-destructive text-sm mt-1">{availabilityErrors[index]}</p>}
                              </FormItem>
                            );
                          }} />

                          {!isProduct && fields.length > 1 && (
                            <FormField control={form.control} name={`items.${index}.duracion`} render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      className="h-10 rounded-xl pr-8 font-semibold"
                                      placeholder="Duración"
                                      value={field.value || 0}
                                      onChange={(e) => field.onChange(Number(e.target.value))}
                                      min={0}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                      m
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          )}
                        </div>
                        {fields.length > 1 && (
                          <div className="mt-3 pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name={`items.${index}.hora_inicio_hora`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Hora de inicio específica (opcional)</FormLabel>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      onValueChange={(val) => {
                                        const actualVal = val === "default" ? "" : val;
                                        field.onChange(actualVal);
                                        if (actualVal && !form.getValues(`items.${index}.hora_inicio_minuto`)) {
                                          form.setValue(`items.${index}.hora_inicio_minuto`, '00');
                                        }
                                      }}
                                      value={field.value || "default"}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="h-9 rounded-xl border-border/80 bg-card hover:bg-muted/20 text-xs font-medium">
                                          <SelectValue placeholder="Global / Por defecto" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="max-h-48 p-1">
                                        <SelectItem value="default">Global / Por defecto</SelectItem>
                                        {timeOptions.hours.map(h => {
                                          const val = String(h).padStart(2, '0');
                                          return <SelectItem key={`item-h-${index}-${val}`} value={val}>{val}</SelectItem>;
                                        })}
                                      </SelectContent>
                                    </Select>
                                    <span className="font-bold text-muted-foreground text-xs">:</span>
                                    <FormField
                                      control={form.control}
                                      name={`items.${index}.hora_inicio_minuto`}
                                      render={({ field: minField }) => (
                                        <Select
                                          onValueChange={(val) => {
                                            const actualVal = val === "default" ? "" : val;
                                            minField.onChange(actualVal);
                                          }}
                                          value={minField.value || "default"}
                                          disabled={!field.value}
                                        >
                                          <FormControl>
                                            <SelectTrigger className="h-9 rounded-xl border-border/80 bg-card hover:bg-muted/20 text-xs font-medium">
                                              <SelectValue placeholder="MM" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent className="min-w-[4.5rem] max-h-48 p-1">
                                            <SelectItem value="default">MM</SelectItem>
                                            {timeOptions.minutes.map(m => (
                                              <SelectItem key={`item-m-${index}-${m}`} value={m}>{m}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    />
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                        )}
                        {fields.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ servicio: '', barbero_id: '', duracion: 0, professional_lock: false })} className="w-full">
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

          {/* BARRA INFERIOR DE ACCIONES VATOS ALFA */}
          <div className="flex-shrink-0 p-4 sm:p-5 border-t bg-muted/10 mt-auto flex items-center justify-between">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 flex-wrap">
              <span>Total:</span>
              <span className="text-sm font-bold text-foreground">${formatMoney(currentTotal)} MXN</span>
              {isAnticipoRequired && (
                <Badge variant="outline" className={cn("text-[10px] font-bold py-0 ml-1.5", depositPaid ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "bg-red-500/10 text-red-400 border-red-500/30")}>
                  {depositPaid ? `Anticipo $${formatMoney(depositAmountCalculated)} Pagado` : `Anticipo $${formatMoney(depositAmountCalculated)} Pendiente`}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl h-10 px-4 text-xs font-semibold"
                onClick={() => onOpenChange && onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl h-10 px-6 text-xs font-bold btn-vatos-alfa"
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditMode ? 'Guardar Cambios' : 'Guardar Reserva')}
              </Button>
            </div>
          </div>
        </form>
      </Form>
      <Dialog open={isClientModalOpen} onOpenChange={(open) => {
        setIsClientModalOpen(open);
        if (!open) {
          setIsEditingClient(false);
          setClientSearchTerm('');
        }
      }}>
        <DialogContent hideCloseButton={true} className="sm:max-w-lg p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background flex flex-col">
          {/* CABECERA OFICIAL VATOS ALFA */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-4 sm:px-5 py-3 border-b border-blue-900/40 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <User className="h-4 w-4 text-slate-300 shrink-0" />
                <div>
                  <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">
                    {isEditingClient && selectedClient ? 'Editar Cliente' : 'Crear Nuevo Cliente'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    {isEditingClient && selectedClient ? 'Completa la información para actualizar al cliente.' : 'Completa la información para registrar al cliente.'}
                  </DialogDescription>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsClientModalOpen(false)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {isClientModalOpen && (
              <NewClientForm onFormSubmit={(clientId) => { handleClientCreated(clientId); setIsEditingClient(false); }} client={isEditingClient ? selectedClient : null} initialName="" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirmLockModal} onOpenChange={(open) => {
        setShowConfirmLockModal(open);
        if (!open) {
          setCurrentConfirmIdx(-1);
          setPendingConfirmProfs([]);
        }
      }}>
        <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background flex flex-col">
          {/* CABECERA OFICIAL VATOS ALFA */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Scissors className="h-5 w-5 text-slate-300 shrink-0" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    Confirmación de Barbero
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300 mt-0.5">
                    Preferencia exclusiva de profesional
                  </DialogDescription>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowConfirmLockModal(false);
                  setCurrentConfirmIdx(-1);
                  setPendingConfirmProfs([]);
                }}
                className="p-1 text-slate-300 hover:text-white transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm font-semibold text-foreground">
              {(() => {
                const currentProfId = pendingConfirmProfs[currentConfirmIdx];
                const professionalName = professionals.find(p => p.id === currentProfId)?.name;
                return professionalName
                  ? `¿El cliente pidió exclusivamente con ${professionalName}?`
                  : '¿El cliente pidió exclusivamente con el barbero?';
              })()}
            </p>
          </div>
          <DialogFooter className="px-5 pb-5 pt-0 flex justify-end gap-3 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const currentProfId = pendingConfirmProfs[currentConfirmIdx];
                const newLocks = { ...confirmedLocks, [currentProfId]: false };
                setConfirmedLocks(newLocks);

                const nextIdx = currentConfirmIdx + 1;
                if (nextIdx < pendingConfirmProfs.length) {
                  setCurrentConfirmIdx(nextIdx);
                } else {
                  setShowConfirmLockModal(false);
                  setCurrentConfirmIdx(-1);
                  setPendingConfirmProfs([]);
                  if (pendingSubmitData) {
                    const updatedItems = pendingSubmitData.items.map((item: any) => ({
                      ...item,
                      professional_lock: newLocks[item.barbero_id] ?? false
                    }));
                    await executeSave({ ...pendingSubmitData, items: updatedItems });
                  }
                }
              }}
            >
              No
            </Button>
            <Button
              type="button"
              className="btn-vatos-alfa rounded-xl font-bold text-xs"
              onClick={async () => {
                const currentProfId = pendingConfirmProfs[currentConfirmIdx];
                const newLocks = { ...confirmedLocks, [currentProfId]: true };
                setConfirmedLocks(newLocks);

                const nextIdx = currentConfirmIdx + 1;
                if (nextIdx < pendingConfirmProfs.length) {
                  setCurrentConfirmIdx(nextIdx);
                } else {
                  setShowConfirmLockModal(false);
                  setCurrentConfirmIdx(-1);
                  setPendingConfirmProfs([]);
                  if (pendingSubmitData) {
                    const updatedItems = pendingSubmitData.items.map((item: any) => ({
                      ...item,
                      professional_lock: newLocks[item.barbero_id] ?? false
                    }));
                    await executeSave({ ...pendingSubmitData, items: updatedItems });
                  }
                }
              }}
            >
              Sí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PREVENTIVO DE ANTICIPO POR INASISTENCIAS */}
      <Dialog open={showDepositWarningModal} onOpenChange={setShowDepositWarningModal}>
        <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 rounded-2xl overflow-hidden shadow-2xl border border-border">
          <div className={cn(
            "p-4 sm:p-5 text-white border-b flex items-center justify-between relative overflow-hidden",
            isAnticipoRequiredDueToHistory
              ? "bg-gradient-to-r from-red-950 via-slate-900 to-red-950 border-red-900/50"
              : "bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border-[#2d3a60]/60"
          )}>
            {/* Haz de luz animado en diagonal */}
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              {isAnticipoRequiredDueToHistory ? (
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" />
              ) : (
                <CreditCard className="h-5 w-5 text-slate-300 shrink-0" />
              )}
              <div>
                <DialogTitle className="text-base font-bold text-white tracking-tight">
                  {isAnticipoRequiredDueToHistory
                    ? 'Escudo Antifraude • Anticipo Requerido'
                    : 'Regla de Reserva • Anticipo Requerido'}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  {isAnticipoRequiredDueToHistory
                    ? 'Regla de reserva para clientes con historial de inasistencias'
                    : `Cita a partir de $${montoMinimoThreshold} MXN requiere anticipo de garantía`}
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDepositWarningModal(false)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
            </div>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <div className={cn(
              "p-3.5 border rounded-xl space-y-1.5",
              isAnticipoRequiredDueToHistory ? "bg-red-500/10 border-red-500/30" : "bg-blue-500/10 border-blue-500/30"
            )}>
              <p className={cn("font-bold text-sm", isAnticipoRequiredDueToHistory ? "text-red-700 dark:text-red-300" : "text-blue-800 dark:text-blue-200")}>
                {isAnticipoRequiredDueToHistory
                  ? `Este cliente tiene ${unattendedCount} inasistencias registradas.`
                  : `Cita con total de $${currentTotal} MXN (alcanza o supera los $${montoMinimoThreshold} MXN).`}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {isAnticipoRequiredDueToHistory
                  ? `Para proteger el tiempo del barbero y los costos operativos, la política de Vatos Alfa exige un anticipo del ${penalizacionPorcentaje}% ($${depositAmountCalculated} MXN).`
                  : `Según las reglas de reserva de Vatos Alfa, citas de $${montoMinimoThreshold} MXN o más exigen un anticipo del ${anticipoPorcentajeDefecto}% ($${depositAmountCalculated} MXN) para confirmar el lugar.`}
              </p>
            </div>

            <p className="text-muted-foreground font-medium">
              ¿Cómo deseas proceder con esta reserva en el sistema?
            </p>

            <div className="space-y-2 pt-1">
              <Button
                type="button"
                className="w-full btn-vatos-alfa font-bold h-10 rounded-xl justify-center text-xs shadow-sm"
                onClick={async () => {
                  setDepositPaid(true);
                  setShowDepositWarningModal(false);
                  if (pendingSaveData) {
                    await proceedWithSubmission(pendingSaveData, true);
                  }
                }}
              >
                ✓ Ya cobré el anticipo (${depositAmountCalculated} MXN)
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-10 rounded-xl justify-center text-xs font-bold border-border/80 hover:bg-muted text-foreground shadow-xs flex items-center gap-2"
                onClick={async () => {
                  setDepositPaid(false);
                  setShowDepositWarningModal(false);
                  if (pendingSaveData) {
                    await proceedWithSubmission(pendingSaveData, false);
                  }
                }}
              >
                <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                <span>Enviar Enlace Mercado Pago (SPEI / Tarjeta)</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-9 rounded-xl justify-center text-xs font-medium text-muted-foreground border-border hover:bg-muted"
                onClick={async () => {
                  setDepositPaid(false);
                  setShowDepositWarningModal(false);
                  if (pendingSaveData) {
                    await proceedWithSubmission(pendingSaveData, false);
                  }
                }}
              >
                Dejar como Pendiente de Anticipo (Cobrar después)
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full h-9 rounded-xl justify-center text-xs text-muted-foreground"
                onClick={() => setShowDepositWarningModal(false)}
              >
                Volver a revisar datos de la cita
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (isDialogChild) {
    return formContent;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="max-w-2xl h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden shadow-2xl border border-border bg-background"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
