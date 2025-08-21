

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
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, Eye, Plus, Lock, Pencil, Mail, User, Circle, Trash2 } from 'lucide-react';
import { format, addMinutes, subDays, isToday, parse, getHours, getMinutes, set, getDay, addDays as dateFnsAddDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Profesional, Client, Service, ScheduleDay, Reservation, Local, TimeBlock } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CancelReservationModal } from '../reservations/cancel-reservation-modal';
import { Label } from '../ui/label';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';


const HOURLY_SLOT_HEIGHT = 48; // Each hour slot is 48px tall

const useCurrentTime = () => {
    const [time, setTime] = useState<Date | null>(null);

    useEffect(() => {
        setTime(new Date());
        const timer = setInterval(() => {
            setTime(new Date());
        }, 60000); // Update every minute

        return () => clearInterval(timer);
    }, []);

    return time;
};

const NonWorkBlock = ({ top, height, text }: { top: number, height: number, text: string }) => (
    <div
      className="absolute w-full bg-striped-gray flex items-center justify-center p-2 z-0"
      style={{ top: `${top}px`, height: `${height}px` }}
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
        case 'Pendiente':
            return 'bg-red-300/80 border-red-500 text-red-900';
        case 'En espera':
            return 'bg-indigo-300/80 border-indigo-500 text-indigo-900';
        case 'Cancelado':
            return 'bg-gray-300/80 border-gray-500 text-gray-800 line-through';
        default:
            return 'bg-gray-200/80 border-gray-500 text-gray-800';
    }
}


