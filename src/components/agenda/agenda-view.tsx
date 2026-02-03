

'use client';

import { useState, useRef, MouseEvent, useEffect, useMemo, useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, Eye, Plus, Lock, Pencil, Mail, User, Circle, Trash2, Loader2, Globe } from 'lucide-react';
import { format, addMinutes, subDays, isToday, parse, getHours, getMinutes, set, getDay, addDays as dateFnsAddDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';
import { ReservationDetailModal } from '../reservations/reservation-detail-modal';
import { NewSaleSheet } from '../sales/new-sale-sheet';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '../ui/skeleton';
import { where, doc, updateDoc, deleteDoc, runTransaction, increment } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { CancelReservationModal } from '../reservations/cancel-reservation-modal';
import { Label } from '../ui/label';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';
import Image from 'next/image';
import type { Profesional, Client, Service as ServiceType, ScheduleDay, Reservation, Local, TimeBlock, SaleItem, User as AppUser, Product } from '@/lib/types';

import { EnableScheduleModal } from '../reservations/enable-schedule-modal';

interface EmpresaSettings {
  receipt_logo_url?: string;
}

// Define a union type for events to be displayed on the agenda
type AgendaEvent = (Reservation & { type: 'appointment', duration: number, start: number, end: number, color: string, layout: any }) |
  (TimeBlock & { type: 'block', duration: number, start: number, end: number, color: string, layout: any, originalType?: string });


const ROW_HEIGHT = 48; // This is the visual height of one time slot row in the agenda.

const useCurrentTime = () => {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    // Set time on mount to avoid server/client mismatch
    setTime(new Date());

    const timer = setInterval(() => {
      setTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  return time;
};

const NonWorkBlock = ({ top, height, text, onClick }: { top: number, height: number, text: string, onClick?: (e: MouseEvent<HTMLDivElement>) => void }) => (
  <div
    className={cn("absolute w-full bg-striped-gray flex items-center justify-center p-2 z-0", onClick && "cursor-pointer hover:bg-gray-200/50 transition-colors")}
    style={{ top: `${top}px`, height: `${height}px` }}
    onClick={onClick}
  >
    <p className="text-xs text-center font-medium text-gray-500">{text}</p>
  </div>
);

const getStatusColor = (status: string | undefined) => {
  switch (status) {
    case 'Reservado':
      return 'bg-blue-300/80 border-blue-500 text-blue-900';
    case 'Confirmado':
      return 'bg-yellow-300/80 border-yellow-500 text-yellow-900';
    case 'Asiste':
      return 'bg-pink-300/80 border-pink-500 text-pink-900';
    case 'No asiste':
      return 'bg-orange-300/80 border-orange-500 text-orange-900';
    case 'Pendiente': // Legacy
    case 'pending_payment':
      return 'bg-red-300/80 border-red-500 text-red-900';
    case 'Pendiente de Pago': // New standard
      return 'bg-red-300/80 border-red-500 text-red-900';
    case 'deposit_paid':
      return 'bg-orange-300/80 border-orange-500 text-orange-900';
    case 'En espera':
      return 'bg-indigo-300/80 border-indigo-500 text-indigo-900';
    case 'Cancelado':
      return 'bg-gray-300/80 border-gray-500 text-gray-800 line-through';
    default:
      return 'bg-gray-200/80 border-gray-500 text-gray-800';
  }
}


const subtractIntervals = (base: { start: number, end: number }, subtractions: { start: number, end: number }[]) => {
  let result = [base];
  for (const sub of subtractions) {
    const nextResult = [];
    for (const res of result) {
      const start = Math.max(res.start, sub.start);
      const end = Math.min(res.end, sub.end);
      if (start < end) {
        if (res.start < start) nextResult.push({ start: res.start, end: start });
        if (end < res.end) nextResult.push({ start: end, end: res.end });
      } else {
        nextResult.push(res);
      }
    }
    result = nextResult;
  }
  return result;
};

export default function AgendaView() {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [hoveredBarberId, setHoveredBarberId] = useState<string | null>(null);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(60);
  const [selectedProfessionalFilter, setSelectedProfessionalFilter] = useState('todos');
  const { selectedLocalId, setSelectedLocalId } = useLocal();
  const { user, db } = useAuth();

  const [hoveredSlot, setHoveredSlot] = useState<{ barberId: string, time: string } | null>(null);
  const [popoverState, setPopoverState] = useState<{ barberId: string, time: string } | null>(null);

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isSaleSheetOpen, setIsSaleSheetOpen] = useState(false);
  const [saleInitialData, setSaleInitialData] = useState<any>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<Reservation | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<TimeBlock | null>(null);

  // New State for Enable Schedule
  const [isEnableScheduleModalOpen, setIsEnableScheduleModalOpen] = useState(false);
  const [enableScheduleInitialData, setEnableScheduleInitialData] = useState<any>(null);

  const handleNonWorkClick = (e: MouseEvent<HTMLDivElement>, barberId: string) => {
    if (!canSee('bloquear_horarios')) return;
    e.stopPropagation();

    const gridEl = gridRefs.current[barberId];
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const totalGridHeight = (timeSlots.length - 1) * ROW_HEIGHT;
    const minutesFromStart = (y / totalGridHeight) * (timeSlots.length - 1) * slotDurationMinutes;

    const slotIndex = Math.floor(minutesFromStart / 15);
    const time = format(addMinutes(set(new Date(), { hours: startHour, minutes: 0 }), slotIndex * 15), 'HH:mm');

    const barber = professionals.find(p => p.id === barberId);

    setEnableScheduleInitialData({
      barbero_id: barberId,
      barberName: barber?.name,
      fecha: date,
      hora_inicio: time,
      local_id: selectedLocalId
    });
    setIsEnableScheduleModalOpen(true);
  }

  const gridRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const popoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentTime = useCurrentTime();
  const [isClientMounted, setIsClientMounted] = useState(false);
  const { toast } = useToast();

  const [queryKey, setQueryKey] = useState(0);
  const onDataRefresh = () => setQueryKey(prev => prev + 1);

  // Helper for checking permissions
  const canSee = (permission: string) => {
    if (!user || !user.permissions) return false;
    if (user.role === 'Administrador general') return true;
    return user.permissions.includes(permission);
  }

  useEffect(() => {
    setIsClientMounted(true)
    setDate(new Date());
  }, []);

  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
  const { data: services, loading: servicesLoading } = useFirestoreQuery<ServiceType>('servicios');
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: empresaData, loading: empresaLoading } = useFirestoreQuery<EmpresaSettings>('empresa', 'main', where('__name__', '==', 'main'));
  const { data: users, loading: usersLoading } = useFirestoreQuery<AppUser>('usuarios', queryKey);
  const logoUrl = empresaData?.[0]?.receipt_logo_url;

  useEffect(() => {
    // If user has a specific local assigned (e.g. receptionist), enforce it.
    if (user?.local_id) {
      if (selectedLocalId !== user.local_id) {
        setSelectedLocalId(user.local_id);
      }
    }
    // If user is general admin (no specific local) and no local is selected, select the first one.
    else if (!selectedLocalId && locales.length > 0) {
      setSelectedLocalId(locales[0].id);
    }
  }, [locales, selectedLocalId, setSelectedLocalId, user]);


  const selectedLocal = useMemo(() => {
    if (!selectedLocalId || locales.length === 0) return null;
    return locales.find(l => l.id === selectedLocalId) || locales[0];
  }, [selectedLocalId, locales]);

  const { timeSlots, startHour, endHour } = useMemo(() => {
    if (!selectedLocal || !selectedLocal.schedule) {
      return { timeSlots: [], startHour: 10, endHour: 21 };
    }
    const dayOfWeek = date ? format(date, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : 'lunes';
    const daySchedule = selectedLocal.schedule[dayOfWeek as keyof typeof selectedLocal.schedule] || selectedLocal.schedule.lunes;

    if (!daySchedule.enabled) {
      return { timeSlots: [], startHour: 10, endHour: 21 };
    }

    const [startH, startM] = daySchedule.start.split(':').map(Number);
    const [endH, endM] = daySchedule.end.split(':').map(Number);

    const slots = [];
    let currentTime = set(new Date(), { hours: startH, minutes: startM, seconds: 0 });
    const endTime = set(new Date(), { hours: endH, minutes: endM, seconds: 0 });

    while (currentTime < endTime) {
      slots.push(format(currentTime, 'HH:mm'));
      currentTime = addMinutes(currentTime, slotDurationMinutes);
    }
    slots.push(format(endTime, 'HH:mm'));

    return { timeSlots: slots, startHour: startH, endHour: endH };
  }, [date, selectedLocal, slotDurationMinutes]);


  const reservationsQueryConstraint = useMemo(() => {
    if (!date || !selectedLocalId) return undefined;
    return [
      where('fecha', '==', format(date, 'yyyy-MM-dd')),
      where('local_id', '==', selectedLocalId)
    ];
  }, [date, selectedLocalId]);

  const reservationsQueryKey = useMemo(() => `reservations-${date ? format(date, 'yyyy-MM-dd') : ''}-${selectedLocalId}-${queryKey}`, [date, selectedLocalId, queryKey]);
  const blocksQueryKey = useMemo(() => `blocks-${date ? format(date, 'yyyy-MM-dd') : ''}-${selectedLocalId}-${queryKey}`, [date, selectedLocalId, queryKey]);

  const { data: reservations } = useFirestoreQuery<Reservation>('reservas', reservationsQueryKey, ...(reservationsQueryConstraint || []));
  const { data: timeBlocks } = useFirestoreQuery<TimeBlock>('bloqueos_horario', blocksQueryKey, ...(reservationsQueryConstraint || []));

  const isLoading = professionalsLoading || clientsLoading || servicesLoading || localesLoading || usersLoading || productsLoading;

  const filteredProfessionals = useMemo(() => {
    let professionalsOfLocal = professionals.filter(p => !p.deleted && p.local_id === selectedLocalId);

    // If user cannot see global agenda, filter to only show themselves
    const canViewAll = canSee('ver_agenda_global');
    if (!canViewAll) {
      // Fix: Match by email to avoid type errors with 'id' on CustomUser
      const myProf = professionals.find(p => !p.deleted && p.email === user?.email);
      if (myProf) {
        professionalsOfLocal = [myProf];
      } else {
        professionalsOfLocal = [];
      }
    }

    if (selectedProfessionalFilter === 'todos') {
      return professionalsOfLocal;
    }
    return professionalsOfLocal.filter(p => p.id === selectedProfessionalFilter);
  }, [professionals, selectedProfessionalFilter, selectedLocalId, user]);

  const allEvents: AgendaEvent[] = useMemo(() => {
    if (!reservations || !timeBlocks || !clients || !professionals) return [];

    const clientMap = new Map(clients.map(c => [c.id, c]));
    const professionalMap = new Map(professionals.map(p => [p.id, p.name]));

    const appointmentEvents: AgendaEvent[] = reservations
      .filter(res => res.estado !== 'Cancelado')
      .map(res => {
        const [startH, startM] = res.hora_inicio.split(':').map(Number);
        const [endH, endM] = res.hora_fin.split(':').map(Number);
        const start = startH + startM / 60;
        const end = endH + endM / 60;

        return {
          ...res,
          customer: clientMap.get(res.cliente_id),
          professionalNames: res.items?.map((i: SaleItem) => professionalMap.get(i.barbero_id)).filter(Boolean).join(', ') || 'N/A',
          start: start,
          end: end,
          duration: Math.max(0.0833, end - start),
          color: getStatusColor(res.estado),
          type: 'appointment' as const,
          layout: { width: 100, left: 0, col: 0, totalCols: 1 }
        };
      });

    const mappedBlockEvents: AgendaEvent[] = timeBlocks.map(block => {
      const [startH, startM] = block.hora_inicio.split(':').map(Number);
      const [endH, endM] = block.hora_fin.split(':').map(Number);
      const start = startH + startM / 60;
      const end = endH + endM / 60;
      const isAvailable = (block as any).type === 'available';
      return {
        ...block,
        id: block.id,
        barbero_id: block.barbero_id,
        customer: { nombre: block.motivo } as any,
        service: isAvailable ? 'Disponible' : 'Bloqueado',
        start: start,
        end: end,
        duration: Math.max(0.0833, end - start),
        color: isAvailable ? 'bg-background border-dashed border-green-500 z-10' : 'bg-striped-gray border-gray-400 text-gray-600',
        type: 'block' as const,
        originalType: (block as any).type,
        layout: { width: 100, left: 0, col: 0, totalCols: 1 }
      };
    });

    // Valid blocks filtering: remove 'blocking' blocks if they are overlapped by an 'available' block
    const validBlockEvents = mappedBlockEvents.filter(block => {
      if ((block as any).originalType === 'available') return true;

      // Check if this blocking block is overridden by an available block
      const isOverridden = mappedBlockEvents.some(other =>
        (other as any).originalType === 'available' &&
        other.barbero_id === block.barbero_id &&
        // Check overlap
        (other.start < block.end && other.end > block.start)
      );

      return !isOverridden;
    });

    return [...appointmentEvents, ...validBlockEvents];
  }, [reservations, timeBlocks, clients, professionals]);

  const eventsWithLayout: AgendaEvent[] = useMemo(() => {
    const processedEvents: AgendaEvent[] = allEvents.map(event => ({ ...event, layout: { width: 100, left: 0, col: 0, totalCols: 1 } }));

    for (let i = 0; i < processedEvents.length; i++) {
      const eventA = processedEvents[i];

      const overlappingEvents: AgendaEvent[] = [eventA];

      for (let j = i + 1; j < processedEvents.length; j++) {
        const eventB = processedEvents[j];

        const eventAProfessionals = eventA.type === 'appointment' && eventA.items ? eventA.items.map((item) => item.barbero_id) : [eventA.barbero_id];
        const eventBProfessionals = eventB.type === 'appointment' && eventB.items ? eventB.items.map((item) => item.barbero_id) : [eventB.barbero_id];

        const hasCommonProfessional = eventAProfessionals.some(p => eventBProfessionals.includes(p));

        if (hasCommonProfessional && eventA.start < eventB.end && eventA.end > eventB.start) {
          overlappingEvents.push(eventB);
        }
      }

      if (overlappingEvents.length > 1) {
        overlappingEvents.sort((a, b) => a.start - b.start);

        const columns: AgendaEvent[][] = [];
        overlappingEvents.forEach(event => {
          let placed = false;
          for (let colIndex = 0; colIndex < columns.length; colIndex++) {
            const lastEventInColumn = columns[colIndex][columns[colIndex].length - 1];
            if (event.start >= lastEventInColumn.end) {
              columns[colIndex].push(event);
              event.layout.col = colIndex;
              placed = true;
              break;
            }
          }
          if (!placed) {
            columns.push([event]);
            event.layout.col = columns.length - 1;
          }
        });

        const totalCols = columns.length;
        overlappingEvents.forEach(event => {
          event.layout.totalCols = totalCols;
          event.layout.width = 100 / totalCols;
          event.layout.left = event.layout.col * event.layout.width;
        });
      }
    }
    return processedEvents;
  }, [allEvents]);


  const handleSetToday = () => setDate(new Date());
  const handlePrevDay = () => setDate(d => subDays(d || new Date(), 1));
  const handleNextDay = () => setDate(d => dateFnsAddDays(d || new Date(), 1));

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>, barberId: string) => {
    if (!canSee('crear_reservas') && !canSee('bloquear_horarios')) return;

    const gridEl = gridRefs.current[barberId];
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const totalGridHeight = (timeSlots.length - 1) * ROW_HEIGHT;
    const minutesFromStart = (y / totalGridHeight) * (timeSlots.length - 1) * slotDurationMinutes;

    const slotIndex = Math.floor(minutesFromStart / 15);
    const time = format(addMinutes(set(new Date(), { hours: startHour, minutes: 0 }), slotIndex * 15), 'HH:mm');

    const totalSlots = (endHour - startHour) * (60 / 15);
    if (slotIndex < 0 || slotIndex >= totalSlots) {
      setHoveredSlot(null);
      // Start closing timer if invalid slot
      if (popoverState && !popoverTimeoutRef.current) {
        popoverTimeoutRef.current = setTimeout(() => setPopoverState(null), 400);
      }
      return;
    }

    // Check if slot overlaps with a break
    const barber = filteredProfessionals.find(p => p.id === barberId);
    if (barber) {
      const daySchedule = getDaySchedule(barber);
      if (daySchedule && daySchedule.breaks) {
        const [slotH, slotM] = time.split(':').map(Number);
        const slotTime = slotH * 60 + slotM;
        const slotEnd = slotTime + 15; // 15 min slot check

        const isBreak = daySchedule.breaks.some((brk: any) => {
          const [sH, sM] = brk.start.split(':').map(Number);
          const [eH, eM] = brk.end.split(':').map(Number);
          const breakStart = sH * 60 + sM;
          const breakEnd = eH * 60 + eM;

          // Intersection check
          return (slotTime < breakEnd && slotEnd > breakStart);
        });

        if (isBreak) {
          setHoveredSlot(null);
          if (popoverState && !popoverTimeoutRef.current) {
            popoverTimeoutRef.current = setTimeout(() => setPopoverState(null), 400);
          }
          return;
        }
      }
    }

    setHoveredSlot({ barberId, time });

    // Handle popover auto-close with delay
    if (popoverState) {
      if (popoverState.barberId !== barberId || popoverState.time !== time) {
        // If we moved to a different slot, start the closing timer (if not already started)
        if (!popoverTimeoutRef.current) {
          popoverTimeoutRef.current = setTimeout(() => {
            setPopoverState(null);
            popoverTimeoutRef.current = null;
          }, 400);
        }
      } else {
        // If we are back in the correct slot, clear the timer
        if (popoverTimeoutRef.current) {
          clearTimeout(popoverTimeoutRef.current);
          popoverTimeoutRef.current = null;
        }
      }
    }
  }

  const handleMouseLeave = () => {
    setHoveredSlot(null);
    // When leaving grid, start timer instead of immediate close
    if (popoverState && !popoverTimeoutRef.current) {
      popoverTimeoutRef.current = setTimeout(() => {
        setPopoverState(null);
        popoverTimeoutRef.current = null;
      }, 400);
    }
  }

  const handleClickSlot = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (hoveredSlot) {
      setPopoverState(hoveredSlot)
    } else {
      setPopoverState(null)
    }
  }

  const handleOpenReservationModal = () => {
    if (!canSee('crear_reservas')) return;
    if (popoverState && date) {
      setReservationInitialData({
        barbero_id: popoverState.barberId,
        fecha: date,
        hora_inicio: popoverState.time,
        local_id: selectedLocalId,
      });
      setIsReservationModalOpen(true);
      setPopoverState(null);
    }
  };

  const handleOpenBlockModal = () => {
    if (!canSee('bloquear_horarios')) return;
    if (popoverState && date) {
      setBlockInitialData({
        barbero_id: popoverState.barberId,
        fecha: date,
        hora_inicio: popoverState.time
      });
      setIsBlockScheduleModalOpen(true);
      setPopoverState(null);
    }
  };

  const handleOpenDetailModal = (event: AgendaEvent) => {
    const fullReservation = allEvents.find(r => r.id === event.id) as Reservation | undefined;
    if (fullReservation) {
      setSelectedReservation(fullReservation);
      setIsDetailModalOpen(true);
    }
  }

  const handleEditFromDetail = () => {
    setReservationInitialData(selectedReservation);
    setIsDetailModalOpen(false);
    setIsReservationModalOpen(true);
  }

  const handlePayFromDetail = () => {
    if (!selectedReservation || !clients || !services || !products) return;
    const client = clients.find(c => c.id === selectedReservation.cliente_id);
    if (client && selectedReservation.items) {
      const cartItems = selectedReservation.items.map(item => {
        if (item.tipo === 'producto') {
          const product = products.find(p => p.nombre === item.nombre || p.id === item.id);
          return product ? {
            ...product,
            id: product.id,
            nombre: product.nombre,
            precio: product.public_price,
            cantidad: item.cantidad,
            tipo: 'producto' as const
          } : null;
        } else {
          // Default to service
          const service = services.find(s => s.name === item.servicio || s.id === (item as any).id);
          return service ? {
            ...service,
            id: service.id,
            nombre: service.name,
            precio: service.price,
            cantidad: 1,
            tipo: 'servicio' as const,
            barbero_id: item.barbero_id
          } : null;
        }
      }).filter((i): i is any => !!i);

      setSaleInitialData({
        client,
        items: cartItems,
        reservationId: selectedReservation.id,
        local_id: selectedReservation.local_id,
        anticipoPagado: selectedReservation.anticipo_pagado || selectedReservation.monto_pagado || 0
      });
      setIsDetailModalOpen(false);
      setIsSaleSheetOpen(true);
    }
  }



  const handleUpdateStatus = async (reservationId: string, newStatus: string) => {
    if (!db) {
      toast({ variant: 'destructive', title: 'Error', description: 'No hay conexión con la base de datos.' });
      return;
    }
    try {
      const resRef = doc(db, 'reservas', reservationId);
      await updateDoc(resRef, { estado: newStatus });
      toast({ title: 'Estado actualizado', description: `La reserva ahora está en estado: ${newStatus}` });
      if (selectedReservation) {
        setSelectedReservation({ ...selectedReservation, estado: newStatus })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' })
    }
  };

  const handleCancelReservation = async (reservationId: string) => {
    if (!selectedReservation || !selectedReservation.cliente_id || !db) {
      toast({ variant: 'destructive', title: "Error", description: "La reserva no tiene un cliente asociado o no hay conexión con la base de datos." });
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        if (!db) throw new Error("Database not available in transaction");
        const resRef = doc(db, 'reservas', reservationId);
        const clientRef = doc(db, 'clientes', selectedReservation.cliente_id!);

        transaction.update(resRef, { estado: 'Cancelado' });
        transaction.update(clientRef, {
          citas_canceladas: increment(1)
        });
      });

      toast({
        title: "Reserva Cancelada",
        description: "El estado de la reserva ha sido actualizado a 'Cancelado'.",
      });

      setIsCancelModalOpen(false);
      setSelectedReservation(null);
      setIsDetailModalOpen(false);
      onDataRefresh(); // This will trigger a re-render of AgendaView and a re-fetch of reservations

    } catch (error) {
      console.error("Error canceling reservation: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cancelar la reserva. Inténtalo de nuevo.",
      });
    }
  };

  const handleDeleteBlock = async () => {
    if (!blockToDelete || !db) return;
    try {
      await deleteDoc(doc(db, "bloqueos_horario", blockToDelete.id));
      toast({
        title: "Horario desbloqueado",
        description: `El bloqueo para "${blockToDelete.motivo}" ha sido eliminado.`,
      });
      onDataRefresh();
    } catch (error) {
      console.error("Error deleting block: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el bloqueo. Inténtalo de nuevo.",
      });
    } finally {
      setBlockToDelete(null);
    }
  };

  const calculatePosition = (startDecimal: number, durationDecimal: number) => {
    const pixelsPerMinute = ROW_HEIGHT / slotDurationMinutes;
    const minutesFromAgendaStart = (startDecimal - startHour) * 60;
    const top = minutesFromAgendaStart * pixelsPerMinute;
    const height = durationDecimal * 60 * pixelsPerMinute;
    return { top: `${top}px`, height: `${height}px` };
  };

  const calculatePopoverPosition = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const startDecimal = hour + minute / 60;
    const pixelsPerMinute = ROW_HEIGHT / slotDurationMinutes;
    const minutesFromAgendaStart = (startDecimal - startHour) * 60;
    const top = minutesFromAgendaStart * pixelsPerMinute;

    return { top: `${top}px`, height: `${ROW_HEIGHT}px` };
  }

  const currentTimeTop = useMemo(() => {
    if (!currentTime || !date || !isToday(date) || startHour === undefined) return -1;
    const totalMinutesNow = currentTime.getHours() * 60 + currentTime.getMinutes();
    const totalMinutesStart = startHour * 60;
    if (totalMinutesNow < totalMinutesStart || totalMinutesNow > endHour * 60) return -1;

    const elapsedMinutes = totalMinutesNow - totalMinutesStart;
    const pixelsPerMinute = ROW_HEIGHT / slotDurationMinutes;
    return elapsedMinutes * pixelsPerMinute;
  }, [currentTime, date, startHour, endHour, slotDurationMinutes]);


  const formatHour = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const getDaySchedule = (barber: Profesional): ScheduleDay | null => {
    if (!date || !barber.schedule) return null;
    const dayOfWeek = format(date, 'eeee', { locale: es })
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Remove accents
    return barber.schedule[dayOfWeek as keyof typeof barber.schedule];
  };

  const selectedDateFormatted = date
    ? format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
    : 'Cargando...';

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  const getProfessionalAvatar = (profesional: Profesional): string | undefined => {
    return profesional.avatarUrl;
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col md:grid md:grid-cols-[288px_1fr] h-[calc(100vh-4rem)] bg-muted/40 gap-2">
        {/* Left Panel */}
        <aside className="bg-white border-r flex flex-col flex-shrink-0">
          <div className="p-4 space-y-4">
            {user?.role === 'Administrador general' && (
              <div className="space-y-2">
                <Label htmlFor="branch-select">Sucursal</Label>
                <Select value={selectedLocalId || ''} onValueChange={setSelectedLocalId} disabled={!!user?.local_id}>
                  <SelectTrigger id="branch-select">
                    <SelectValue placeholder="Seleccionar sucursal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map(local => (
                      <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="professional-select">Profesional</Label>
              <Select value={selectedProfessionalFilter} onValueChange={setSelectedProfessionalFilter}>
                <SelectTrigger id="professional-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {professionals.filter(p => !p.deleted).map(prof => (
                    <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isClientMounted && (
            <div className="hidden md:flex justify-center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border mx-4"
                locale={es}
              />
            </div>
          )}
          <div className="mt-8 p-4 hidden md:flex justify-center">
            {empresaLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : logoUrl ? (
              <Image src={logoUrl} alt="Logo de la empresa" width={250} height={200} className="object-contain" />
            ) : null}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
          {/* Agenda Header */}
          <div className="flex-shrink-0 flex items-center justify-between gap-4 p-4 border-b">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={handleSetToday}>Hoy</Button>
              <div className='flex items-center gap-2'>
                <Button variant="ghost" size="icon" onClick={handlePrevDay}><ChevronLeft className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon" onClick={handleNextDay}><ChevronRight className="h-5 w-5" /></Button>
              </div>
              <div>
                <h2 className="text-xl font-semibold capitalize">{selectedDateFormatted}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Store className='w-4 h-4' /> {selectedLocal?.name || 'Cargando...'}
                </p>
              </div>
            </div>
          </div>

          {/* Esta es la linea que genera el scroll vertical */}
          <div className="flex-grow overflow-auto">
            {/* Professional Headers */}
            <div className="sticky top-0 z-20 grid gap-2 bg-background" style={{ gridTemplateColumns: `96px repeat(${filteredProfessionals.length}, minmax(200px, 1fr))` }}>
              <div className="sticky left-0 bg-background z-30">
                <div className="h-28 flex items-center justify-center p-2 border-b">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon"><Clock className="h-5 w-5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {[5, 10, 15, 30, 40, 45, 60].map(min => (
                        <DropdownMenuItem key={min} onSelect={() => setSlotDurationMinutes(min)}>
                          {min} minutos
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {filteredProfessionals.map(barber => (
                <div key={barber.id} className="p-2 h-28 flex flex-col items-center justify-center border-b">
                  <Link href={`/agenda/semanal/${barber.id}`} className="flex flex-col items-center justify-center cursor-pointer group">
                    <Avatar className="h-[60px] w-[60px] group-hover:ring-2 group-hover:ring-primary transition-all">
                      <AvatarImage src={getProfessionalAvatar(barber)} alt={barber.name} />
                      <AvatarFallback>{barber.name ? barber.name.substring(0, 2) : '??'}</AvatarFallback>
                    </Avatar>
                    <p className="font-semibold text-sm text-center mt-2 group-hover:text-primary transition-colors">{barber.name}</p>
                  </Link>
                </div>
              ))}
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: `96px repeat(${filteredProfessionals.length}, minmax(200px, 1fr))` }}>
              {/* Time Column */}
              <div className="flex-shrink-0 sticky left-0 z-10 bg-white">
                <div className="flex flex-col">
                  {timeSlots.slice(0, -1).map((time, index) => (
                    <div key={index} style={{ height: `${ROW_HEIGHT}px` }} className="border-b flex items-center justify-center text-center">
                      <span className="text-xs text-muted-foreground font-semibold">{time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid Cells */}
              {filteredProfessionals.map((barber) => {
                const daySchedule = getDaySchedule(barber);
                const isWorking = daySchedule && daySchedule.enabled;

                let barberStartHour = startHour;
                let barberEndHour = endHour;
                if (isWorking) {
                  const [startH, startM] = daySchedule.start.split(':').map(Number);
                  const [endH, endM] = daySchedule.end.split(':').map(Number);
                  barberStartHour = startH + (startM / 60);
                  barberEndHour = endH + (endM / 60);
                }

                const pixelsPerMinute = ROW_HEIGHT / slotDurationMinutes;

                // Get Available Blocks for this barber
                const availableIntervals = eventsWithLayout
                  .filter(e => e.type === 'block' && e.originalType === 'available' && e.barbero_id === barber.id)
                  .map(e => ({ start: e.start, end: e.end }));

                // 1. Pre-Shift
                let preShiftSegments: { start: number, end: number }[] = [];
                if (isWorking && barberStartHour > startHour) {
                  preShiftSegments = subtractIntervals({ start: startHour, end: barberStartHour }, availableIntervals);
                }

                // 2. Post-Shift
                let postShiftSegments: { start: number, end: number }[] = [];
                if (isWorking && barberEndHour < endHour) {
                  postShiftSegments = subtractIntervals({ start: barberEndHour, end: endHour }, availableIntervals);
                }

                // 3. Non-Working Day
                let nonWorkingSegments: { start: number, end: number }[] = [];
                if (!isWorking) {
                  nonWorkingSegments = subtractIntervals({ start: startHour, end: endHour }, availableIntervals);
                }

                // 4. Breaks
                const breakSegments = (isWorking && daySchedule?.breaks) ? daySchedule.breaks.flatMap((brk: any) => {
                  const [sH, sM] = brk.start.split(':').map(Number);
                  const [eH, eM] = brk.end.split(':').map(Number);
                  return subtractIntervals({ start: sH + sM / 60, end: eH + eM / 60 }, availableIntervals);
                }) : [];

                return (
                  <div key={barber.id} className="relative">
                    <div
                      className="relative h-full"
                      ref={(el: HTMLDivElement | null) => { gridRefs.current[barber.id] = el; }}
                      onMouseMove={(e) => isWorking && handleMouseMove(e, barber.id)}
                      onMouseLeave={handleMouseLeave}
                      onClick={(e) => isWorking && handleClickSlot(e)}
                    >
                      {/* Background Grid Cells */}
                      <div className="flex flex-col">
                        {timeSlots.slice(0, -1).map((time, index) => (
                          <div key={index} style={{ height: `${ROW_HEIGHT}px` }} className="bg-white border-b" />
                        ))}
                      </div>
                      {currentTimeTop > -1 && <div className="absolute w-full h-0.5 bg-red-500 z-20" style={{ top: `${currentTimeTop}px` }}></div>}

                      {nonWorkingSegments.map((seg, i) => {
                        const minutesFromStart = (seg.start - startHour) * 60;
                        const top = minutesFromStart * pixelsPerMinute;
                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                        return (
                          <NonWorkBlock
                            key={`nw-${i}`}
                            top={top}
                            height={height}
                            text="Día no laboral"
                            onClick={(e) => handleNonWorkClick(e, barber.id)}
                          />
                        );
                      })}

                      {/* Working Day Limits (Before Start / After End) */}
                      {preShiftSegments.map((seg, i) => {
                        const minutesFromStart = (seg.start - startHour) * 60;
                        const top = minutesFromStart * pixelsPerMinute;
                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                        return (
                          <NonWorkBlock
                            key={`pre-${i}`}
                            top={top}
                            height={height}
                            text="No disponible"
                            onClick={(e) => handleNonWorkClick(e, barber.id)}
                          />
                        );
                      })}

                      {postShiftSegments.map((seg, i) => {
                        const minutesFromStart = (seg.start - startHour) * 60;
                        const top = minutesFromStart * pixelsPerMinute;
                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                        return (
                          <NonWorkBlock
                            key={`post-${i}`}
                            top={top}
                            height={height}
                            text="No disponible"
                            onClick={(e) => handleNonWorkClick(e, barber.id)}
                          />
                        );
                      })}

                      {/* Breaks */}
                      {breakSegments.map((seg, i) => {
                        const minutesFromStart = (seg.start - startHour) * 60;
                        const top = minutesFromStart * pixelsPerMinute;
                        const height = (seg.end - seg.start) * 60 * pixelsPerMinute;
                        return (
                          <NonWorkBlock
                            key={`break-${i}`}
                            top={top}
                            height={height}
                            text="Descanso"
                            onClick={(e) => handleNonWorkClick(e, barber.id)}
                          />
                        );
                      })}

                      {/* Hover Popover */}
                      {isWorking && hoveredSlot?.barberId === barber.id && (
                        <div
                          className="absolute w-full p-2 rounded-lg bg-primary/10 border border-primary/50 pointer-events-none transition-all duration-75 z-20"
                          style={{ ...calculatePopoverPosition(hoveredSlot.time) }}
                        >
                          <p className="text-xs font-bold text-primary flex items-center">
                            <Plus className="w-3 h-3 mr-1" />
                            {hoveredSlot.time}
                          </p>
                        </div>
                      )}

                      {/* Click Popover */}
                      {isWorking && popoverState?.barberId === barber.id && (
                        <div
                          className="absolute w-[calc(100%_+_16px)] -ml-2 z-30"
                          style={{ top: calculatePopoverPosition(popoverState.time).top }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseEnter={() => {
                            if (popoverTimeoutRef.current) {
                              clearTimeout(popoverTimeoutRef.current);
                              popoverTimeoutRef.current = null;
                            }
                          }}
                          onMouseMove={(e) => {
                            e.stopPropagation();
                            if (popoverTimeoutRef.current) {
                              clearTimeout(popoverTimeoutRef.current);
                              popoverTimeoutRef.current = null;
                            }
                          }}
                        >
                          <Card className="shadow-lg border-primary">
                            <CardContent className="p-2 space-y-1">
                              <Button variant="ghost" className="w-full justify-start h-8" onClick={handleOpenReservationModal}><Plus className="w-4 h-4 mr-2" /> Agregar Reserva</Button>
                              <Button variant="ghost" className="w-full justify-start h-8" onClick={handleOpenBlockModal}><Lock className="w-4 h-4 mr-2" /> Bloquear horario</Button>
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Events */}
                      {eventsWithLayout
                        .filter(event => (event.type === 'block' && event.barbero_id === barber.id) || (event.type === 'appointment' && event.items?.some((i: SaleItem) => i.barbero_id === barber.id)))
                        .map((event: AgendaEvent) => (
                          <Tooltip key={event.id}>
                            <TooltipTrigger asChild>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (event.type === 'appointment') {
                                    handleOpenDetailModal(event);
                                  } else if (event.type === 'block') {
                                    if (event.originalType === 'available') {
                                      // Normal click on available block => Create Reservation
                                      setReservationInitialData({
                                        barbero_id: event.barbero_id,
                                        fecha: date,
                                        hora_inicio: formatHour(event.start),
                                        local_id: selectedLocalId,
                                      });
                                      setIsReservationModalOpen(true);
                                    } else {
                                      // Normal click on blockage => Confirm delete
                                      setBlockToDelete(event);
                                    }
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  // Right click to manage/delete any block (including available ones)
                                  if (event.type === 'block') {
                                    setBlockToDelete(event);
                                  }
                                }}
                                className={cn("absolute rounded-lg border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex items-center justify-between text-left p-2 z-10 overflow-hidden cursor-pointer select-none", event.color)}
                                style={{ ...calculatePosition(event.start, event.duration), width: `calc(${event.layout.width}% - 2px)`, left: `${event.layout.left}%` }}
                              >
                                <div className="flex-grow overflow-hidden pr-1">
                                  <p className="font-bold text-xs truncate leading-tight">{event.type === 'appointment' ? (event.customer?.nombre || 'Cliente Eliminado') : event.motivo}</p>
                                </div>

                                {(event.type === 'appointment') && (
                                  <div className="absolute top-0 right-0 h-full flex">
                                    {/* Product Indicator (Blue) - Left of A */}
                                    {event.items?.some((i: SaleItem) => i.tipo === 'producto') && (
                                      <div className="h-full px-1 flex items-center justify-center bg-blue-600">
                                        <span className="text-white font-bold text-[10px]">P</span>
                                      </div>
                                    )}

                                    {/* Payment Status Indicator (A/$) - Right */}
                                    {(event.pago_estado === 'Pagado' || event.pago_estado === 'deposit_paid') && (
                                      <div className={cn(
                                        "h-full px-1 flex items-center justify-center min-w-[20px]",
                                        event.pago_estado === 'Pagado' ? 'bg-green-500' : 'bg-orange-500'
                                      )}>
                                        {event.pago_estado === 'deposit_paid' ? (
                                          <span className="text-black font-bold text-[10px]">A</span>
                                        ) : (
                                          <DollarSign className="h-3 w-3 text-black font-bold" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className={cn("absolute top-0 h-full flex items-center gap-0.5", (event.type === 'appointment' && (event.pago_estado === 'Pagado' || event.pago_estado === 'deposit_paid')) ? "right-12" : "right-1")}>
                                  {event.type === 'appointment' && (
                                    <div className="flex items-center gap-0.5 h-full px-1">
                                      {(event.canal_reserva?.startsWith('web_publica') || event.origen?.startsWith('web_publica')) && (
                                        <Globe className="w-3.5 h-3.5 text-primary" />
                                      )}
                                      {((event.professional_lock === true) || (event.professional_lock === undefined && (event.canal_reserva?.startsWith('web_publica') || event.origen?.startsWith('web_publica')))) && (
                                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TooltipTrigger>
                            {event.type === 'appointment' ? (
                              <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border">
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start">
                                    <p className="font-bold text-base text-foreground">{(event.customer?.nombre || 'Cliente Eliminado')}</p>
                                    {(event.canal_reserva?.startsWith('web_publica') || event.origen?.startsWith('web_publica')) && <Badge variant="secondary" className="text-[10px] h-5 px-1"><Globe className="w-3 h-3 mr-1" /> Web</Badge>}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{event.items ? event.items.map(i => i.nombre || i.servicio).join(', ') : event.servicio}</p>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Clock className="w-4 h-4" />
                                    <span>{formatHour(event.start)} - {formatHour(event.end)}</span>
                                  </div>
                                  {event.pago_estado &&
                                    <div className="flex items-center gap-2 text-sm">
                                      {event.pago_estado === 'deposit_paid' ? (
                                        <span className="font-bold text-orange-500">A</span>
                                      ) : (
                                        <DollarSign className={cn("w-4 h-4", event.pago_estado === 'deposit_paid' ? 'text-orange-500' : 'text-green-600')} />
                                      )}
                                      <span className={cn(
                                        event.pago_estado === 'Pagado' ? 'text-green-600' :
                                          event.pago_estado === 'deposit_paid' ? 'text-orange-600 font-medium' :
                                            'text-yellow-600'
                                      )}>
                                        {event.pago_estado === 'Pagado' ? 'Pago completo' :
                                          event.pago_estado === 'deposit_paid' ? 'Anticipo pagado' :
                                            'Pago pendiente'}
                                      </span>
                                    </div>
                                  }
                                </div>
                              </TooltipContent>
                            ) : (
                              <TooltipContent><p>Horario Bloqueado: {event.motivo}</p></TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <NewReservationForm
        isOpen={isReservationModalOpen}
        onOpenChange={setIsReservationModalOpen}
        isDialogChild={false}
        onFormSubmit={onDataRefresh}
        initialData={reservationInitialData}
        isEditMode={!!reservationInitialData?.id}
      />

      <BlockScheduleForm
        isOpen={isBlockScheduleModalOpen}
        onOpenChange={setIsBlockScheduleModalOpen}
        onFormSubmit={onDataRefresh}
        initialData={blockInitialData}
      />

      {selectedReservation && (
        <ReservationDetailModal
          reservation={selectedReservation}
          isOpen={isDetailModalOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) setSelectedReservation(null);
            setIsDetailModalOpen(isOpen);
          }}
          onPay={handlePayFromDetail}
          onUpdateStatus={handleUpdateStatus}
          onEdit={canSee('editar_reservas') ? handleEditFromDetail : undefined}
        />
      )}

      <NewSaleSheet
        isOpen={isSaleSheetOpen}
        onOpenChange={setIsSaleSheetOpen}
        initialData={saleInitialData}
        onSaleComplete={onDataRefresh}
      />

      <CancelReservationModal
        isOpen={!!reservationToCancel}
        onOpenChange={() => setReservationToCancel(null)}
        reservation={reservationToCancel}
        onConfirm={handleCancelReservation}
      />

      {blockToDelete && (
        <AlertDialog open={!!blockToDelete} onOpenChange={() => setBlockToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {(blockToDelete as any).originalType === 'available' ? '¿Deshabilitar Horario Especial?' : '¿Desbloquear Horario?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {(blockToDelete as any).originalType === 'available'
                  ? `Se eliminará el horario habilitado especial. El profesional volverá a tener este horario bloqueado según su configuración.`
                  : `Se eliminará el bloqueo "${blockToDelete.motivo}" de la agenda de este profesional. ¿Estás seguro?`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteBlock}>
                {(blockToDelete as any).originalType === 'available' ? 'Sí, deshabilitar' : 'Sí, desbloquear'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <EnableScheduleModal
        isOpen={isEnableScheduleModalOpen}
        onOpenChange={setIsEnableScheduleModalOpen}
        onFormSubmit={onDataRefresh}
        initialData={enableScheduleInitialData}
      />
    </TooltipProvider>
  );
}

