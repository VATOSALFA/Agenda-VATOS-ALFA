

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
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, Eye, Plus, Lock, Pencil, Mail, User, Circle, Trash2 } from 'lucide-react';
import { format, addDays, subDays, isToday, parse, getHours, getMinutes, set, getDay, addMinutes } from 'date-fns';
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
import type { Profesional, Client, Service, ScheduleDay, Reservation, Local } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CancelReservationModal } from '../reservations/cancel-reservation-modal';


const HOURLY_SLOT_HEIGHT = 48; // Each hour slot is 48px tall

interface TimeBlock {
    id: string;
    barbero_id: string;
    motivo: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    type?: 'block';
    customer?: string;
    start?: number;
    duration?: number;
    color?: string;
}

const useCurrentTime = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date());
        }, 60000); // Update every minute

        return () => clearInterval(timer);
    }, []);

    return time;
};

const NonWorkBlock = ({ top, height, text }: { top: number, height: number, text: string }) => (
    <div
      className="absolute w-full bg-gray-100 flex items-center justify-center p-2 z-0"
      style={{ top: `${top}px`, height: `${height}px` }}
    >
        <p className="text-xs text-center font-medium text-gray-400">{text}</p>
    </div>
);

const getStatusColor = (status: string | undefined) => {
    switch (status) {
        case 'Reservado':
            return 'bg-blue-100 border-blue-500 text-blue-800';
        case 'Confirmado':
            return 'bg-yellow-100 border-yellow-500 text-yellow-800';
        case 'Asiste':
        case 'Pagado':
            return 'bg-green-100 border-green-500 text-green-800';
        case 'No asiste':
            return 'bg-orange-100 border-orange-500 text-orange-800';
        case 'Pendiente':
            return 'bg-red-100 border-red-500 text-red-800';
        case 'En espera':
            return 'bg-pink-100 border-pink-500 text-pink-800';
        case 'Cancelado':
            return 'bg-gray-200 border-gray-500 text-gray-800 line-through';
        default:
            return 'bg-gray-100 border-gray-500 text-gray-800';
    }
}


