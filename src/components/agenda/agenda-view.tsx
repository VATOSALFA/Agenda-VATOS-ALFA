

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
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, Eye, Plus, Lock, Pencil, Mail, User, Circle, Trash2, Loader2, Globe, PanelLeftClose, PanelLeftOpen, Cast, HelpCircle } from 'lucide-react';
import { format, addMinutes, subDays, isToday, parse, getHours, getMinutes, set, getDay, addDays as dateFnsAddDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useRouter } from 'next/navigation';
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
import type { Profesional, Client, Service as ServiceType, ScheduleDay, Reservation, Local, TimeBlock, SaleItem, User as AppUser, Product, AgendaEvent, AgendaLayout } from '@/lib/types';

import { useAgendaEvents } from './use-agenda-events';
import { getStatusColor } from './agenda-utils';

import { EnableScheduleModal } from '../reservations/enable-schedule-modal';
import { ClientDetailModal } from '../clients/client-detail-modal';
import { DndContext, closestCenter, PointerSensor, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { writeBatch } from 'firebase/firestore';

function SortableHeader({ barber, avatarUrl }: { barber: Profesional, avatarUrl: string | undefined }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: barber.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
    backgroundColor: isDragging ? 'hsl(var(--background))' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-2 h-28 flex flex-col items-center justify-center border-b select-none cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => {
        // dnd-kit should prevent this click if a drag occurred.
        // If the event fires, it means it was a click.
        router.push(`/agenda/semanal/${barber.id}`);
      }}
    >
      <div className="flex flex-col items-center justify-center group w-full h-full">
        <Avatar className="h-[60px] w-[60px] rounded-lg group-hover:ring-2 group-hover:ring-primary transition-all pointer-events-none">
          <AvatarImage src={avatarUrl} alt={barber.name} />
          <AvatarFallback className="rounded-lg">{barber.name ? barber.name.substring(0, 2) : '??'}</AvatarFallback>
        </Avatar>
        <p className="font-semibold text-sm text-center mt-2 group-hover:text-primary transition-colors">{barber.name}</p>
      </div>
    </div>
  );
}