export default function AgendaView() {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [hoveredBarberId, setHoveredBarberId] = useState<string | null>(null);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(60);
  const [selectedProfessionalFilter, setSelectedProfessionalFilter] = useState('todos');
  const { selectedLocalId, setSelectedLocalId } = useLocal();
  const { user } = useAuth();

  const [hoveredSlot, setHoveredSlot] = useState<{barberId: string, time: string} | null>(null);
  const [popoverState, setPopoverState] = useState<{barberId: string, time: string} | null>(null);
  
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

  const gridRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  const currentTime = useCurrentTime();
  const [isClientMounted, setIsClientMounted] = useState(false);
  const { toast } = useToast();
  
  const [queryKey, setQueryKey] = useState(0);

  useEffect(() => {
    setIsClientMounted(true)
    setDate(new Date());
  }, []);

  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  useEffect(() => {
    // Let the auth context set the localId if needed.
    // If user is general admin and no local is selected, select the first one.
    if (!user?.local_id && !selectedLocalId && locales.length > 0) {
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
  
  const reservationsQueryKey = useMemo(() => `reservations-${date ? format(date, 'yyyy-MM-dd') : ''}-${selectedLocalId}-${queryKey}`, [date, queryKey, selectedLocalId]);
  const blocksQueryKey = useMemo(() => `blocks-${date ? format(date, 'yyyy-MM-dd') : ''}-${selectedLocalId}-${queryKey}`, [date, queryKey, selectedLocalId]);

  const { data: reservations } = useFirestoreQuery<Reservation>('reservas', reservationsQueryKey, ...(reservationsQueryConstraint || []));
  const { data: timeBlocks } = useFirestoreQuery<TimeBlock>('bloqueos_horario', blocksQueryKey, ...(reservationsQueryConstraint || []));
  
  const isLoading = professionalsLoading || clientsLoading || servicesLoading || localesLoading;

  const filteredProfessionals = useMemo(() => {
    const professionalsOfLocal = professionals.filter(p => p.local_id === selectedLocalId);
    if (selectedProfessionalFilter === 'todos') {
      return professionalsOfLocal;
    }
    return professionalsOfLocal.filter(p => p.id === selectedProfessionalFilter);
  }, [professionals, selectedProfessionalFilter, selectedLocalId]);

  const refreshData = () => setQueryKey(prev => prev + 1);

  const allEvents = useMemo(() => {
    if (!reservations || !timeBlocks || !clients || !professionals) return [];

    const clientMap = new Map(clients.map(c => [c.id, c]));
    const professionalMap = new Map(professionals.map(p => [p.id, p.name]));

    const appointmentEvents = reservations.map(res => {
        const [startH, startM] = res.hora_inicio.split(':').map(Number);
        const [endH, endM] = res.hora_fin.split(':').map(Number);
        const start = startH + startM / 60;
        const end = endH + endM / 60;
        
        return {
            ...res,
            customer: clientMap.get(res.cliente_id),
            professionalNames: res.items?.map(i => professionalMap.get(i.barbero_id)).filter(Boolean).join(', ') || 'N/A',
            start: start,
            duration: Math.max(0.5, end - start),
            color: getStatusColor(res.estado),
            type: 'appointment'
        };
    });

    const blockEvents = timeBlocks.map(block => {
        const [startH, startM] = block.hora_inicio.split(':').map(Number);
        const [endH, endM] = block.hora_fin.split(':').map(Number);
        const start = startH + startM / 60;
        const end = endH + endM / 60;
        return {
          ...block,
          id: block.id,
          barbero_id: block.barbero_id,
          customer: { nombre: block.motivo },
          service: 'Bloqueado',
          start: start,
          duration: Math.max(0.5, end - start),
          color: 'bg-striped-gray border-gray-400 text-gray-600',
          type: 'block',
        };
      });

      return [...appointmentEvents, ...blockEvents];
  }, [reservations, timeBlocks, clients, professionals]);

  
  const handleSetToday = () => setDate(new Date());
  const handlePrevDay = () => setDate(d => subDays(d || new Date(), 1));
  const handleNextDay = () => setDate(d => dateFnsAddDays(d || new Date(), 1));

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>, barberId: string) => {
    const gridEl = gridRefs.current[barberId];
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    const totalMinutesInGrid = (endHour - startHour) * 60;
    const gridHeight = (HOURLY_SLOT_HEIGHT * totalMinutesInGrid) / 60;

    const minutesSinceStart = (y / gridHeight) * totalMinutesInGrid;
    const slotIndex = Math.floor(minutesSinceStart / slotDurationMinutes);
    const time = format(addMinutes(set(new Date(), { hours: startHour, minutes: 0 }), slotIndex * slotDurationMinutes), 'HH:mm');

    if (slotIndex < 0 || slotIndex >= timeSlots.length -1) {
        setHoveredSlot(null);
        return;
    }
    
    setHoveredSlot({ barberId, time });
  }

  const handleMouseLeave = () => {
    setHoveredSlot(null);
  }

  const handleClickSlot = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if(hoveredSlot) {
      setPopoverState(hoveredSlot)
    } else {
      setPopoverState(null)
    }
  }

  const handleOpenReservationModal = () => {
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
  
  const handleOpenDetailModal = (event: any) => {
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
    if (!selectedReservation || !clients || !services) return;
    const client = clients.find(c => c.id === selectedReservation.cliente_id);
    if (client && selectedReservation.items) {
        const cartItems = selectedReservation.items.map(item => {
            const service = services.find(s => s.name === item.servicio || s.id === (item as any).id);
            return service ? { ...service, barbero_id: item.barbero_id, nombre: service.name } : null;
        }).filter((i): i is Service & { barbero_id: string } => !!i);

        setSaleInitialData({
            client,
            items: cartItems,
            reservationId: selectedReservation.id,
            local_id: selectedReservation.local_id
        });
        setIsDetailModalOpen(false);
        setIsSaleSheetOpen(true);
    }
  }
  
  const handleUpdateStatus = async (reservationId: string, newStatus: string) => {
    try {
        const resRef = doc(db, 'reservas', reservationId);
        await updateDoc(resRef, { estado: newStatus });
        toast({ title: 'Estado actualizado', description: `La reserva ahora está en estado: ${newStatus}`});
        if(selectedReservation) {
            setSelectedReservation({...selectedReservation, estado: newStatus})
        }
    } catch(err) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.'})
    }
  };
  
  const handleCancelReservation = async (reservationId: string) => {
    try {
        await deleteDoc(doc(db, 'reservas', reservationId));
        toast({
            title: "Reserva eliminada con éxito",
        });
        setIsCancelModalOpen(false);
        refreshData();
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
    if (!blockToDelete) return;
    try {
      await deleteDoc(doc(db, "bloqueos_horario", blockToDelete.id));
      toast({
        title: "Horario desbloqueado",
        description: `El bloqueo para "${blockToDelete.motivo}" ha sido eliminado.`,
      });
      refreshData();
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
    const totalMinutesInGrid = (endHour - startHour) * 60;
    const gridHeight = (HOURLY_SLOT_HEIGHT * totalMinutesInGrid) / 60;

    const minutesFromAgendaStart = (startDecimal - startHour) * 60;
    const top = (minutesFromAgendaStart / totalMinutesInGrid) * gridHeight;
    const height = (durationDecimal * 60 / totalMinutesInGrid) * gridHeight;
    
    return { top: `${top}px`, height: `${height}px` };
  };
  
  const calculatePopoverPosition = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const startDecimal = hour + minute / 60;

    const totalMinutesInGrid = (endHour - startHour) * 60;
    const gridHeight = (HOURLY_SLOT_HEIGHT * totalMinutesInGrid) / 60;
    const minutesFromAgendaStart = (startDecimal - startHour) * 60;
    const top = (minutesFromAgendaStart / totalMinutesInGrid) * gridHeight;

    return { top: `${top}px`, height: `${HOURLY_SLOT_HEIGHT / (60 / slotDurationMinutes)}px`};
  }

  const calculateCurrentTimePosition = () => {
    if (!currentTime) return -1;
    const totalMinutesNow = currentTime.getHours() * 60 + currentTime.getMinutes();
    const totalMinutesStart = startHour * 60;
    if (totalMinutesNow < totalMinutesStart || totalMinutesNow > endHour * 60) return -1;
    
    const totalMinutesInGrid = (endHour - startHour) * 60;
    const gridHeight = (HOURLY_SLOT_HEIGHT * totalMinutesInGrid) / 60;

    const elapsedMinutes = totalMinutesNow - totalMinutesStart;
    return (elapsedMinutes / totalMinutesInGrid) * gridHeight;
  }

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

  const currentTimeTop = calculateCurrentTimePosition();

  return (
    <TooltipProvider>
      <div className="grid grid-cols-[288px_1fr] h-full bg-muted/40 gap-2">
        {/* Left Panel */}
        <aside className="bg-white border-r flex flex-col">
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
                  {professionals.map(prof => (
                    <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isClientMounted && (
              <div className="flex justify-center">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    className="rounded-md border mx-4"
                    locale={es}
                />
              </div>
          )}
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
            {/* Agenda Header */}
            <div className="flex-shrink-0 flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={handleSetToday}>Hoy</Button>
                    <div className='flex items-center gap-2'>
                        <Button variant="ghost" size="icon" onClick={handlePrevDay}><ChevronLeft className="h-5 w-5" /></Button>
                        <Button variant="ghost" size="icon" onClick={handleNextDay}><ChevronRight className="h-5 w-5" /></Button>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold capitalize">{selectedDateFormatted}</h2>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Store className='w-4 h-4'/> {selectedLocal?.name || 'Cargando...'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-grow flex flex-col overflow-hidden">
                <ScrollArea className="flex-grow" orientation="both">
                    <div className="grid gap-2" style={{gridTemplateColumns: `96px repeat(${filteredProfessionals.length}, minmax(200px, 1fr))`}}>
                        
                        {/* Top-left empty cell & time interval selector */}
                        <div className="flex-shrink-0 sticky top-0 left-0 z-30">
                             <div className="h-28 flex items-center justify-center p-2 border-b">
                                <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon"><Clock className="h-5 w-5"/></Button>
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

                        {/* Professional Headers */}
                        {filteredProfessionals.map(barber => (
                            <div key={barber.id} className="flex-shrink-0 sticky top-0 z-20 p-2 h-28 flex flex-col items-center justify-center">
                                <Avatar className="h-[60px] w-[60px]">
                                    <AvatarImage src={barber.avatar} alt={barber.name} data-ai-hint={barber.dataAiHint} />
                                    <AvatarFallback>{barber.name.substring(0, 2)}</AvatarFallback>
                                </Avatar>
                                <p className="font-semibold text-sm text-center mt-2">{barber.name}</p>
                            </div>
                        ))}

                        {/* Time Column */}
                        <div className="flex-shrink-0 sticky left-0 z-20">
                             <div className="flex flex-col">
                                {timeSlots.slice(0, -1).map((time, index) => (
                                    <div key={index} style={{ height: `${HOURLY_SLOT_HEIGHT}px`}} className="bg-white border-b flex items-center justify-center text-center">
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
                                const [startH] = daySchedule.start.split(':').map(Number);
                                const [endH] = daySchedule.end.split(':').map(Number);
                                barberStartHour = startH;
                                barberEndHour = endH;
                            }
                            
                            return (
                            <div key={barber.id} className="relative">
                                <div 
                                    className="relative"
                                    ref={el => gridRefs.current[barber.id] = el}
                                    onMouseMove={(e) => isWorking && handleMouseMove(e, barber.id)}
                                    onMouseLeave={handleMouseLeave}
                                    onClick={(e) => isWorking && handleClickSlot(e)}
                                >
                                    {/* Background Grid Cells */}
                                    <div className="flex flex-col">
                                        {timeSlots.slice(0, -1).map((time, index) => (
                                            <div key={index} style={{ height: `${HOURLY_SLOT_HEIGHT}px`}} className="bg-white border-b" />
                                        ))}
                                    </div>
                                    
                                     {/* Hover Popover */}
                                    {isWorking && hoveredSlot?.barberId === barber.id && (
                                        <div
                                            className="absolute w-full p-2 rounded-lg bg-primary/10 border border-primary/50 pointer-events-none transition-all duration-75 z-20"
                                            style={{...calculatePopoverPosition(hoveredSlot.time)}}
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
                                            style={{top: calculatePopoverPosition(popoverState.time).top}}
                                            onClick={(e) => e.stopPropagation()}
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
                                    {allEvents.filter(event => (event.type === 'block' && event.barbero_id === barber.id) || (event.type === 'appointment' && event.items?.some(i => i.barbero_id === barber.id))).map(event => (
                                        <Tooltip key={event.id}>
                                        <TooltipTrigger asChild>
                                            <div
                                                onClick={(e) => { e.stopPropagation(); if (event.type === 'appointment') { handleOpenDetailModal(event as Reservation); } else if (event.type === 'block') { setBlockToDelete(event as TimeBlock); } }}
                                                className={cn("absolute w-[calc(100%_-_2px)] left-[1px] rounded-lg border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex items-center justify-between text-left p-2 z-10 overflow-hidden", (event as any).color)} 
                                                style={calculatePosition((event as any).start, (event as any).duration)}
                                            >
                                               <div className="flex-grow overflow-hidden pr-1">
                                                    <p className="font-bold text-xs truncate leading-tight">{event.type === 'appointment' ? ((event as any).customer?.nombre || 'Cliente Eliminado') : (event as any).motivo}</p>
                                                </div>
                                                {(event.type === 'appointment' && (event as Reservation).pago_estado === 'Pagado') && (
                                                     <div className="absolute top-0 right-0 h-full w-6 bg-green-500 flex items-center justify-center">
                                                        <DollarSign className="h-4 w-4 text-black font-bold" />
                                                    </div>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        {event.type === 'appointment' ? (
                                            <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border">
                                                <div className="space-y-2">
                                                    <p className="font-bold text-base text-foreground">{((event as any).customer?.nombre || 'Cliente Eliminado')}</p>
                                                    <p className="text-sm text-muted-foreground">{event.items ? event.items.map(i => i.nombre || i.servicio).join(', ') : (event as any).servicio}</p>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Clock className="w-4 h-4" />
                                                        <span>{formatHour((event as any).start)} - {formatHour((event as any).start + (event as any).duration)}</span>
                                                    </div>
                                                    {(event as Reservation).pago_estado &&
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <DollarSign className="w-4 h-4" />
                                                            <span className={cn(
                                                                (event as Reservation).pago_estado === 'Pagado' ? 'text-green-600' : 'text-yellow-600'
                                                            )}>
                                                                {(event as Reservation).pago_estado === 'Pagado' ? 'Pago asociado' : 'Pago pendiente'}
                                                            </span>
                                                        </div>
                                                    }
                                                </div>
                                            </TooltipContent>
                                        ) : (
                                            <TooltipContent><p>Horario Bloqueado: {(event as any).customer.nombre}</p></TooltipContent>
                                        )}
                                        </Tooltip>
                                    ))}
                                </div>
                            </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </div>
        </div>
      </div>
      
      <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
          <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
            <NewReservationForm
              isDialogChild
              onFormSubmit={refreshData}
              initialData={reservationInitialData}
              isEditMode={!!reservationInitialData?.id}
            />
          </DialogContent>
      </Dialog>
      
      <BlockScheduleForm
        isOpen={isBlockScheduleModalOpen}
        onOpenChange={setIsBlockScheduleModalOpen}
        onFormSubmit={refreshData}
        initialData={blockInitialData}
      />
      
      {selectedReservation && (
          <ReservationDetailModal
            reservation={selectedReservation}
            isOpen={isDetailModalOpen}
            onOpenChange={setIsDetailModalOpen}
            onPay={handlePayFromDetail}
            onUpdateStatus={handleUpdateStatus}
            onEdit={handleEditFromDetail}
          />
      )}
      
      <NewSaleSheet 
        isOpen={isSaleSheetOpen} 
        onOpenChange={setIsSaleSheetOpen}
        initialData={saleInitialData}
        onSaleComplete={refreshData}
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
                    <AlertDialogTitle>¿Desbloquear Horario?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Se eliminará el bloqueo "{blockToDelete.motivo}" de la agenda de este profesional. ¿Estás seguro?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteBlock}>
                        Sí, desbloquear
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </TooltipProvider>
  );
}