export default function AgendaView() {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [hoveredBarberId, setHoveredBarberId] = useState<string | null>(null);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);

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
  const [renderTimeIndicator, setRenderTimeIndicator] = useState(false);
  const { toast } = useToast();
  
  const [queryKey, setQueryKey] = useState(0);

  useEffect(() => {
    setDate(new Date());
    setRenderTimeIndicator(true)
  }, []);

  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  useEffect(() => {
    if (!selectedLocalId && locales.length > 0) {
      setSelectedLocalId(locales[0].id);
    }
  }, [locales, selectedLocalId]);

  const selectedLocal = useMemo(() => {
    if (!selectedLocalId || locales.length === 0) return null;
    return locales.find(l => l.id === selectedLocalId) || locales[0];
  }, [selectedLocalId, locales]);
  
  const { timeSlots, startHour, endHour } = useMemo(() => {
    if (!selectedLocal || !selectedLocal.schedule) {
      return { timeSlots: [], startHour: 10, endHour: 20 };
    }
    const dayOfWeek = date ? format(date, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : 'lunes';
    const daySchedule = selectedLocal.schedule[dayOfWeek as keyof typeof selectedLocal.schedule] || selectedLocal.schedule.lunes;
    
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
    if (!date) return undefined;
    return where('fecha', '==', format(date, 'yyyy-MM-dd'));
  }, [date]);
  
  const reservationsQueryKey = useMemo(() => `reservations-${date ? format(date, 'yyyy-MM-dd') : ''}-${queryKey}`, [date, queryKey]);
  const blocksQueryKey = useMemo(() => `blocks-${date ? format(date, 'yyyy-MM-dd') : ''}-${queryKey}`, [date, queryKey]);

  const { data: reservations } = useFirestoreQuery<Reservation>('reservas', reservationsQueryKey, reservationsQueryConstraint);
  const { data: timeBlocks } = useFirestoreQuery<TimeBlock>('bloqueos_horario', blocksQueryKey, reservationsQueryConstraint);
  
  const isLoading = professionalsLoading || clientsLoading || servicesLoading || localesLoading;

  const refreshData = () => setQueryKey(prev => prev + 1);

  const allEvents = useMemo(() => {
    if (!reservations || !timeBlocks || !clients) return [];

    const clientMap = new Map(clients.map(c => [c.id, c]));

    const appointmentEvents = reservations.map(res => {
        const [startH, startM] = res.hora_inicio.split(':').map(Number);
        const [endH, endM] = res.hora_fin.split(':').map(Number);
        const start = startH + startM / 60;
        const end = endH + endM / 60;
        
        return {
            ...res,
            customer: clientMap.get(res.cliente_id)?.nombre || 'Cliente Desconocido',
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
          barberId: block.barbero_id,
          customer: block.motivo,
          service: 'Bloqueado',
          start: start,
          duration: Math.max(0.5, end - start),
          color: 'bg-striped-gray border-gray-400 text-gray-600',
          type: 'block',
        };
      });

      return [...appointmentEvents, ...blockEvents];
  }, [reservations, timeBlocks, clients]);

  
  const handleSetToday = () => setDate(new Date());
  const handlePrevDay = () => setDate(d => subDays(d || new Date(), 1));
  const handleNextDay = () => setDate(d => addDays(d || new Date(), 1));

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>, barberId: string) => {
    const gridEl = gridRefs.current[barberId];
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    const minutesSinceStart = (y / HOURLY_SLOT_HEIGHT) * 60;
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
      const fullReservation = reservations.find(r => r.id === event.id)
      if (fullReservation) {
        setSelectedReservation({ ...fullReservation, customer: event.customer });
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
    const service = services.find(s => s.name === selectedReservation.servicio);
    if (client && service) {
        setSaleInitialData({
            client,
            items: [{...service, tipo: 'servicio'}]
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
        const resRef = doc(db, 'reservas', reservationId);
        await updateDoc(resRef, { estado: 'Cancelado' });
        toast({
            title: "Reserva cancelada con éxito",
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
    const minutesFromAgendaStart = (startDecimal - startHour) * 60;
    const top = (minutesFromAgendaStart / slotDurationMinutes) * (HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes));
    const height = (durationDecimal * 60 / slotDurationMinutes) * (HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes));
    return { top: `${top}px`, height: `${height}px` };
  };
  
  const calculatePopoverPosition = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const startDecimal = hour + minute / 60;
    const minutesFromAgendaStart = (startDecimal - startHour) * 60;
    const top = (minutesFromAgendaStart / slotDurationMinutes) * (HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes));
    return { top: `${top}px`, height: `${(HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes))}px`};
  }

  const calculateCurrentTimePosition = () => {
    const totalMinutesNow = currentTime.getHours() * 60 + currentTime.getMinutes();
    const totalMinutesStart = startHour * 60;
    if (totalMinutesNow < totalMinutesStart) return -1;
    const elapsedMinutes = totalMinutesNow - totalMinutesStart;
    return (elapsedMinutes / 60) * (HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes));
  }

  const formatHour = (hour: number) => {
      const h = Math.floor(hour);
      const m = (hour % 1) * 60;
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
      <div className="flex flex-col lg:flex-row gap-6 h-full p-4 md:p-6 bg-[#f8f9fc]" onClick={() => setPopoverState(null)}>
        <aside className="w-full lg:w-[250px] space-y-6 flex-shrink-0">
           <Card className="shadow-md bg-white rounded-lg">
              <CardHeader>
                  <CardTitle className="text-base font-semibold text-gray-800">Filtros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-600">Sucursal</label>
                      <Select value={selectedLocalId || ''} onValueChange={setSelectedLocalId} disabled={localesLoading}>
                      <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Seleccionar sucursal" />
                      </SelectTrigger>
                      <SelectContent>
                        {locales.map(local => (
                            <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                        ))}
                      </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-600">Profesional</label>
                      <Select defaultValue="todos">
                      <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Seleccionar profesional" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          {professionals.map((barber) => (
                              <SelectItem key={barber.id} value={String(barber.id)}>{barber.name}</SelectItem>
                          ))}
                      </SelectContent>
                      </Select>
                  </div>
              </CardContent>
          </Card>
          <Card className="shadow-md bg-white rounded-lg h-auto">
              <CardContent className="p-2">
                  {date ? (
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        className="rounded-md"
                        locale={es}
                        components={{
                          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                          IconRight: () => <ChevronRight className="h-4 w-4" />,
                        }}
                    />
                  ) : (
                    <div className="p-3">
                      <Skeleton className="h-[250px] w-full" />
                    </div>
                  )}
              </CardContent>
          </Card>
        </aside>
        <main className="flex-1 flex flex-col">
          {/* Agenda Navigation Header */}
          <div className="flex items-center gap-4 mb-4 pb-4 border-b h-[90px]">
              <Button variant="outline" onClick={handleSetToday}>Hoy</Button>
              <div className='flex items-center gap-2'>
                  <Button variant="ghost" size="icon" onClick={handlePrevDay}>
                      <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleNextDay}>
                      <ChevronRight className="h-5 w-5" />
                  </Button>
              </div>
              <div>
                  <h2 className="text-xl font-semibold text-[#202A49] capitalize">{selectedDateFormatted}</h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Store className='w-4 h-4'/> {selectedLocal?.name || 'Cargando...'}
                  </p>
              </div>
          </div>
          <ScrollArea className="h-full">
            <div className="flex">
                {/* Time Column */}
                <div className="w-20 flex-shrink-0">
                    <div className="h-20 flex items-center justify-center border-r border-b">
                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                            <Clock className="h-5 w-5 text-gray-600"/>
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
                    {timeSlots.slice(0, -1).map((time, index) => (
                        <div key={index} style={{ height: `${HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes)}px`}} className="flex items-start justify-center text-center pt-1 pr-2 border-t border-r">
                            <span className="text-xs text-muted-foreground">{time}</span>
                        </div>
                    ))}
                </div>
                
                {/* Main Grid Content */}
                <div className="flex-grow grid grid-flow-col auto-cols-min relative">
                    {/* Professionals Columns */}
                    <div className="contents">
                    {isLoading ? (
                    Array.from({length: 5}).map((_, i) => (
                        <div key={i} className="w-64 flex-shrink-0 border-r">
                            <div className="p-3 sticky top-0 z-10 h-20 mb-6"><Skeleton className="h-16 w-full" /></div>
                            <div className="relative"><Skeleton style={{height: `${(timeSlots.length - 1) * HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes)}px`}} className="w-full" /></div>
                        </div>
                    ))
                    ) : professionals.map((barber) => {
                        const daySchedule = getDaySchedule(barber);
                        const isWorking = daySchedule && daySchedule.enabled;
                        
                        let barberStartHour = startHour;
                        let barberEndHour = endHour;
                        if (isWorking) {
                            const [startH, startM] = daySchedule.start.split(':').map(Number);
                            const [endH, endM] = daySchedule.end.split(':').map(Number);
                            barberStartHour = startH + startM / 60;
                            barberEndHour = endH + endM / 60;
                        }
                        
                        return (
                        <div key={barber.id} className="w-64 flex-shrink-0 border-r">
                            {/* Professional Header */}
                            <div className="p-3 rounded-t-lg bg-white sticky top-0 z-10 h-20 border-b">
                                <div 
                                    className="flex flex-col items-center justify-center"
                                    onMouseEnter={() => setHoveredBarberId(barber.id)}
                                    onMouseLeave={() => setHoveredBarberId(null)}
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={barber.avatar} alt={barber.name} data-ai-hint={barber.dataAiHint} />
                                        <AvatarFallback>{barber.name.substring(0, 2)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-grow">
                                        <p className="font-semibold text-sm text-gray-800 text-center">{barber.name}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Appointments Grid */}
                            <div 
                            className="relative"
                            ref={el => gridRefs.current[barber.id] = el}
                            onMouseMove={(e) => isWorking && handleMouseMove(e, barber.id)}
                            onMouseLeave={handleMouseLeave}
                            onClick={(e) => isWorking && handleClickSlot(e)}
                            >
                            {/* Background Grid Lines */}
                            <div className="absolute inset-0 z-0">
                                {timeSlots.slice(0, -1).map((time, index) => (
                                    <div key={index} style={{ height: `${HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes)}px`}} className="border-t" />
                                ))}
                            </div>
                            
                            {/* Non-working hours blocks */}
                            {!isWorking ? (
                                <NonWorkBlock top={0} height={(HOURLY_SLOT_HEIGHT * (60 / slotDurationMinutes)) * (timeSlots.length - 1)} text="Profesional no disponible" />
                            ) : (
                                <>
                                    {barberStartHour > startHour && (
                                        <NonWorkBlock top={0} height={((barberStartHour - startHour) * 60 / slotDurationMinutes) * (HOURLY_SLOT_HEIGHT * (60/slotDurationMinutes))} text="Fuera de horario" />
                                    )}
                                    {barberEndHour < endHour && (
                                        <NonWorkBlock top={((barberEndHour - startHour) * 60 / slotDurationMinutes) * (HOURLY_SLOT_HEIGHT * (60/slotDurationMinutes))} height={((endHour - barberEndHour) * 60 / slotDurationMinutes) * (HOURLY_SLOT_HEIGHT * (60/slotDurationMinutes))} text="Fuera de horario" />
                                    )}
                                </>
                            )}
                            
                            {/* Hover Popover */}
                            {isWorking && hoveredSlot?.barberId === barber.id && (
                                <div
                                    className="absolute w-[calc(100%-8px)] ml-[4px] p-2 rounded-lg bg-primary/10 border border-primary/50 pointer-events-none transition-all duration-75 z-20"
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
                                            <Button variant="ghost" className="w-full justify-start h-8" onClick={handleOpenReservationModal}>
                                                <Plus className="w-4 h-4 mr-2" /> Agregar Reserva
                                            </Button>
                                            <Button variant="ghost" className="w-full justify-start h-8" onClick={handleOpenBlockModal}>
                                                <Lock className="w-4 h-4 mr-2" /> Bloquear horario
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {/* Events */}
                            {allEvents.filter(a => a.barbero_id === barber.id).map(event => (
                                <Tooltip key={event.id}>
                                <TooltipTrigger asChild>
                                    <div 
                                    onClick={() => {
                                        if (event.type === 'appointment') {
                                            handleOpenDetailModal(event as Reservation);
                                        } else if (event.type === 'block') {
                                            setBlockToDelete(event as TimeBlock);
                                        }
                                    }}
                                    className={cn(
                                        "absolute w-full rounded-lg border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex items-center justify-start text-left py-1 pl-3 pr-2.5 z-10", 
                                        event.color,
                                        'text-slate-800'
                                    )} style={{...calculatePosition((event as any).start, (event as any).duration), left: '0px'}}>
                                    <div className='flex items-center gap-1.5 w-full'>
                                        {(event as any).pago_estado === 'Pagado' && <DollarSign className='h-3 w-3 text-green-700 flex-shrink-0' />}
                                        <p className="font-bold text-xs truncate leading-tight flex-grow">{(event as any).customer}</p>
                                    </div>
                                    </div>
                                </TooltipTrigger>
                                {event.type === 'appointment' ? (
                                    <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border">
                                    <div className="space-y-2">
                                        <div className='flex items-center justify-between'>
                                            <div className='flex items-center gap-2'>
                                            <Circle className={cn('h-3 w-3', (event as any).color.replace('bg-', 'text-').replace('-100', '-500'))} fill="currentColor" />
                                            <p className='font-semibold'>{(event as any).estado}</p>
                                            </div>
                                            <div className='flex items-center'>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenDetailModal(event as Reservation)}><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/80" onClick={() => { setReservationToCancel(event as Reservation); }}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </div>
                                        <p className="font-bold text-base text-foreground">{(event as any).customer}</p>
                                        <p className="text-sm text-muted-foreground">{(event as any).servicio}</p>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Clock className="w-4 h-4" />
                                        <span>{formatHour((event as any).start)} - {formatHour((event as any).start + (event as any).duration)}</span>
                                        </div>
                                        {(event as any).pago_estado &&
                                        <div className="flex items-center gap-2 text-sm">
                                            <DollarSign className="w-4 h-4" />
                                            <span className={cn(
                                                (event as any).pago_estado === 'Pagado' ? 'text-green-600' : 'text-yellow-600'
                                            )}>
                                                {(event as any).pago_estado}
                                            </span>
                                        </div>
                                        }
                                    </div>
                                    </TooltipContent>
                                ) : (
                                    <TooltipContent>
                                        <p>Horario Bloqueado: {(event as any).customer}</p>
                                    </TooltipContent>
                                )}
                                </Tooltip>
                            ))}
                            </div>
                        </div>
                        )
                    })}
                    </div>
                    {/* Current Time Indicator */}
                    {renderTimeIndicator && date && isToday(date) && currentTimeTop >= 0 && (
                        <div
                            className="absolute h-px bg-red-500 z-30 pointer-events-none left-20 right-0"
                            style={{ top: `${currentTimeTop}px` }}
                        >
                        <div className="absolute left-0 -translate-y-1/2">
                            <div className="relative -translate-x-[calc(100%+4px)] bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                                {format(currentTime, 'HH:mm')}
                            </div>
                        </div>
                        </div>
                    )}
                </div>
            </div>
          </ScrollArea>
        </main>
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