interface EmpresaSettings {
  receipt_logo_url?: string;
}




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
    className={cn("absolute w-full bg-gray-100 flex items-center justify-center p-2 z-0", onClick && "cursor-pointer hover:bg-gray-200/50 transition-colors")}
    style={{ top: `${top}px`, height: `${height}px` }}
    onClick={onClick}
  >
    <p className="text-xs text-center font-medium text-gray-500">{text}</p>
  </div>
);




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

  // New State for Client Detail
  const [isClientDetailModalOpen, setIsClientDetailModalOpen] = useState(false);
  const [selectedClientForModal, setSelectedClientForModal] = useState<Client | null>(null);

  // Sidebar collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  async function handleHeaderDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      // We deal with filteredProfessionals, but we must update the global order if we want consistency?
      // Actually, we just need to reorder the professionals in the current view and save their new indices.
      // However, filteredProfessionals might be a subset. If 'todos' is selected, it's all visible professionals of this local.
      // We should treat the visible list as the authoritative list for this local's order.
      const oldIndex = filteredProfessionals.findIndex(p => p.id === active.id);
      const newIndex = filteredProfessionals.findIndex(p => p.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Optimistic update? We can't easily set filteredProfessionals directly as it is a memo.
        // But we can update the Firestore docs.
        // To see immediate effect we might need local state, but let's rely on Firestore subscription for now or force update?
        // Since it's a memo, we can't set it. But updating DB triggers snapshot update.
        // To make it smooth, we might want to wait for DB.

        // Create new order array locally to calculate indices
        const newOrderArray = arrayMove(filteredProfessionals, oldIndex, newIndex);

        if (!db) return;
        const batch = writeBatch(db);
        newOrderArray.forEach((prof, index) => {
          const profRef = doc(db, 'profesionales', prof.id);
          batch.update(profRef, { order: index });
        });
        await batch.commit();
        toast({ title: "Orden actualizado" });
      }
    }
  }
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

  const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>('reservas', reservationsQueryKey, ...(reservationsQueryConstraint || []));
  const { data: timeBlocks, loading: timeBlocksLoading } = useFirestoreQuery<TimeBlock>('bloqueos_horario', blocksQueryKey, ...(reservationsQueryConstraint || []));

  // Determine if we are in a 'critical' loading state (initial load or date change)
  // We exclude some non-critical loads if we want optimistic UI, but for now we block to prevent empty grid.
  const isLoading = professionalsLoading || localesLoading || reservationsLoading || timeBlocksLoading;

  // Non-blocking background loads (optional to block)
  // clientsLoading, usersLoading, productsLoading might take longer but don't prevent rendering the grid structure.

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
      return professionalsOfLocal.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return professionalsOfLocal.filter(p => p.id === selectedProfessionalFilter);
  }, [professionals, selectedProfessionalFilter, selectedLocalId, user]);

  const { allEvents, eventsWithLayout } = useAgendaEvents(reservations, timeBlocks, clients, professionals);




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
        const slotTimeDecimal = slotH + slotM / 60;

        const isBreak = daySchedule.breaks.some((brk: any) => {
          const [sH, sM] = brk.start.split(':').map(Number);
          const [eH, eM] = brk.end.split(':').map(Number);
          const breakStart = sH * 60 + sM;
          const breakEnd = eH * 60 + eM;

          // Intersection check
          return (slotTime < breakEnd && slotEnd > breakStart);
        });

        // Check if this break slot is unlocked by an 'available' block
        const isUnlocked = allEvents.some(evt =>
          evt.barbero_id === barberId &&
          evt.type === 'block' &&
          (evt as any).originalType === 'available' &&
          evt.start <= slotTimeDecimal &&
          evt.end > slotTimeDecimal
        );

        if (isBreak && !isUnlocked) {
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

  const handleDeleteUnlockedBlock = () => {
    if (!popoverState || !allEvents) return;

    // Find the available block at this time
    const [h, m] = popoverState.time.split(':').map(Number);
    const timeDecimal = h + m / 60;

    const block = allEvents.find(evt =>
      evt.barbero_id === popoverState.barberId &&
      evt.type === 'block' &&
      (evt as any).originalType === 'available' &&
      evt.start <= timeDecimal &&
      evt.end > timeDecimal
    );

    if (block) {
      setBlockToDelete(block as unknown as TimeBlock);
      setPopoverState(null);
    }
  }

  // End of handlers injection, now finding a way to inject popover logic changes without breaking file
  // Wait, I can't inject handleDeleteUnlockedBlock easily because it's in the middle of functions.
  // I will just return the original handleMouseMove (updated) and remaining functions up to handleOpenBlockModal
  // And THEN insert handleDeleteUnlockedBlock? No, the tool replaces CONTIGUOUS block.
  // I have to stick to the StartLine/EndLine logic.

  // The provided StartLine is 529. The EndLine is 1097. That's HUGE.
  // I should narrow down.
  // Step 1: Replace handleMouseMove (lines 529-577 approx)
  // Step 2: Insert handleDeleteUnlockedBlock somewhere (maybe before return?)
  // Step 3: Replace Popover JSX (lines 1071-1097)

  // This tool call is trying to do too much at once. I will split it.



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
            ...product, // Contains original product data
            // We overwrite with specific sale item details
            id: product.id,
            nombre: product.nombre,
            precio: product.public_price,
            cantidad: item.cantidad,
            tipo: 'producto' as const,
            commissionPaid: (item as any).commissionPaid // Preserve commission status
          } : null;
        } else {
          // Default to service
          const service = services.find(s => s.name === item.servicio || s.id === (item as any).id);
          return service ? {
            ...service, // Contains original service data
            // We overwrite with specific sale item details
            id: service.id,
            nombre: service.name,
            precio: service.price,
            cantidad: 1,
            tipo: 'servicio' as const,
            barbero_id: item.barbero_id,
            commissionPaid: (item as any).commissionPaid // Preserve commission status
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

  const handleViewClientFile = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setSelectedClientForModal(client);
      setIsClientDetailModalOpen(true);
      setIsDetailModalOpen(false);
    } else {
      toast({ variant: "destructive", title: "Error", description: "No se encontró la información del cliente." });
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

  if (isLoading || !isClientMounted) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center gap-4 bg-muted/40">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium animate-pulse">Cargando agenda...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col md:grid h-[calc(100vh-4rem)] bg-muted/40 gap-2 overflow-hidden", isSidebarCollapsed ? 'md:grid-cols-[0px_1fr]' : 'md:grid-cols-[288px_1fr]')} style={{ transition: 'grid-template-columns 0.3s ease' }}>
        {/* Left Panel */}
        <aside className={cn("bg-white border-r flex flex-col flex-shrink-0 min-h-0 overflow-y-auto scrollbar-thin transition-all duration-300", isSidebarCollapsed && 'hidden md:flex md:w-0 md:overflow-hidden md:p-0 md:opacity-0')}>
          <div className="p-4 space-y-2">
            {user?.role === 'Administrador general' && (
              <div className="flex items-center gap-2">
                <Label htmlFor="branch-select" className="text-xs flex-shrink-0">Sucursal</Label>
                <Select value={selectedLocalId || ''} onValueChange={setSelectedLocalId} disabled={!!user?.local_id}>
                  <SelectTrigger id="branch-select" className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map(local => (
                      <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label htmlFor="professional-select" className="text-xs flex-shrink-0">Profesional</Label>
              <Select value={selectedProfessionalFilter} onValueChange={setSelectedProfessionalFilter}>
                <SelectTrigger id="professional-select" className="h-8 text-xs">
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
          <div className="mt-4 p-4 hidden md:flex justify-center">
            {empresaLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : logoUrl ? (
              <Image src={logoUrl} alt="Logo de la empresa" width={250} height={200} className="object-contain" />
            ) : null}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-background min-h-0 overflow-hidden">
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
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <HelpCircle className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-sm">Guía de la agenda</h4>
                    <p className="text-xs text-muted-foreground">Significado de colores e íconos</p>
                  </div>
                  <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
                    {/* Status Colors */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Estados</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-blue-300/80 border-l-[3px] border-blue-500 flex-shrink-0" />
                          <span className="text-sm">Reservado</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-yellow-300/80 border-l-[3px] border-yellow-500 flex-shrink-0" />
                          <span className="text-sm">Confirmado</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-green-300/80 border-l-[3px] border-green-500 flex-shrink-0" />
                          <span className="text-sm">En espera</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-pink-300/80 border-l-[3px] border-pink-500 flex-shrink-0" />
                          <span className="text-sm">Asiste</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-orange-300/80 border-l-[3px] border-orange-500 flex-shrink-0" />
                          <span className="text-sm">No asiste</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-red-300/80 border-l-[3px] border-red-500 flex-shrink-0" />
                          <span className="text-sm">Pendiente de pago</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gray-300/80 border-l-[3px] border-gray-500 flex-shrink-0 line-through" />
                          <span className="text-sm">Cancelado</span>
                        </div>
                      </div>
                    </div>
                    {/* Icons */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Íconos</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center flex-shrink-0">
                            <DollarSign className="w-3.5 h-3.5 text-black" />
                          </div>
                          <span className="text-sm">Pago completo</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded bg-orange-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-black font-bold text-[10px]">A</span>
                          </div>
                          <span className="text-sm">Anticipo pagado</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-[10px]">P</span>
                          </div>
                          <span className="text-sm">Incluye producto</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Globe className="w-5 h-5 text-primary flex-shrink-0" />
                          <span className="text-sm">Reserva desde la web pública</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm">Profesional fijo (no reasignable)</span>
                        </div>
                      </div>
                    </div>
                    {/* Other indicators */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Otros</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-0.5 bg-red-500 flex-shrink-0 rounded" />
                          <span className="text-sm">Hora actual</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded bg-striped-gray border border-gray-400 flex-shrink-0" />
                          <span className="text-sm">Horario bloqueado</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => window.open('/agenda/display', '_blank')} className="hidden md:flex">
                    <Cast className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Transmitir agenda en pantalla</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="hidden md:flex">
                    {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isSidebarCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Esta es la linea que genera el scroll vertical */}
          <div className="flex-grow overflow-auto">
            {/* Professional Headers */}
            <div className="sticky top-0 z-40 grid gap-2 bg-background" style={{ gridTemplateColumns: `64px repeat(${filteredProfessionals.length}, minmax(200px, 1fr))` }}>
              <div className="sticky left-0 bg-background z-50">
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleHeaderDragEnd}>
                <SortableContext items={filteredProfessionals} strategy={horizontalListSortingStrategy}>
                  {filteredProfessionals.map(barber => (
                    <SortableHeader key={barber.id} barber={barber} avatarUrl={getProfessionalAvatar(barber)} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            <div className="grid gap-2 pb-8" style={{ gridTemplateColumns: `64px repeat(${filteredProfessionals.length}, minmax(200px, 1fr))` }}>
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
                              {allEvents.some(evt =>
                                evt.barbero_id === barber.id &&
                                evt.type === 'block' &&
                                (evt as any).originalType === 'available' &&
                                evt.start <= (parseInt(popoverState.time.split(':')[0]) + parseInt(popoverState.time.split(':')[1]) / 60) &&
                                evt.end > (parseInt(popoverState.time.split(':')[0]) + parseInt(popoverState.time.split(':')[1]) / 60)
                              ) ? (
                                <Button variant="ghost" className="w-full justify-start h-8 text-destructive hover:text-destructive" onClick={handleDeleteUnlockedBlock}>
                                  <Trash2 className="w-4 h-4 mr-2" /> Eliminar Horario
                                </Button>
                              ) : (
                                <Button variant="ghost" className="w-full justify-start h-8" onClick={handleOpenBlockModal}><Lock className="w-4 h-4 mr-2" /> Bloquear horario</Button>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Events */}
                      {eventsWithLayout
                        .filter(event =>
                          ((event.type === 'block' && event.barbero_id === barber.id) ||
                            (event.type === 'appointment' && event.items?.some((i: SaleItem) => i.barbero_id === barber.id))) &&
                          (event as any).originalType !== 'available'
                        )
                        .map((event: AgendaEvent) => (
                          <Tooltip key={event.id}>
                            <TooltipTrigger asChild>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (event.type === 'appointment') {
                                    handleOpenDetailModal(event);
                                  } else if (event.type === 'block') {
                                    setBlockToDelete(event);
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (event.type === 'block') {
                                    setBlockToDelete(event);
                                  }
                                }}
                                className={cn(
                                  "absolute rounded-lg border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex items-center justify-between text-left p-2 overflow-hidden cursor-pointer select-none",
                                  event.color,
                                  event.type === 'appointment' ? 'z-20' : 'z-10'
                                )}
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

      {
        selectedReservation && (
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
            onClientClick={handleViewClientFile}
          />
        )
      }

      {selectedClientForModal && (
        <ClientDetailModal
          client={selectedClientForModal}
          isOpen={isClientDetailModalOpen}
          onOpenChange={setIsClientDetailModalOpen}
          onNewReservation={() => {
            setIsClientDetailModalOpen(false);
            setReservationInitialData({
              fecha: date || new Date(),
              hora_inicio: '10:00',
              local_id: selectedLocalId,
              cliente_id: selectedClientForModal.id
            });
            setIsReservationModalOpen(true);
          }}
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

      {
        blockToDelete && (
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
        )
      }
      <EnableScheduleModal
        isOpen={isEnableScheduleModalOpen}
        onOpenChange={setIsEnableScheduleModalOpen}
        onFormSubmit={onDataRefresh}
        initialData={enableScheduleInitialData}
      />
    </TooltipProvider >
  );
}

