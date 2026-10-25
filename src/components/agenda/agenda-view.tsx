

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
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, Eye, Plus, Lock, Pencil, Mail, User, Circle, Trash2, Loader2, Globe, Bot, Smartphone, PanelLeftClose, PanelLeftOpen, Cast, HelpCircle, CalendarDays, Zap, CheckCircle2, MoreVertical, ShieldCheck, BookOpen, Hourglass, QrCode } from 'lucide-react';
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



import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '../ui/skeleton';
import { where, doc, updateDoc, deleteDoc, runTransaction, increment, getDoc, setDoc, Timestamp, collection, query, getDocs, documentId, deleteField } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { Label } from '../ui/label';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';
import Image from 'next/image';
import type { Profesional, Client, Service as ServiceType, ScheduleDay, Reservation, Local, TimeBlock, SaleItem, User as AppUser, Product, AgendaEvent, AgendaLayout } from '@/lib/types';

import { useAgendaEvents } from './use-agenda-events';
import { getStatusColor, formatClientName } from './agenda-utils';
import { QuickConsultModal } from './quick-consult-modal';
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';
import { ReservationDetailModal } from '../reservations/reservation-detail-modal';
import { CancelReservationModal } from '../reservations/cancel-reservation-modal';
import { EnableScheduleModal } from '../reservations/enable-schedule-modal';
import { ClientDetailModal } from '../clients/client-detail-modal';
import { logAuditAction } from '@/lib/audit-logger';
import { OverdueNotificationsPopover } from './overdue-notifications-popover';
import { BookingRulesCheatSheetModal } from './booking-rules-cheat-sheet-modal';
import { playAgendaClickSound } from '@/lib/notification-sound';
import { isExpiredPendingDepositReservation } from '@/lib/booking-rules';
import { getNormalizedDayOfWeek, getEffectiveBarberDaySchedule } from '@/lib/scheduling/schedule-engine';
import { checkAndSendPendingChatReminders } from '@/lib/actions/conversation-actions';



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
      className="p-1.5 h-[72px] flex flex-col items-center justify-center border-b select-none cursor-pointer hover:bg-muted/50 transition-colors bg-background"
      onClick={() => {
        playAgendaClickSound();
        // dnd-kit should prevent this click if a drag occurred.
        // If the event fires, it means it was a click.
        router.push(`/agenda/semanal/${barber.id}`);
      }}
    >
      <div className="relative w-[60px] h-[60px] rounded-xl overflow-hidden shadow-xs border border-border/60 group hover:ring-2 hover:ring-blue-500 transition-all flex items-center justify-center bg-muted/40 aspect-square">
        <Avatar className="w-full h-full rounded-none pointer-events-none">
          <AvatarImage src={avatarUrl} alt={barber.publicName || barber.name} className="object-cover w-full h-full" />
          <AvatarFallback className="rounded-none text-xs font-bold">{(barber.publicName || barber.name || '??').substring(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-3 pb-1 px-1 flex items-center justify-center pointer-events-none">
          <span className="text-white text-[11px] font-bold truncate drop-shadow-md text-center leading-tight tracking-tight max-w-full">
            {barber.publicName || barber.name}
          </span>
        </div>
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
    }, 15000); // Update every 15 seconds for responsive deposit expiration

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
  const [date, setDate] = useState<Date>(() => new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [hoveredBarberId, setHoveredBarberId] = useState<string | null>(null);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(60);
  const [selectedProfessionalFilter, setSelectedProfessionalFilter] = useState('todos');
  const { selectedLocalId, setSelectedLocalId } = useLocal();
  const { user, db, loading: authLoading } = useAuth();
  const isStaff = Boolean(user?.role && (user.role.toLowerCase().includes('staff') || user.role.toLowerCase().includes('barbero')));

  const [isLocalhost, setIsLocalhost] = useState(false);
  const [sandboxViewMode, setSandboxViewMode] = useState<'hybrid' | 'sandbox_only' | 'real_only'>('hybrid');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLocal = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.search.includes('sandbox=true') ||
                      window.location.search.includes('test=true');
      setIsLocalhost(isLocal);
      const savedMode = localStorage.getItem('vatos_agenda_sandbox_view_mode') as 'hybrid' | 'sandbox_only' | 'real_only';
      if (savedMode && ['hybrid', 'sandbox_only', 'real_only'].includes(savedMode)) {
        setSandboxViewMode(savedMode);
      }
    }
  }, []);

  const hoveredSlotRef = useRef<{ barberId: string, time: string } | null>(null);
  const hoverPopoverRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hoverPopoverTextRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  const updateHoveredSlot = (newSlot: { barberId: string, time: string } | null) => {
    // Hide old popover
    if (hoveredSlotRef.current && hoverPopoverRefs.current[hoveredSlotRef.current.barberId]) {
      const oldEl = hoverPopoverRefs.current[hoveredSlotRef.current.barberId];
      if (oldEl) oldEl.style.opacity = '0';
    }

    hoveredSlotRef.current = newSlot;

    // Show new popover
    if (newSlot && hoverPopoverRefs.current[newSlot.barberId]) {
      const el = hoverPopoverRefs.current[newSlot.barberId];
      const textEl = hoverPopoverTextRefs.current[newSlot.barberId];
      if (el) {
        const pos = calculatePopoverPosition(newSlot.time);
        el.style.top = pos.top as string;
        el.style.opacity = '1';
      }
      if (textEl) {
        textEl.textContent = newSlot.time;
      }
    }
  };
  const [popoverState, setPopoverState] = useState<{ barberId: string, time: string } | null>(null);

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<Reservation | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<TimeBlock | null>(null);

  // New State for Enable Schedule
  const [isEnableScheduleModalOpen, setIsEnableScheduleModalOpen] = useState(false);
  const [enableScheduleInitialData, setEnableScheduleInitialData] = useState<any>(null);

  // New State for Client Detail
  const [isClientDetailModalOpen, setIsClientDetailModalOpen] = useState(false);
  const [selectedClientForModal, setSelectedClientForModal] = useState<Client | null>(null);

  // Quick Consult Modal State
  const [isQuickConsultOpen, setIsQuickConsultOpen] = useState(false);

  // Automatic Janet Chat Reminder dispatcher when Agenda is open
  useEffect(() => {
    checkAndSendPendingChatReminders().catch(() => {});
    const reminderInterval = setInterval(() => {
      checkAndSendPendingChatReminders().catch(() => {});
    }, 60 * 1000);
    return () => clearInterval(reminderInterval);
  }, []);

  // Sidebar collapse state persisted per user preference
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedGlobal = localStorage.getItem('vatos_agenda_sidebar_collapsed');
      if (savedGlobal !== null) return savedGlobal === 'true';
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userKey = user?.uid ? `vatos_agenda_sidebar_collapsed_${user.uid}` : null;
    const savedUser = userKey ? localStorage.getItem(userKey) : null;
    const savedGlobal = localStorage.getItem('vatos_agenda_sidebar_collapsed');
    const resolved = savedUser ?? savedGlobal;
    if (resolved !== null) {
      setIsSidebarCollapsed(resolved === 'true');
    }
  }, [user?.uid]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('vatos_agenda_sidebar_collapsed', String(next));
        if (user?.uid) {
          localStorage.setItem(`vatos_agenda_sidebar_collapsed_${user.uid}`, String(next));
        }
      }
      return next;
    });
  }, [user?.uid]);

  const handleNonWorkClick = (e: MouseEvent<HTMLDivElement>, barberId: string) => {
    playAgendaClickSound();
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
      barberName: barber?.publicName || barber?.name,
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

  const [whatsappConfirmationAnimation, setWhatsappConfirmationAnimation] = useState(true);
  const [whatsappReminderAnimation, setWhatsappReminderAnimation] = useState(true);
  const [isBookingRulesModalOpen, setIsBookingRulesModalOpen] = useState(false);

  useEffect(() => {
    if (!db) return;
    const fetchSettings = async () => {
      try {
        const whatsappRef = doc(db, 'configuracion', 'whatsapp');
        const snap = await getDoc(whatsappRef);
        if (snap.exists()) {
          const data = snap.data();
          setWhatsappConfirmationAnimation(data.whatsappConfirmationAnimation ?? true);
          setWhatsappReminderAnimation(data.whatsappReminderAnimation ?? true);
        }
      } catch (e) {
        console.error("Error fetching whatsapp settings", e);
      }
    };
    fetchSettings();
  }, [db]);

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


  const { data: specialJourneys, loading: specialJourneysLoading } = useFirestoreQuery<any>('jornadas_especiales', `special-${date ? format(date, 'yyyy-MM-dd') : ''}-${selectedLocalId}-${queryKey}`, ...(date ? [where('fecha', '==', format(date, 'yyyy-MM-dd'))] : []));

  const reservationsQueryConstraint = useMemo(() => {
    const targetDate = date || new Date();
    if (!selectedLocalId) return undefined;
    return [
      where('fecha', '==', format(targetDate, 'yyyy-MM-dd')),
    ];
  }, [date, selectedLocalId]);

  const blocksQueryConstraint = useMemo(() => {
    const targetDate = date || new Date();
    if (!selectedLocalId) return undefined;
    return [
      where('fecha', '==', format(targetDate, 'yyyy-MM-dd')),
      where('local_id', '==', selectedLocalId)
    ];
  }, [date, selectedLocalId]);

  const reservationsQueryKey = useMemo(() => `reservations-${format(date || new Date(), 'yyyy-MM-dd')}-${selectedLocalId}-${queryKey}`, [date, selectedLocalId, queryKey]);
  const blocksQueryKey = useMemo(() => `blocks-${format(date || new Date(), 'yyyy-MM-dd')}-${selectedLocalId}-${queryKey}`, [date, selectedLocalId, queryKey]);

  const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>('reservas', reservationsQueryKey, ...(reservationsQueryConstraint || []));
  const { data: sandboxReservations, loading: sandboxReservationsLoading } = useFirestoreQuery<Reservation>(
    'reservas_sandbox',
    `sandbox-${reservationsQueryKey}`,
    ...(reservationsQueryConstraint || [])
  );
  const { data: timeBlocks, loading: timeBlocksLoading } = useFirestoreQuery<TimeBlock>('bloqueos_horario', blocksQueryKey, ...(blocksQueryConstraint || []));

  const { timeSlots, startHour, endHour } = useMemo(() => {
    if (!selectedLocal || !selectedLocal.schedule) {
      return { timeSlots: [], startHour: 10, endHour: 21 };
    }
    const targetDate = date || new Date();
    const dayOfWeek = getNormalizedDayOfWeek(targetDate);
    const daySchedule = selectedLocal.schedule[dayOfWeek as keyof typeof selectedLocal.schedule] || selectedLocal.schedule.lunes;

    let sH = 10, sM = 0, eH = 21, eM = 0;
    let anyEnabled = daySchedule?.enabled ?? false;

    if (daySchedule?.enabled && daySchedule?.start && daySchedule?.end) {
      [sH, sM] = daySchedule.start.split(':').map(Number);
      [eH, eM] = daySchedule.end.split(':').map(Number);
    }

    const expandBounds = (startStr?: string, endStr?: string) => {
      if (!startStr || !endStr) return;
      const [stH, stM] = startStr.split(':').map(Number);
      const [enH, enM] = endStr.split(':').map(Number);
      if (isNaN(stH) || isNaN(stM) || isNaN(enH) || isNaN(enM)) return;

      if (!anyEnabled) {
        sH = stH; sM = stM;
        eH = enH; eM = enM;
        anyEnabled = true;
      } else {
        if (stH < sH || (stH === sH && stM < sM)) {
          sH = stH; sM = stM;
        }
        if (enH > eH || (enH === eH && enM > eM)) {
          eH = enH; eM = enM;
        }
      }
    };

    // 1. Expand for Special Journeys ('jornadas_especiales' from Admin -> Profesionales)
    (specialJourneys || []).forEach(sj => {
      if (!sj.local_id || !selectedLocalId || sj.local_id === selectedLocalId) {
        expandBounds(sj.hora_inicio, sj.hora_fin);
      }
    });

    // 2. Expand for internal Special Schedules ('bloqueos_horario' with type === 'available' from Agenda)
    (timeBlocks || []).forEach(tb => {
      if ((tb as any).type === 'available') {
        expandBounds(tb.hora_inicio, tb.hora_fin);
      }
    });

    if (!anyEnabled) {
      return { timeSlots: [], startHour: 10, endHour: 21 };
    }

    const startTotalMins = sH * 60;
    const rawEndMins = eH * 60 + eM;
    const alignedEndMins = Math.min(
      24 * 60,
      Math.max(startTotalMins + slotDurationMinutes, Math.ceil(rawEndMins / slotDurationMinutes) * slotDurationMinutes)
    );

    const slots: string[] = [];
    for (let m = startTotalMins; m <= alignedEndMins; m += slotDurationMinutes) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }

    return { timeSlots: slots, startHour: sH, endHour: alignedEndMins / 60 };
  }, [date, selectedLocal, selectedLocalId, slotDurationMinutes, specialJourneys, timeBlocks]);

  // Fast on-demand batched client fetcher (loads only clients for current day's reservations)
  const [clientsMap, setClientsMap] = useState<Map<string, Client>>(new Map());
  const [clientsLoading, setClientsLoading] = useState(false);
  const fetchedClientIdsRef = useRef<Set<string>>(new Set());

  const normalizedRealReservations = useMemo(() => {
    const matchesSelectedLocal = (r: Reservation) => {
      if (!selectedLocalId) return true;
      const rLocal = (r as any).local_id || (r as any).sucursal_id || '';
      if (!rLocal || rLocal === selectedLocalId) return true;
      if (
        selectedLocalId === 'rkbEgvwP67JliXQ1Qeyj' &&
        (rLocal === 'sombrerete' || rLocal === 'cipreses')
      ) {
        return true;
      }
      return false;
    };

    return (reservations || [])
      .filter(matchesSelectedLocal)
      .map(r => {
        const isMobileUnpaidMarkedPaid =
          ((r as any).origen === 'app_movil' || (r as any).canal_reserva === 'app_movil') &&
          r.pago_estado === 'Pagado' &&
          Number(r.saldo_pendiente || 0) > 0 &&
          Number(r.anticipo_pagado || 0) === 0 &&
          !(r as any).cobrado_en &&
          !(r as any).paid_at;

        if (isMobileUnpaidMarkedPaid || (r as any).local_id === 'sombrerete') {
          return {
            ...r,
            local_id: selectedLocalId || 'rkbEgvwP67JliXQ1Qeyj',
            ...(isMobileUnpaidMarkedPaid ? { pago_estado: 'Pendiente' } : {}),
          };
        }
        return r;
      });
  }, [reservations, selectedLocalId]);

  // Auto-heal reservations created from mobile app with legacy branch slug 'sombrerete'
  const healedMobileIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!db || !reservations || reservations.length === 0) return;
    reservations.forEach(r => {
      if (!r?.id || healedMobileIdsRef.current.has(r.id)) return;
      const needsLocalFix = (r as any).local_id === 'sombrerete' || (r as any).local_id === 'cipreses';
      const needsPagoFix =
        ((r as any).origen === 'app_movil' || (r as any).canal_reserva === 'app_movil') &&
        r.pago_estado === 'Pagado' &&
        Number(r.saldo_pendiente || 0) > 0 &&
        Number(r.anticipo_pagado || 0) === 0 &&
        !(r as any).cobrado_en &&
        !(r as any).paid_at;

      if (needsLocalFix || needsPagoFix) {
        healedMobileIdsRef.current.add(r.id);
        const updates: Record<string, any> = {};
        if (needsLocalFix) updates.local_id = 'rkbEgvwP67JliXQ1Qeyj';
        if (needsPagoFix) updates.pago_estado = 'Pendiente';
        updateDoc(doc(db, 'reservas', r.id), updates).catch(() => {});
      }
    });
  }, [reservations, db]);

  const effectiveReservations = useMemo(() => {
    if (!isLocalhost) return normalizedRealReservations;

    const taggedSandbox = (sandboxReservations || []).map(r => {
      const client = r.cliente_id ? clientsMap.get(r.cliente_id) : null;
      const clientFullName = client ? formatClientName(client.nombre, client.apellido) : '';
      const rawName = (r as any).cliente_nombre || clientFullName || (r as any).customer?.nombre || 'Prueba';
      const testName = rawName.startsWith('[TEST]') ? rawName : `[TEST] ${rawName}`;
      return {
        ...r,
        isSandbox: true,
        cliente_nombre: testName,
        customer: (client ? {
          ...client,
          nombre: testName,
        } : {
          id: r.cliente_id || 'sandbox-client',
          nombre: testName,
          telefono: (r as any).cliente_telefono || '',
          correo: (r as any).cliente_email || ''
        }) as unknown as Client
      };
    });

    if (sandboxViewMode === 'sandbox_only') {
      return taggedSandbox;
    }
    if (sandboxViewMode === 'real_only') {
      return normalizedRealReservations;
    }
    return [...normalizedRealReservations, ...taggedSandbox];
  }, [normalizedRealReservations, sandboxReservations, isLocalhost, sandboxViewMode, clientsMap]);

  useEffect(() => {
    if (!effectiveReservations || effectiveReservations.length === 0 || !db) return;

    const uniqueClientIds = Array.from(new Set(effectiveReservations.map(r => r.cliente_id).filter(Boolean)));
    const idsToFetch = uniqueClientIds.filter(id => !fetchedClientIdsRef.current.has(id));

    if (idsToFetch.length > 0) {
      const fetchClientsBatch = async () => {
        setClientsLoading(true);
        try {
          const CHUNK_SIZE = 30;
          const chunks: string[][] = [];
          for (let i = 0; i < idsToFetch.length; i += CHUNK_SIZE) {
            chunks.push(idsToFetch.slice(i, i + CHUNK_SIZE));
          }

          const batchPromises = chunks.map(chunk =>
            getDocs(query(collection(db, 'clientes'), where(documentId(), 'in', chunk)))
          );

          const snapshots = await Promise.all(batchPromises);
          setClientsMap(prev => {
            const next = new Map(prev);
            snapshots.forEach(snap => {
              snap.docs.forEach(doc => {
                const c = { id: doc.id, ...doc.data() } as Client;
                next.set(doc.id, c);
                fetchedClientIdsRef.current.add(doc.id);
              });
            });
            return next;
          });
        } catch (err) {
          console.error("Error fetching agenda clients:", err);
        } finally {
          setClientsLoading(false);
        }
      };
      fetchClientsBatch();
    }
  }, [reservations, db]);

  const clients = useMemo(() => Array.from(clientsMap.values()), [clientsMap]);

  // Determine if we are in a 'critical' loading state (initial load or date change)
  // We exclude some non-critical loads if we want optimistic UI, but for now we block to prevent empty grid.
  const isLoading = professionalsLoading || localesLoading || reservationsLoading || timeBlocksLoading || specialJourneysLoading;

  // Non-blocking background loads (optional to block)
  // clientsLoading, usersLoading, productsLoading might take longer but don't prevent rendering the grid structure.

  const filteredProfessionals = useMemo(() => {
    let professionalsOfLocal = professionals.filter(p => p.active !== false && !p.deleted && p.local_id === selectedLocalId);

    // If user cannot see global agenda, filter to only show themselves
    const canViewAll = canSee('ver_agenda_global');
    if (!canViewAll) {
      const userEmailClean = user?.email?.toLowerCase().trim();
      const userUid = user?.uid;
      const myProf = professionals.find(p => 
        !p.deleted && (
          (userUid && p.userId === userUid) ||
          (userEmailClean && p.email?.toLowerCase().trim() === userEmailClean)
        )
      );
      if (myProf) {
        professionalsOfLocal = [myProf];
      } else {
        professionalsOfLocal = [];
      }
    }

    if (!canViewAll || selectedProfessionalFilter === 'todos') {
      return professionalsOfLocal.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    }
    return professionalsOfLocal.filter(p => p.id === selectedProfessionalFilter);
  }, [professionals, selectedProfessionalFilter, selectedLocalId, user]);

  const { allEvents, eventsWithLayout } = useAgendaEvents(effectiveReservations, timeBlocks, clients, professionals);

  // Auto-cancelar citas pendientes de anticipo que superaron los 20 minutos de tolerancia
  const autoCancellingIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!db || !effectiveReservations || effectiveReservations.length === 0) return;
    const nowMs = Date.now();

    effectiveReservations.forEach((res) => {
      if (!res?.id || res.estado === 'Cancelado') return;
      if ((res as any).anticipo_en_sucursal === true || (res as any).tolerancia_anticipo_extendida === true || (res as any).exento_anticipo === true) return;
      if (res.estado === 'Confirmado' || res.estado === 'Asiste' || res.estado === 'Completado') return;
      if (autoCancellingIdsRef.current.has(res.id)) return;

      if (isExpiredPendingDepositReservation(res, nowMs, 20)) {
        autoCancellingIdsRef.current.add(res.id);
        const isSandbox = Boolean((res as any).isSandbox);
        const targetCol = isSandbox ? 'reservas_sandbox' : 'reservas';
        updateDoc(doc(db, targetCol, res.id), {
          estado: 'Cancelado',
          motivo_cancelacion: 'Cancelada automáticamente por falta de pago de anticipo en los 20 minutos de tolerancia.',
          cancelada_automaticamente: true,
          cancelado_en: Timestamp.now(),
        })
          .then(async () => {
            if (!isSandbox && res.cliente_id) {
              try {
                await updateDoc(doc(db, 'clientes', res.cliente_id), {
                  citas_canceladas: increment(1)
                });
              } catch (cErr) {
                console.warn('Error incrementando citas_canceladas del cliente:', cErr);
              }
            }
            onDataRefresh();
          })
          .catch((err) => {
            console.error('Error auto-cancelando cita por anticipo vencido:', err);
            autoCancellingIdsRef.current.delete(res.id);
          });
      }
    });
  }, [effectiveReservations, currentTime, db]);

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
      updateHoveredSlot(null);
      // Start closing timer if invalid slot
      if (popoverState && !popoverTimeoutRef.current) {
        popoverTimeoutRef.current = setTimeout(() => setPopoverState(null), 400);
      }
      return;
    }

    const barber = filteredProfessionals.find(p => p.id === barberId);
    if (barber) {
      const daySchedule = getDaySchedule(barber);
      const [slotH, slotM] = time.split(':').map(Number);
      const slotTime = slotH * 60 + slotM;
      const slotEnd = slotTime + 15; // 15 min slot check
      const slotTimeDecimal = slotH + slotM / 60;

      const isUnlocked = allEvents.some(evt =>
        evt.barbero_id === barberId &&
        evt.type === 'block' &&
        (evt as any).originalType === 'available' &&
        evt.start <= slotTimeDecimal &&
        evt.end > slotTimeDecimal
      );

      const isWorking = daySchedule && daySchedule.enabled;
      let isInvalidSlot = false;

      if (!isUnlocked) {
        if (!isWorking) {
          isInvalidSlot = true;
        } else if (daySchedule?.start && daySchedule?.end) {
          const [startH, startM] = daySchedule.start.split(':').map(Number);
          const [endH, endM] = daySchedule.end.split(':').map(Number);
          const barberStart = startH + startM / 60;
          const barberEnd = endH + endM / 60;

          if (slotTimeDecimal < barberStart || slotTimeDecimal >= barberEnd) {
            isInvalidSlot = true;
          }

          if (!isInvalidSlot && daySchedule?.breaks) {
            const isBreak = daySchedule.breaks.some((brk: any) => {
              if (!brk?.start || !brk?.end) return false;
              const [sH, sM] = brk.start.split(':').map(Number);
              const [eH, eM] = brk.end.split(':').map(Number);
              const breakStart = sH * 60 + sM;
              const breakEnd = eH * 60 + eM;
              return (slotTime < breakEnd && slotEnd > breakStart);
            });
            if (isBreak) isInvalidSlot = true;
          }
        } else {
          isInvalidSlot = true;
        }
      }

      if (isInvalidSlot) {
        updateHoveredSlot(null);
        if (popoverState && !popoverTimeoutRef.current) {
          popoverTimeoutRef.current = setTimeout(() => setPopoverState(null), 400);
        }
        return;
      }
    }

    updateHoveredSlot({ barberId, time });

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
    updateHoveredSlot(null);
    // When leaving grid, start timer instead of immediate close
    if (popoverState && !popoverTimeoutRef.current) {
      popoverTimeoutRef.current = setTimeout(() => {
        setPopoverState(null);
        popoverTimeoutRef.current = null;
      }, 400);
    }
  }

  const handleClickSlot = (e: MouseEvent<HTMLDivElement>) => {
    playAgendaClickSound();
    e.stopPropagation();
    if (hoveredSlotRef.current) {
      setPopoverState(hoveredSlotRef.current)
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

  const handleSelectQuickConsultSlot = (time: string, barberId: string, serviceId: string) => {
    if (!canSee('crear_reservas')) return;
    setReservationInitialData({
      barbero_id: barberId,
      fecha: date || new Date(),
      hora_inicio: time,
      local_id: selectedLocalId,
      preselectedServiceId: serviceId,
    });
    setIsReservationModalOpen(true);
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

  const handleOpenEnableScheduleFromPopover = () => {
    if (!canSee('bloquear_horarios')) return;
    if (popoverState && date) {
      const barber = professionals.find(p => p.id === popoverState.barberId);
      setEnableScheduleInitialData({
        barbero_id: popoverState.barberId,
        barberName: barber?.publicName || barber?.name,
        fecha: date,
        hora_inicio: popoverState.time,
        local_id: selectedLocalId,
      });
      setIsEnableScheduleModalOpen(true);
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



  useEffect(() => {
    if (!selectedReservation) return;
    const updated = allEvents.find(r => r.id === selectedReservation.id) as Reservation | undefined;
    if (updated) {
      setSelectedReservation(updated);
    }
  }, [allEvents]);

  const handleOpenDetailModal = (event: AgendaEvent | Reservation | any) => {
    playAgendaClickSound();
    const fullReservation = (allEvents.find(r => r.id === event.id) as Reservation | undefined) || event;
    if (fullReservation) {
      if (!fullReservation.customer && (fullReservation.cliente_nombre || fullReservation.cliente_id)) {
        const matchedClient = clientsMap.get(fullReservation.cliente_id);
        if (matchedClient) {
          fullReservation.customer = matchedClient;
        } else if (fullReservation.cliente_nombre) {
          fullReservation.customer = {
            id: fullReservation.cliente_id || 'online-client',
            nombre: fullReservation.cliente_nombre,
            telefono: fullReservation.cliente_telefono || '',
            correo: fullReservation.cliente_email || '',
          } as Client;
        }
      }
      setSelectedReservation(fullReservation);
      setIsDetailModalOpen(true);
    }
  }

  const handleEditFromDetail = () => {
    if (!selectedReservation) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isPastDate = Boolean(selectedReservation.fecha && selectedReservation.fecha < todayStr);
    const isFullyPaidAndAttended = Boolean(
      (selectedReservation.estado === 'Asiste' || selectedReservation.estado === 'Completado' || selectedReservation.estado === 'Venta completada') &&
      selectedReservation.pago_estado === 'Pagado'
    );
    if (isPastDate || isFullyPaidAndAttended) {
      toast({
        title: "Cita concluida",
        description: "Esta cita ya fue completada o corresponde a una fecha pasada y no puede ser modificada.",
      });
      return;
    }
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
            precio: item.precio || product.public_price,
            cantidad: item.cantidad,
            tipo: 'producto' as const,
            commissionPaid: (item as any).commissionPaid,
            hora_inicio: (item as any).hora_inicio || null,
            hora_fin: (item as any).hora_fin || null,
            professional_lock: (item as any).professional_lock || null,
            duracion: (item as any).duracion || 0
          } : null;
        } else {
          const service = services.find(s => s.name === item.servicio || s.id === (item as any).id);
          return service ? {
            ...service,
            id: service.id,
            nombre: service.name,
            precio: item.precio || service.price,
            cantidad: 1,
            tipo: 'servicio' as const,
            barbero_id: item.barbero_id,
            commissionPaid: (item as any).commissionPaid,
            hora_inicio: (item as any).hora_inicio || null,
            hora_fin: (item as any).hora_fin || null,
            professional_lock: (item as any).professional_lock || null,
            duracion: (item as any).duracion !== undefined ? (item as any).duracion : (service.duration || 0)
          } : null;
        }
      }).filter((i): i is any => !!i);

      const isDepositActuallyPaid =
        selectedReservation.pago_estado === 'deposit_paid' ||
        selectedReservation.pago_estado === 'anticipo_pagado' ||
        (selectedReservation.pago_estado !== 'pendiente_anticipo' &&
          selectedReservation.pago_estado !== 'pending_payment' &&
          selectedReservation.pago_estado !== 'Pendiente' &&
          selectedReservation.pago_estado !== 'pendiente' &&
          (Number(selectedReservation.anticipo_pagado) > 0 ||
            Number(selectedReservation.anticipoPagado) > 0 ||
            Number(selectedReservation.monto_pagado_real) > 0 ||
            Number(selectedReservation.monto_pagado) > 0));

      const depositPaid = isDepositActuallyPaid
        ? (Number(
            selectedReservation.anticipoPagado ||
            selectedReservation.anticipo_pagado ||
            selectedReservation.monto_pagado_real ||
            selectedReservation.monto_pagado ||
            selectedReservation.monto_anticipo ||
            (selectedReservation.total && selectedReservation.saldo_pendiente !== undefined
              ? Math.max(0, Number(selectedReservation.total) - Number(selectedReservation.saldo_pendiente))
              : 0)
          ) || 0)
        : 0;

      const saleData = {
        client,
        items: cartItems,
        reservationId: selectedReservation.id,
        local_id: selectedReservation.local_id,
        pago_estado: selectedReservation.pago_estado,
        anticipoPagado: depositPaid,
        anticipo_pagado: depositPaid,
        monto_anticipo: depositPaid,
        monto_pagado_real: depositPaid
      };
      setIsDetailModalOpen(false);
      document.dispatchEvent(new CustomEvent('new-sale', { detail: saleData }));
    }
  }



  const handleRegisterDeposit = async (depositAmount: number, paymentMethod: string, computedTotal?: number) => {
    if (!selectedReservation || !db) {
      toast({ variant: 'destructive', title: 'Error', description: 'No hay reserva seleccionada o la base de datos no está disponible.' });
      return;
    }

    try {
      const isSandboxRes = Boolean((selectedReservation as any)?.isSandbox);
      const resId = selectedReservation.id;
      const total = (computedTotal && computedTotal > 0) ? computedTotal : (selectedReservation.total || selectedReservation.precio || 0);
      const saldoPendiente = Math.max(0, total - depositAmount);
      // Keep 'deposit_paid' even when depositAmount covers 100% of total so the appointment
      // still goes through normal POS checkout / closure on the day of the service
      const resolvedPagoEstado = 'deposit_paid';

      const isTerminal = paymentMethod === 'mercadopago';
      const depositSaleId = `deposit_${resId}_${Date.now()}`;
      const targetCol = isSandboxRes ? 'reservas_sandbox' : 'reservas';
      const resRef = doc(db, targetCol, resId);

      // Create deposit sale record in 'ventas' (only for real bookings, never in sandbox)
      if (!isSandboxRes) {
        const saleRef = doc(db, 'ventas', depositSaleId);
        const normalizedItems = (selectedReservation.items || []).map((it: any) => ({
          ...it,
          precio: Number(it.precio || it.subtotal) || 0,
          precio_unitario: Number(it.precio_unitario || it.precio || it.subtotal) || 0,
          subtotal: Number(it.subtotal || it.precio) || 0,
          cantidad: Number(it.cantidad) || 1,
          descuento: it.descuento || { valor: 0, tipo: 'fixed', monto: 0 },
        }));
        const saleData = {
          id: depositSaleId,
          reservationId: resId,
          cliente_id: selectedReservation.cliente_id || '',
          cliente_nombre: formatClientName(selectedReservation.customer?.nombre, selectedReservation.customer?.apellido),
          local_id: selectedReservation.local_id || selectedLocalId || 'default',
          fecha_hora_venta: Timestamp.now(),
          tipo_venta: 'anticipo',
          subtotal: total,
          total: total,
          anticipo_esperado: depositAmount,
          monto_pagado_real: isTerminal ? 0 : depositAmount,
          monto_anticipo: isTerminal ? 0 : depositAmount,
          anticipoPagado: isTerminal ? 0 : depositAmount,
          anticipo_pagado: isTerminal ? 0 : depositAmount,
          monto_pagado: isTerminal ? 0 : depositAmount,
          pago_efectivo: !isTerminal && paymentMethod === 'efectivo' ? depositAmount : 0,
          pago_tarjeta: !isTerminal && (paymentMethod === 'tarjeta' || paymentMethod === 'mercadopago') ? depositAmount : 0,
          pago_transferencia: !isTerminal && paymentMethod === 'transferencia' ? depositAmount : 0,
          saldo_pendiente: isTerminal ? total : saldoPendiente,
          pago_estado: isTerminal ? 'Pendiente' : resolvedPagoEstado,
          status: isTerminal ? 'pending' : 'completed',
          metodo_pago: paymentMethod,
          items: normalizedItems,
          creado_por: user?.email || 'recepcion'
        };

        await setDoc(saleRef, saleData);
      }

      // For cash / bank transfer, update reservation immediately
      if (!isTerminal) {
        const updateData = {
          total: total,
          estado: 'Confirmado',
          pago_estado: resolvedPagoEstado,
          anticipo_esperado: depositAmount,
          monto_anticipo: depositAmount,
          anticipo_pagado: depositAmount,
          anticipoPagado: depositAmount,
          monto_pagado: depositAmount,
          saldo_pendiente: saldoPendiente,
          monto_pagado_real: depositAmount,
          metodo_pago_anticipo: paymentMethod,
          deposit_payment_id: depositSaleId,
          deposit_paid_at: Timestamp.now(),
          anticipo_en_sucursal: true,
          motivo_cancelacion: deleteField(),
          cancelada_automaticamente: deleteField(),
          cancelado_en: deleteField()
        };

        await updateDoc(resRef, updateData);

        setSelectedReservation({
          ...selectedReservation,
          ...updateData
        });

        toast({
          title: 'Anticipo Registrado',
          description: `Se registró el anticipo de $${depositAmount.toFixed(2)} correctamente.`,
        });
      } else {
        // Store reference and expected deposit metadata on reservation without marking as paid yet
        await updateDoc(resRef, {
          total: total,
          anticipo_esperado: depositAmount,
          metodo_pago_anticipo: paymentMethod,
          deposit_payment_id: depositSaleId
        });
      }

      await logAuditAction({
        action: 'Registrar Anticipo',
        details: `Anticipo de $${depositAmount.toFixed(2)} (${paymentMethod}) registrado para ${selectedReservation.customer?.nombre || 'Cliente'}. Saldo pendiente: $${saldoPendiente.toFixed(2)}.`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        severity: 'info',
        localId: selectedReservation.local_id || 'unknown'
      });

      return depositSaleId;
    } catch (err: any) {
      console.error('Error registrando anticipo:', err);
      toast({ variant: 'destructive', title: 'Error', description: err?.message || 'No se pudo registrar el anticipo.' });
    }
  };

  const handleUpdateStatus = async (reservationId: string, newStatus: string) => {
    if (!db) {
      toast({ variant: 'destructive', title: 'Error', description: 'No hay conexión con la base de datos.' });
      return;
    }
    try {
      const isSandboxRes = Boolean(
        (selectedReservation as any)?.isSandbox ||
        allEvents.find(e => e.id === reservationId && (e as any).isSandbox) ||
        (sandboxReservations || []).some(r => r.id === reservationId)
      );
      const targetCollection = isSandboxRes ? 'reservas_sandbox' : 'reservas';
      const resRef = doc(db, targetCollection, reservationId);
      const resSnap = await getDoc(resRef);
      const resData = resSnap.exists() ? (resSnap.data() as Reservation) : selectedReservation;

      const isResDepositPaid =
        resData?.pago_estado === 'deposit_paid' ||
        resData?.pago_estado === 'anticipo_pagado' ||
        (resData?.pago_estado !== 'pendiente_anticipo' &&
          resData?.pago_estado !== 'pending_payment' &&
          resData?.pago_estado !== 'Pendiente' &&
          resData?.pago_estado !== 'pendiente' &&
          (Number(resData?.anticipo_pagado) > 0 || Number(resData?.monto_pagado_real) > 0));

      // Retained Deposit logic for "No asistió" (No asiste)
      if (newStatus === 'No asiste' && !isSandboxRes && isResDepositPaid) {
        const depositAmount = Number(resData?.anticipo_pagado || resData?.anticipoPagado || resData?.monto_pagado_real || resData?.monto_anticipo || 0);

        if (depositAmount > 0) {
          const totalRes = resData?.total || depositAmount;
          const ratio = depositAmount / (totalRes || 1);

          // Scale item prices to deposit amount so professional commission calculates 50% of the retained deposit
          const scaledItems = resData?.items?.map(item => ({
            ...item,
            precio: Math.round((item.precio || item.subtotal || 0) * ratio * 100) / 100,
            subtotal: Math.round((item.subtotal || item.precio || 0) * ratio * 100) / 100,
          })) || [{
            id: 'anticipo-retenido',
            nombre: 'Anticipo Retenido por Inasistencia',
            tipo: 'servicio',
            precio: depositAmount,
            subtotal: depositAmount,
            barbero_id: resData?.barbero_id
          }];

          const depositSaleId = resData?.deposit_payment_id || `deposit_${reservationId}`;
          const saleRef = doc(db, 'ventas', depositSaleId);

          await setDoc(saleRef, {
            id: depositSaleId,
            reservationId: reservationId,
            cliente_id: resData?.cliente_id || '',
            cliente_nombre: formatClientName((resData as any)?.customer?.nombre, (resData as any)?.customer?.apellido),
            local_id: resData?.local_id || selectedLocalId || 'default',
            fecha_hora_venta: Timestamp.now(),
            tipo_venta: 'anticipo_retenido',
            total: depositAmount,
            monto_pagado_real: depositAmount,
            saldo_pendiente: 0,
            pago_estado: 'Pagado',
            metodo_pago: resData?.metodo_pago_anticipo || 'efectivo',
            items: scaledItems,
            motivo: 'Anticipo Retenido por Inasistencia'
          }, { merge: true });

          await updateDoc(resRef, {
            estado: 'No asiste',
            pago_estado: 'Pagado',
            saldo_pendiente: 0,
            monto_retenido: depositAmount
          });

          toast({
            title: 'No Asistió - Anticipo Retenido',
            description: `Se registró la inasistencia. Se retuvo el anticipo de $${depositAmount.toFixed(2)} y se asignó la comisión al profesional.`,
          });

          if (selectedReservation && selectedReservation.id === reservationId) {
            setSelectedReservation({
              ...selectedReservation,
              estado: 'No asiste',
              pago_estado: 'Pagado',
              saldo_pendiente: 0,
              monto_retenido: depositAmount
            });
          }
          return;
        }
      }

      const wasCancelled = resData?.estado === 'Cancelado';
      const isReactivating = wasCancelled && newStatus !== 'Cancelado';
      const isCancelling = !wasCancelled && newStatus === 'Cancelado';

      const updateData: any = { estado: newStatus };
      if (isReactivating) {
        updateData.motivo_cancelacion = deleteField();
        updateData.cancelada_automaticamente = deleteField();
        updateData.cancelado_en = deleteField();
        updateData.anticipo_en_sucursal = true;
        updateData.requiere_anticipo = false;
        updateData.anticipo_esperado = 0;
        if (resData?.pago_estado === 'pendiente_anticipo') {
          updateData.pago_estado = 'Pendiente';
        }
      }

      await updateDoc(resRef, updateData);

      // Sincronizar contador de citas_canceladas en el perfil del cliente
      if (!isSandboxRes && resData?.cliente_id) {
        try {
          const clientRef = doc(db, 'clientes', resData.cliente_id);
          if (isCancelling) {
            await updateDoc(clientRef, { citas_canceladas: increment(1) });
          } else if (isReactivating) {
            const clientSnap = await getDoc(clientRef);
            if (clientSnap.exists()) {
              const curCancelled = Number(clientSnap.data()?.citas_canceladas) || 0;
              if (curCancelled > 0) {
                await updateDoc(clientRef, { citas_canceladas: increment(-1) });
              }
            }
          }
        } catch (cErr) {
          console.warn('Error actualizando citas_canceladas del cliente:', cErr);
        }
      }

      toast({
        title: isReactivating ? 'Cita reactivada' : (isSandboxRes ? 'Estado actualizado (Sandbox)' : 'Estado actualizado'),
        description: isReactivating
          ? `La cita fue reactivada en estado: ${newStatus}`
          : `La reserva ahora está en estado: ${newStatus}`
      });
      if (selectedReservation && selectedReservation.id === reservationId) {
        setSelectedReservation({
          ...selectedReservation,
          estado: newStatus,
          ...(isReactivating ? {
            motivo_cancelacion: undefined,
            cancelada_automaticamente: undefined,
            cancelado_en: undefined,
            anticipo_en_sucursal: true,
            requiere_anticipo: false,
            anticipo_esperado: 0,
            ...(selectedReservation.pago_estado === 'pendiente_anticipo' ? { pago_estado: 'Pendiente' } : {})
          } : {})
        });
      }
    } catch (err: any) {
      console.error('Error actualizando estado:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
    }
  };

  const handleCancelReservation = async (reservationId: string, reason: string) => {
    const isSandboxRes = Boolean((selectedReservation as any)?.isSandbox);
    if (!selectedReservation || (!selectedReservation.cliente_id && !isSandboxRes) || !db) {
      toast({ variant: 'destructive', title: "Error", description: "La reserva no tiene un cliente asociado o no hay conexión con la base de datos." });
      return;
    }

    try {
      if (isSandboxRes) {
        const resRef = doc(db, 'reservas_sandbox', reservationId);
        await updateDoc(resRef, { estado: 'Cancelado', motivo_cancelacion: reason || '' });
      } else {
        await runTransaction(db, async (transaction) => {
          if (!db) throw new Error("Database not available in transaction");
          const resRef = doc(db, 'reservas', reservationId);
          const clientRef = doc(db, 'clientes', selectedReservation.cliente_id!);

          transaction.update(resRef, { estado: 'Cancelado', motivo_cancelacion: reason || '' });
          transaction.update(clientRef, {
            citas_canceladas: increment(1)
          });
        });
      }

      await logAuditAction({
        action: 'Cancelar Reserva' + (isSandboxRes ? ' (Sandbox)' : ''),
        details: `Se canceló la cita del cliente ${selectedReservation.customer?.nombre || 'Desconocido'}. Motivo: ${reason || 'No especificado'}. Fecha: ${selectedReservation.fecha} a las ${selectedReservation.hora_inicio}.`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        severity: 'warning',
        localId: selectedReservation.local_id || 'unknown'
      });

      toast({
        title: isSandboxRes ? "Reserva Cancelada (Sandbox)" : "Reserva Cancelada",
        description: isSandboxRes
          ? "La cita de prueba ha sido cancelada en Sandbox."
          : "El estado de la reserva ha sido actualizado a 'Cancelado'.",
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

  const handleViewClientFile = async (clientId: string) => {
    let client = clients.find(c => c.id === clientId);
    if (!client && db) {
      try {
        const snap = await getDoc(doc(db, 'clientes', clientId));
        if (snap.exists()) {
          client = { id: snap.id, ...snap.data() } as Client;
        }
      } catch (e) {
        console.error("Error fetching client details:", e);
      }
    }
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
    // Se restan 3px de la altura total para dejar un pequeño espacio entre citas consecutivas
    return { top: `${top}px`, height: `calc(${height}px - 3px)` };
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
    if (!date) return null;
    return getEffectiveBarberDaySchedule({
      barber,
      date,
      localSchedule: selectedLocal?.schedule as any,
      specialJourneys,
    });
  };

  const selectedDateFormatted = useMemo(() => {
    if (!date) return 'Cargando...';
    const dayName = format(date, 'EEEE', { locale: es });
    const dayNum = format(date, 'd', { locale: es });
    const month = format(date, 'MMM', { locale: es }).replace('.', '');
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capitalizedDay} ${dayNum} de ${month}.`;
  }, [date]);

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  const getProfessionalAvatar = (profesional: Profesional): string | undefined => {
    return profesional.avatarUrl;
  };

  if (!isClientMounted) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center gap-4 bg-muted/40">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium animate-pulse">Iniciando...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col md:grid h-[calc(100vh-4rem)] bg-muted/40 gap-2 overflow-hidden", isSidebarCollapsed ? 'md:grid-cols-[0px_1fr]' : 'md:grid-cols-[288px_1fr]')} style={{ transition: 'grid-template-columns 0.3s ease' }}>
        {/* Left Panel - Hidden on mobile, collapsible on desktop */}
        <aside className={cn("bg-white border-r flex-col flex-shrink-0 min-h-0 overflow-y-auto scrollbar-thin transition-all duration-300 hidden md:flex", isSidebarCollapsed ? 'md:w-0 md:overflow-hidden md:p-0 md:opacity-0 md:border-r-0' : 'md:w-[288px]')}>
          <div className="p-3 grid grid-cols-2 gap-3 md:flex md:flex-col md:space-y-2 md:p-4">
            {user?.role === 'Administrador general' ? (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="branch-select" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sucursal</Label>
                  <Select value={selectedLocalId || ''} onValueChange={setSelectedLocalId} disabled={!!user?.local_id}>
                    <SelectTrigger id="branch-select" className="h-8 text-xs rounded-lg">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locales.map(local => (
                        <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="professional-select" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Profesional</Label>
                  <Select value={selectedProfessionalFilter} onValueChange={setSelectedProfessionalFilter}>
                    <SelectTrigger id="professional-select" className="h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {professionals.filter(p => p.active !== false && !p.deleted).map(prof => (
                        <SelectItem key={prof.id} value={prof.id}>{prof.publicName || prof.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : canSee('ver_agenda_global') ? (
              <div className="col-span-2 flex flex-col gap-1">
                <Label htmlFor="professional-select" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Profesional</Label>
                <Select value={selectedProfessionalFilter} onValueChange={setSelectedProfessionalFilter}>
                  <SelectTrigger id="professional-select" className="h-8 text-xs rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {professionals.filter(p => p.active !== false && !p.deleted).map(prof => (
                      <SelectItem key={prof.id} value={prof.id}>{prof.publicName || prof.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          {isClientMounted && (
            <div className="hidden md:flex justify-center">
              <Calendar
                mode="single"
                required
                selected={date}
                onSelect={(newDate) => {
                  if (newDate) {
                    setDate(newDate);
                  }
                }}
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
          <div className="flex-shrink-0 flex items-center justify-between gap-2 p-3 md:p-4 border-b">
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleSidebar}
                    className="h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors hidden md:flex shrink-0"
                  >
                    {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isSidebarCollapsed ? 'Mostrar calendario lateral' : 'Ocultar calendario lateral'}
                </TooltipContent>
              </Tooltip>

              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={handleSetToday}>Hoy</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevDay}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextDay}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              
              <div className="h-4 w-[1px] bg-border hidden sm:block" />

              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <h2 className="text-xs sm:text-sm md:text-base font-normal text-foreground truncate">
                    {selectedDateFormatted}
                  </h2>
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary md:hidden flex-shrink-0">
                        <CalendarDays className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        required
                        selected={date}
                        onSelect={(newDate) => {
                          if (newDate) {
                            setDate(newDate);
                            setIsCalendarOpen(false);
                          }
                        }}
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="text-[10px] text-muted-foreground hidden md:flex items-center gap-1 mt-0.5">
                  <Store className='w-3.5 h-3.5' /> {selectedLocal?.name || 'Cargando...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Botón de 3 puntitos para filtros en vista de celular (solo admin/recepción, no staff) */}
              {!isStaff && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors flex md:hidden shrink-0"
                      title="Filtros de la agenda"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-72 p-3.5 space-y-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background z-[100]"
                    align="end"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">Filtros</span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.dispatchEvent(new CustomEvent('open-qr-scanner'))}
                      className="w-full flex items-center justify-center gap-2 border-[#C5A880]/50 text-[#C5A880] hover:bg-[#C5A880]/15 text-xs h-8.5 font-semibold rounded-lg shadow-xs"
                    >
                      <QrCode className="h-4 w-4 text-[#C5A880]" />
                      <span>Escanear QR de Cliente</span>
                    </Button>

                    {user?.role === 'Administrador general' && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="mobile-branch-select" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Sucursal
                        </Label>
                        <Select value={selectedLocalId || ''} onValueChange={setSelectedLocalId} disabled={!!user?.local_id}>
                          <SelectTrigger id="mobile-branch-select" className="h-8 text-xs rounded-lg">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-blue-500 rounded-xl z-[110]">
                            {locales.map(local => (
                              <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {canSee('ver_agenda_global') && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="mobile-professional-select" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Profesional
                        </Label>
                        <Select value={selectedProfessionalFilter} onValueChange={setSelectedProfessionalFilter}>
                          <SelectTrigger id="mobile-professional-select" className="h-8 text-xs rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-blue-500 rounded-xl z-[110]">
                            <SelectItem value="todos">Todos</SelectItem>
                            {professionals.filter(p => p.active !== false && !p.deleted).map(prof => (
                              <SelectItem key={prof.id} value={prof.id}>{prof.publicName || prof.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {isLocalhost && (
                      <div className="flex flex-col gap-1.5 pt-2 border-t border-border/60">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>Modo Sandbox (Local)</span>
                        </div>
                        <Select
                          value={sandboxViewMode}
                          onValueChange={(val: any) => {
                            setSandboxViewMode(val);
                            try { localStorage.setItem('vatos_agenda_sandbox_view_mode', val); } catch (e) {}
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs rounded-lg border-2 border-blue-500/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-blue-500 rounded-xl z-[110]">
                            <SelectItem value="hybrid">Híbrido (Reales + Test)</SelectItem>
                            <SelectItem value="sandbox_only">Solo Test (Sandbox)</SelectItem>
                            <SelectItem value="real_only">Solo Reales</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {isLocalhost && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-950/70 border-2 border-blue-500/50 text-xs shadow-xs shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-[11px] font-bold text-white hidden lg:inline">Sandbox:</span>
                  <select
                    value={sandboxViewMode}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setSandboxViewMode(val);
                      try { localStorage.setItem('vatos_agenda_sandbox_view_mode', val); } catch (e) {}
                    }}
                    className="bg-transparent text-blue-300 font-semibold text-xs border-none focus:outline-none cursor-pointer pr-1"
                    title="Modo Sandbox en Agenda (Pruebas Locales)"
                  >
                    <option value="hybrid" className="bg-slate-900 text-white">Híbrido (Reales + Test)</option>
                    <option value="sandbox_only" className="bg-slate-900 text-white">Solo Test (Sandbox)</option>
                    <option value="real_only" className="bg-slate-900 text-white">Solo Reales</option>
                  </select>
                </div>
              )}

              {!isStaff && !authLoading && (
                <>
                  <OverdueNotificationsPopover
                    reservations={effectiveReservations}
                    professionals={professionals}
                    clients={clients}
                    selectedLocalId={selectedLocalId}
                    onUpdateStatus={handleUpdateStatus}
                    onSelectReservation={handleOpenDetailModal}
                    onOpenBookingRules={() => setIsBookingRulesModalOpen(true)}
                  />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsQuickConsultOpen(true)}
                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <Zap className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Espacio Rápido</TooltipContent>
                  </Tooltip>
                </>
              )}

              {/* Botón de Reglas de Reserva (Librito) visible para todo el equipo (incluyendo Staff) al lado de Ayuda */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsBookingRulesModalOpen(true)}
                    className="h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors"
                    title="Reglas de Reserva • Guía Rápida"
                  >
                    <BookOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reglas de Reserva</TooltipContent>
              </Tooltip>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors">
                    <HelpCircle className="h-4 w-4" />
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
                          <span className="text-sm">Reserva desde la página web</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-5 h-5 text-sky-500 flex-shrink-0" />
                          <span className="text-sm">Reserva desde la App por el cliente</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <img src="/janet-avatar.png" alt="Janet" className="w-5 h-5 rounded-full object-cover ring-1 ring-blue-500 flex-shrink-0" />
                          <span className="text-sm">Reserva agendada por Janet (Chat App)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm">Profesional fijo (no reasignable)</span>
                        </div>
                      </div>
                    </div>
                    {/* Communication Alerts */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Alertas de comunicación</p>
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 rounded bg-blue-300/80 border-l-[3px] border-blue-500 flex-shrink-0 animate-pending-notification overflow-hidden relative" />
                          <div className="flex flex-col">
                            <span className="text-sm">Pendiente de notificación</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">Falta enviar confirmación o recordatorio (WhatsApp)</span>
                          </div>
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
                  <Button variant="ghost" size="icon" onClick={() => window.open('/agenda/display', '_blank')} className="h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors hidden md:flex">
                    <Cast className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[250px] space-y-2 p-3 text-center z-[100]">
                  <p className="font-semibold text-sm border-b pb-1">Transmitir en pantalla</p>
                  <p className="text-xs text-muted-foreground text-left">
                    1. Clic aquí para abrir la vista pública en una pestaña nueva.<br />
                    2. En esa pestaña, abre el menú de opciones (⫶) de tu navegador.<br />
                    3. Elige <strong>"Enviar, guardar..." &gt; "Transmitir..."</strong> o <strong>"Enviar"</strong> a tu pantalla.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Esta es la linea que genera el scroll vertical */}
          <div className="flex-grow overflow-auto">
            {!isLoading && filteredProfessionals.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-16">
                <User className="h-10 w-10 text-slate-400 mb-3" />
                <h3 className="text-base font-semibold text-foreground mb-1">
                  {!canSee('ver_agenda_global') ? 'Perfil de Barbero No Asignado' : 'No hay barberos disponibles'}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {!canSee('ver_agenda_global')
                    ? `Tu usuario (${user?.email || 'activo'}) tiene rol Staff pero aún no está vinculado a una columna de barbero en la sucursal seleccionada. Pide a un Administrador que ingrese a Ajustes > Profesionales y configure tu correo exacto a tu barbero.`
                    : 'No se encontraron profesionales activos para la sucursal o filtro seleccionado.'}
                </p>
              </div>
            ) : (
              <>
                {/* Professional Headers */}
                <div className="sticky top-0 z-50 grid gap-2 bg-background border-b shadow-sm" style={{ gridTemplateColumns: `64px repeat(${filteredProfessionals.length}, minmax(200px, 1fr))` }}>
              <div className="sticky left-0 bg-background z-[60]">
                <div className="h-[72px] flex items-center justify-center p-2 border-b border-r">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors">
                        <Clock className="h-4 w-4" />
                      </Button>
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

            <div className="relative">
              {isLoading && (
                <div className="absolute inset-0 z-50 bg-background/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-none transition-all duration-300">
                  <div className="flex items-center gap-2 bg-background p-3 rounded-full shadow-lg border animate-in zoom-in-95">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm font-medium">Actualizando...</span>
                  </div>
                </div>
              )}
              <div className="grid gap-2 pb-8" style={{ gridTemplateColumns: `64px repeat(${filteredProfessionals.length}, minmax(200px, 1fr))` }}>
              {/* Time Column */}
              <div className="flex-shrink-0 sticky left-0 z-40 bg-background border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                <div className="flex flex-col bg-background">
                  {timeSlots.slice(0, -1).map((time, index) => (
                    <div key={index} style={{ height: `${ROW_HEIGHT}px` }} className="border-b flex items-center justify-center text-center bg-background">
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
                if (isWorking && daySchedule?.start && daySchedule?.end) {
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
                  if (!brk?.start || !brk?.end) return [];
                  const [sH, sM] = brk.start.split(':').map(Number);
                  const [eH, eM] = brk.end.split(':').map(Number);
                  return subtractIntervals({ start: sH + sM / 60, end: eH + eM / 60 }, availableIntervals);
                }) : [];

                return (
                  <div key={barber.id} className="relative">
                    <div
                      className="relative h-full"
                      ref={(el: HTMLDivElement | null) => { gridRefs.current[barber.id] = el; }}
                      onMouseMove={(e) => handleMouseMove(e, barber.id)}
                      onMouseLeave={handleMouseLeave}
                      onClick={(e) => handleClickSlot(e)}
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
                            text="Día libre"
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
                      <div
                        ref={(el: HTMLDivElement | null) => { hoverPopoverRefs.current[barber.id] = el; }}
                        className="absolute w-full p-2 rounded-lg bg-primary/10 border border-primary/50 pointer-events-none transition-all duration-75 z-20"
                        style={{ opacity: 0 }}
                      >
                        <p className="text-xs font-bold text-primary flex items-center">
                          <Plus className="w-3 h-3 mr-1" />
                          <span ref={(el: HTMLSpanElement | null) => { hoverPopoverTextRefs.current[barber.id] = el; }}></span>
                        </p>
                      </div>

                      {/* Click Popover */}
                      {popoverState?.barberId === barber.id && (
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
                                <>
                                  <Button variant="ghost" className="w-full justify-start h-8" onClick={handleOpenBlockModal}><Lock className="w-4 h-4 mr-2" /> Bloquear horario</Button>
                                  {canSee('bloquear_horarios') && (
                                    <Button variant="ghost" className="w-full justify-start h-8" onClick={handleOpenEnableScheduleFromPopover}><Clock className="w-4 h-4 mr-2" /> Habilitar horario especial</Button>
                                  )}
                                </>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Events */}
                      {eventsWithLayout
                        .filter(event => {
                          if ((event as any).originalType === 'available') return false;
                          if (event.type === 'block') return event.barbero_id === barber.id;
                          if (event.type === 'appointment') {
                            if ((event as any).target_barber_id) return (event as any).target_barber_id === barber.id;
                            return event.items?.some((i: SaleItem) => i.tipo !== 'producto' && i.barbero_id === barber.id);
                          }
                          return false;
                        })
                        .map((event: AgendaEvent, evIdx: number) => (
                          <Tooltip key={`${event.id}-${(event as any).target_barber_id || ''}-${evIdx}`}>
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
                                  "absolute rounded-lg border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg flex items-center justify-between text-left p-1.5 overflow-hidden cursor-pointer select-none",
                                  (event as any).isSandbox && "ring-2 ring-blue-500/80 shadow-[0_0_12px_rgba(59,130,246,0.35)]",
                                  event.layout.isMinimized
                                    ? ((event as any).estado === 'No asiste'
                                      ? "bg-orange-500/20 border-orange-500 text-orange-800 dark:text-orange-200 z-15"
                                      : "bg-gray-500/20 border-gray-400 text-gray-700 dark:text-gray-300 opacity-80 z-15")
                                    : (event.layout.isPendingDeposit
                                      ? "bg-red-500/20 dark:bg-red-950/40 border-2 border-dashed border-red-500 text-red-950 dark:text-red-100 opacity-90 backdrop-blur-[2px] shadow-sm z-15"
                                      : event.color),
                                  !event.layout.isMinimized && (event.type === 'appointment' ? 'z-20' : 'z-10'),
                                  (event.type === 'appointment' &&
                                    !event.layout.isMinimized &&
                                    event.pago_estado !== 'Pagado' &&
                                    (event as any).estado !== 'No asiste' &&
                                    (event as any).estado !== 'En espera' &&
                                    !Boolean(
                                      event.canal_reserva?.includes('chatbot') ||
                                      event.origen?.includes('chatbot') ||
                                      event.canal_reserva?.includes('janet') ||
                                      event.origen?.includes('janet') ||
                                      event.canal_reserva?.includes('app') ||
                                      event.origen?.includes('app') ||
                                      String((event as any).notas || '').toLowerCase().includes('asistente virtual') ||
                                      String((event as any).notas || '').toLowerCase().includes('app vatos alfa')
                                    ) && (
                                      (whatsappConfirmationAnimation && !event.whatsappConfirmationSent && !(event as any).confirmationSentViaApp) ||
                                      (whatsappReminderAnimation && !event.whatsappReminderSent && !(event as any).chatReminderSent)
                                    )) && "animate-pending-notification"
                                )}
                                style={{ ...calculatePosition(event.start, event.duration), width: `calc(${event.layout.width}% - 2px)`, left: `${event.layout.left}%` }}
                              >
                                {event.layout.isMinimized ? (
                                  <div className="flex items-center justify-center h-full w-full overflow-hidden px-0.5 text-center">
                                    <span className="text-[10px] sm:text-[11px] font-bold truncate uppercase tracking-tighter" title={(event as any).estado === 'No asiste' ? 'No Asistió' : 'Cancelado'}>
                                      {(event as any).estado === 'No asiste' ? 'No Asistió' : 'Cancelado'}
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <div className={cn(
                                      "flex-grow overflow-hidden min-w-0 pr-1",
                                      event.layout.isPendingDeposit
                                        ? "pr-12"
                                        : (((event as any).items?.some((i: SaleItem) => i.tipo === 'producto') && ((event as any).pago_estado === 'Pagado' || (event as any).pago_estado === 'deposit_paid'))
                                          ? "pr-28"
                                          : ((event as any).items?.some((i: SaleItem) => i.tipo === 'producto') || (event as any).pago_estado === 'Pagado' || (event as any).pago_estado === 'deposit_paid')
                                            ? "pr-20"
                                            : "pr-14")
                                    )}>
                                      <p className="font-bold text-xs truncate leading-tight">{event.type === 'appointment' ? formatClientName(event.customer?.nombre, event.customer?.apellido) : event.motivo}</p>
                                    </div>

                                    {event.type === 'appointment' && (
                                      <div className="absolute top-0 right-0 h-full flex items-center shrink-0 pointer-events-none gap-1">
                                        {/* Origin & Confirmation Icons */}
                                        <div className="flex items-center gap-1 h-full px-1.5 shrink-0">
                                          {(event as any).isSandbox && (
                                            <span className="text-[9px] font-black px-1 py-0.5 bg-blue-500/25 text-blue-300 border border-blue-500/50 rounded tracking-tighter" title="Cita Simulada de Prueba (Sandbox)">
                                              TEST
                                            </span>
                                          )}
                                          {(() => {
                                            const canal = String(event.canal_reserva || '').toLowerCase();
                                            const origen = String(event.origen || '').toLowerCase();
                                            const notas = String((event as any).notas || '').toLowerCase();
                                            const isJanet =
                                              canal.includes('chatbot') ||
                                              canal.includes('janet') ||
                                              origen.includes('chatbot') ||
                                              origen.includes('janet') ||
                                              notas.includes('asistente virtual');
                                            const isAppClient =
                                              !isJanet &&
                                              (canal.includes('app') ||
                                                canal.includes('mobile') ||
                                                origen.includes('app') ||
                                                origen.includes('mobile') ||
                                                notas.includes('app vatos alfa'));
                                            const isWeb =
                                              !isJanet &&
                                              !isAppClient &&
                                              (canal.startsWith('web_publica') ||
                                                origen.startsWith('web_publica') ||
                                                canal === 'online' ||
                                                origen === 'online');

                                            return (
                                              <>
                                                {isWeb && (
                                                  <span title="Agendado desde la Página Web" className="shrink-0 flex items-center">
                                                    <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                                                  </span>
                                                )}
                                                {isAppClient && (
                                                  <span title="Agendado desde la App por el cliente" className="shrink-0 flex items-center">
                                                    <Smartphone className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                                  </span>
                                                )}
                                                {isJanet && (
                                                  <span title="Agendado por Janet desde el Chat de la App" className="shrink-0 flex items-center">
                                                    <img
                                                      src="/janet-avatar.png"
                                                      alt="Janet"
                                                      className="w-4 h-4 rounded-full object-cover ring-1 ring-blue-500 shrink-0"
                                                    />
                                                  </span>
                                                )}
                                                {((event.professional_lock === true) ||
                                                  (event.professional_lock === undefined && (isWeb || isAppClient || isJanet))) && (
                                                  <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                )}
                                              </>
                                            );
                                          })()}
                                          {(event as any).confirmada_por_cliente && (
                                            <span title="Cita confirmada por el cliente" className="shrink-0 flex items-center">
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                            </span>
                                          )}
                                        </div>

                                        {/* Product Indicator (Blue) - Left of A */}
                                        {event.items?.some((i: SaleItem) => i.tipo === 'producto') && (
                                          <div className="h-full px-2 flex items-center justify-center bg-blue-600 shrink-0 rounded-l-sm">
                                            <span className="text-white font-bold text-[10px] leading-none">P</span>
                                          </div>
                                        )}

                                        {/* Payment Status Indicator (A/$) - Right */}
                                        {(event.pago_estado === 'Pagado' || (event.pago_estado === 'deposit_paid' && Number(event.anticipo_pagado || (event as any).anticipoPagado || (event as any).monto_pagado_real || (event as any).monto_pagado || event.monto_anticipo || 0) > 0)) && (
                                          <div className={cn(
                                            "h-full px-2 flex items-center justify-center min-w-[20px] shrink-0",
                                            event.pago_estado === 'Pagado' ? 'bg-green-500' : 'bg-orange-500'
                                          )}>
                                            {event.pago_estado === 'deposit_paid' ? (
                                              <span className="text-black font-bold text-[10px] leading-none">A</span>
                                            ) : (
                                              <DollarSign className="h-3 w-3 text-black font-bold" />
                                            )}
                                          </div>
                                        )}

                                        {event.layout.isPendingDeposit && (
                                          <div className="h-full pr-1.5 flex items-center justify-center shrink-0" title="Esperando pago de anticipo (20 min tolerancia)">
                                            <Hourglass className="h-3.5 w-3.5 text-red-600 dark:text-red-400 animate-pulse" />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </TooltipTrigger>
                            {event.type === 'appointment' ? (
                              <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border">
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start">
                                    <p className="font-bold text-base text-foreground">{formatClientName(event.customer?.nombre, event.customer?.apellido)}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {(() => {
                                        const canal = String(event.canal_reserva || '').toLowerCase();
                                        const origen = String(event.origen || '').toLowerCase();
                                        const notas = String((event as any).notas || '').toLowerCase();
                                        const isJanet =
                                          canal.includes('chatbot') ||
                                          canal.includes('janet') ||
                                          origen.includes('chatbot') ||
                                          origen.includes('janet') ||
                                          notas.includes('asistente virtual');
                                        const isAppClient =
                                          !isJanet &&
                                          (canal.includes('app') ||
                                            canal.includes('mobile') ||
                                            origen.includes('app') ||
                                            origen.includes('mobile') ||
                                            notas.includes('app vatos alfa'));
                                        const isWeb =
                                          !isJanet &&
                                          !isAppClient &&
                                          (canal.startsWith('web_publica') ||
                                            origen.startsWith('web_publica') ||
                                            canal === 'online' ||
                                            origen === 'online');

                                        return (
                                          <>
                                            {isWeb && (
                                              <Badge variant="secondary" className="text-[10px] h-5 px-1">
                                                <Globe className="w-3 h-3 mr-1" /> Web
                                              </Badge>
                                            )}
                                            {isAppClient && (
                                              <Badge variant="secondary" className="text-[10px] h-5 px-1 text-sky-500 border-sky-500/30 bg-sky-500/10">
                                                <Smartphone className="w-3 h-3 mr-1" /> App
                                              </Badge>
                                            )}
                                            {isJanet && (
                                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 text-blue-500 border-blue-500/30 bg-blue-500/10">
                                                <img src="/janet-avatar.png" alt="Janet" className="w-3.5 h-3.5 rounded-full object-cover mr-1" /> Janet
                                              </Badge>
                                            )}
                                          </>
                                        );
                                      })()}
                                      {(event as any).confirmada_por_cliente && (
                                        <Badge variant="outline" className="text-[10px] h-5 px-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-600 font-semibold">
                                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" /> Confirmada
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{event.items ? event.items.map(i => i.nombre || i.servicio).join(', ') : event.servicio}</p>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Clock className="w-4 h-4" />
                                    <span>{formatHour(event.start)} - {formatHour(event.end)}</span>
                                  </div>
                                  {event.layout.isPendingDeposit ? (
                                    <div className="space-y-1 pt-1.5 border-t border-border/50">
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
                                        <Hourglass className="w-3.5 h-3.5 shrink-0" />
                                        <span>Pendiente de pago de anticipo</span>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground leading-snug">
                                        {`⏱ Tolerancia: quedan ${event.layout.depositMinutesRemaining ?? 20} min para recibir el anticipo y confirmarse formalmente.`}
                                      </p>
                                    </div>
                                  ) : (
                                    event.pago_estado && (
                                      <div className="flex items-center gap-2 text-sm">
                                        {event.pago_estado === 'deposit_paid' && Number(event.anticipo_pagado || (event as any).anticipoPagado || (event as any).monto_pagado_real || (event as any).monto_pagado || event.monto_anticipo || 0) > 0 ? (
                                          <span className="font-bold text-orange-500">A</span>
                                        ) : (
                                          <DollarSign className={cn("w-4 h-4", event.pago_estado === 'Pagado' ? 'text-green-600' : 'text-slate-400')} />
                                        )}
                                        <span className={cn(
                                          event.pago_estado === 'Pagado' ? 'text-green-600' :
                                            (event.pago_estado === 'deposit_paid' && Number(event.anticipo_pagado || (event as any).anticipoPagado || (event as any).monto_pagado_real || (event as any).monto_pagado || event.monto_anticipo || 0) > 0) ? 'text-orange-600 font-medium' :
                                              'text-slate-400'
                                        )}>
                                          {event.pago_estado === 'Pagado' ? 'Pago completo' :
                                            (event.pago_estado === 'deposit_paid' && Number(event.anticipo_pagado || (event as any).anticipoPagado || (event as any).monto_pagado_real || (event as any).monto_pagado || event.monto_anticipo || 0) > 0) ? 'Anticipo pagado' :
                                              'Pago pendiente'}
                                        </span>
                                      </div>
                                    )
                                  )}
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
            </>
          )}
          </div>
        </div>
      </div>

      {isReservationModalOpen && (
        <NewReservationForm
          isOpen={isReservationModalOpen}
          onOpenChange={setIsReservationModalOpen}
          isDialogChild={false}
          onFormSubmit={onDataRefresh}
          initialData={reservationInitialData}
          isEditMode={!!reservationInitialData?.id}
          isSandboxMode={isLocalhost && sandboxViewMode !== 'real_only'}
        />
      )}

      {isBlockScheduleModalOpen && (
        <BlockScheduleForm
          isOpen={isBlockScheduleModalOpen}
          onOpenChange={setIsBlockScheduleModalOpen}
          onFormSubmit={onDataRefresh}
          initialData={blockInitialData}
        />
      )}

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
            onRegisterDeposit={handleRegisterDeposit}
          />
        )
      }

      {selectedClientForModal && (
        <ClientDetailModal
          client={selectedClientForModal}
          isOpen={isClientDetailModalOpen}
          onOpenChange={setIsClientDetailModalOpen}
          onClientUpdated={(updatedClient) => {
            setSelectedClientForModal(updatedClient);
          }}
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
      {isEnableScheduleModalOpen && (
        <EnableScheduleModal
          isOpen={isEnableScheduleModalOpen}
          onOpenChange={setIsEnableScheduleModalOpen}
          onFormSubmit={onDataRefresh}
          initialData={enableScheduleInitialData}
        />
      )}
      {!isStaff && (
        <QuickConsultModal
          isOpen={isQuickConsultOpen}
          onClose={() => setIsQuickConsultOpen(false)}
          services={services || []}
          professionals={filteredProfessionals}
          reservations={reservations || []}
          timeBlocks={timeBlocks || []}
          date={date}
          onSelectSlot={handleSelectQuickConsultSlot}
          specialJourneys={specialJourneys || []}
          localSchedule={selectedLocal?.schedule}
        />
      )}
      <BookingRulesCheatSheetModal
        isOpen={isBookingRulesModalOpen}
        onClose={() => setIsBookingRulesModalOpen(false)}
      />
    </TooltipProvider >
  );
}

