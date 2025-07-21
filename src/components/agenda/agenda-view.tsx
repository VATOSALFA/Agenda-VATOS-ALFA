
'use client';

import { useState, useRef, MouseEvent, useEffect, useMemo } from 'react';
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
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, Eye, Plus, Lock } from 'lucide-react';
import { format, addDays, subDays, isToday, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Dialog } from '@/components/ui/dialog';
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '../ui/skeleton';
import { where } from 'firebase/firestore';
import type { Profesional, Client, Service } from '@/lib/types';


const HOURLY_SLOT_HEIGHT = 48; // in pixels

interface TimeBlock {
    id: string;
    barbero_id: string;
    motivo: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
}

interface Reservation {
    id: string;
    barbero_id: string;
    cliente_id: string;
    servicio: string;
    hora_inicio: string;
    hora_fin: string;
    fecha: string;
    estado: string;
    pago_estado?: string;
    type?: 'appointment';
}

const useCurrentTime = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);
  
  const calculateTopPosition = () => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const totalMinutes = (hours - 9) * 60 + minutes;
    const top = (totalMinutes / 60) * HOURLY_SLOT_HEIGHT;

    if (top < 0 || top > HOURLY_SLOT_HEIGHT * 13) {
      return null;
    }
    return top;
  };

  return { time: currentTime, top: calculateTopPosition() };
};


export default function AgendaView() {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [hoveredBarberId, setHoveredBarberId] = useState<string | null>(null);
  const hours = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 AM to 9 PM

  const [hoveredSlot, setHoveredSlot] = useState<{barberId: string, time: string} | null>(null);
  const [popoverState, setPopoverState] = useState<{barberId: string, time: string} | null>(null);
  
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationInitialData, setReservationInitialData] = useState<any>(null);

  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const [blockInitialData, setBlockInitialData] = useState<any>(null);

  const gridRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  const { time: currentTime, top: currentTimeTop } = useCurrentTime();
  const [renderTimeIndicator, setRenderTimeIndicator] = useState(false);
  
  useEffect(() => {
    setDate(new Date());
    setRenderTimeIndicator(true)
  }, []);

  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const { data: clients } = useFirestoreQuery<Client>('clientes');
  const { data: services } = useFirestoreQuery<Service>('servicios');

  const reservationsQueryConstraint = useMemo(() => {
    if (!date) return undefined;
    return where('fecha', '==', format(date, 'yyyy-MM-dd'));
  }, [date]);

  const { data: reservations } = useFirestoreQuery<Reservation>('reservas', date, reservationsQueryConstraint);
  const { data: timeBlocks } = useFirestoreQuery<TimeBlock>('bloqueos_horario', date, reservationsQueryConstraint);
  
  const isLoading = professionalsLoading;

  const allEvents = useMemo(() => {
    if (!reservations || !timeBlocks || !clients) return [];

    const clientMap = new Map(clients.map(c => [c.id, c]));

    const appointmentEvents = reservations.map(res => {
        const client = clientMap.get(res.cliente_id);
        const start = parse(res.hora_inicio, 'HH:mm', new Date()).getHours() + parse(res.hora_inicio, 'HH:mm', new Date()).getMinutes() / 60;
        const end = parse(res.hora_fin, 'HH:mm', new Date()).getHours() + parse(res.hora_fin, 'HH:mm', new Date()).getMinutes() / 60;
        
        return {
            id: res.id,
            barberId: res.barbero_id,
            customer: client ? `${client.nombre} ${client.apellido}` : 'Cliente Desconocido',
            service: res.servicio,
            start: start,
            duration: Math.max(0.5, end - start),
            color: 'bg-blue-100 border-blue-500', // Default color, can be customized later
            paymentStatus: res.pago_estado,
            phone: client?.telefono,
            type: 'appointment'
        };
    });

    const blockEvents = timeBlocks.map(block => {
        const start = parse(block.hora_inicio, 'HH:mm', new Date()).getHours() + parse(block.hora_inicio, 'HH:mm', new Date()).getMinutes() / 60;
        const end = parse(block.hora_fin, 'HH:mm', new Date()).getHours() + parse(block.hora_fin, 'HH:mm', new Date()).getMinutes() / 60;
        return {
          id: block.id,
          barberId: block.barbero_id,
          customer: block.motivo,
          service: 'Bloqueado',
          start: start,
          duration: Math.max(0.5, end - start),
          color: 'bg-gray-100 border-gray-400 text-gray-600',
          type: 'block',
        };
      });

      return [...appointmentEvents, ...blockEvents];
  }, [reservations, timeBlocks, clients]);


  const SLOT_DURATION_MINUTES = 30;
  
  const handleSetToday = () => setDate(new Date());
  const handlePrevDay = () => setDate(d => subDays(d || new Date(), 1));
  const handleNextDay = () => setDate(d => addDays(d || new Date(), 1));

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>, barberId: string) => {
    const gridEl = gridRefs.current[barberId];
    if (!gridEl) return;
    const rect = gridEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    const slotsPerHour = 60 / SLOT_DURATION_MINUTES;
    const slotIndex = Math.floor(y / (HOURLY_SLOT_HEIGHT / slotsPerHour));
    
    const hour = 9 + Math.floor(slotIndex / slotsPerHour);
    const minute = (slotIndex % slotsPerHour) * SLOT_DURATION_MINUTES;

    if (hour < 9 || hour >= 22) {
      setHoveredSlot(null);
      return;
    }

    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

  const calculatePosition = (start: number, duration: number) => {
    const top = (start - 9) * HOURLY_SLOT_HEIGHT;
    const height = duration * HOURLY_SLOT_HEIGHT;
    return { top: `${top}px`, height: `${height}px` };
  };

  const calculatePopoverPosition = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const start = hour + (minute / 60);
    const top = (start - 9) * HOURLY_SLOT_HEIGHT;
    return { top: `${top}px` };
  }

  const formatHour = (hour: number) => {
      const h = Math.floor(hour);
      const m = (hour % 1) * 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const selectedDateFormatted = date 
    ? format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
    : 'Cargando...';

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
                      <Select defaultValue="principal">
                      <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Seleccionar sucursal" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="principal">Vatos Alfa Principal</SelectItem>
                          <SelectItem value="norte">Vatos Alfa Norte</SelectItem>
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
                      <Store className='w-4 h-4'/> VATOS ALFA Principal
                  </p>
              </div>
          </div>
          <ScrollArea className="h-full">
              <div className="flex">
                  {/* Time Column */}
                  <div className="sticky left-0 z-20 bg-[#f8f9fc] w-16 flex-shrink-0">
                      <div className="h-14 border-b border-transparent">&nbsp;</div> {/* Header Spacer */}
                      {hours.map((hour) => (
                          <div key={hour} className="h-[48px] text-right pr-2 border-b border-border">
                              <span className="text-xs text-muted-foreground relative -top-2">{`${hour}:00`}</span>
                          </div>
                      ))}
                       {renderTimeIndicator && date && isToday(date) && currentTimeTop !== null && (
                         <div className="absolute w-full" style={{ top: currentTimeTop, transform: 'translateY(-50%)' }}>
                            <div className="text-right pr-2">
                              <span className="text-[10px] font-bold text-white bg-[#202A49] px-1 py-0.5 rounded">
                                {format(currentTime, 'HH:mm')}
                              </span>
                            </div>
                          </div>
                      )}
                  </div>
                  
                  {/* Barbers Columns */}
                  <div className="flex-grow grid grid-flow-col auto-cols-min gap-6 relative">
                      {renderTimeIndicator && date && isToday(date) && currentTimeTop !== null && (
                        <div className="absolute left-0 right-0 h-px bg-[#202A49] z-10" style={{ top: currentTimeTop }} />
                      )}
                      {isLoading ? (
                        Array.from({length: 5}).map((_, i) => (
                            <div key={i} className="w-64 flex-shrink-0">
                                <div className="p-3 sticky top-0 z-10 h-14"><Skeleton className="h-8 w-full" /></div>
                                <div className="relative"><Skeleton className="h-[624px] w-full" /></div>
                            </div>
                        ))
                      ) : professionals.map((barber) => (
                          <div key={barber.id} className="w-64 flex-shrink-0">
                              {/* Professional Header */}
                              <div 
                                className="flex items-center space-x-3 p-3 rounded-t-lg bg-white sticky top-0 z-10 border-b h-14"
                                onMouseEnter={() => setHoveredBarberId(barber.id)}
                                onMouseLeave={() => setHoveredBarberId(null)}
                              >
                                  <Avatar className="h-8 w-8">
                                      <AvatarImage src={barber.avatar} alt={barber.name} data-ai-hint={barber.dataAiHint} />
                                      <AvatarFallback>{barber.name.substring(0, 2)}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-grow">
                                      <p className="font-semibold text-sm text-gray-800">{barber.name}</p>
                                      <Badge variant={barber.active ? 'default' : 'destructive'} 
                                          className={cn(
                                              'text-xs py-0.5 px-2 font-medium',
                                              barber.active && 'bg-green-100 text-green-800 border-green-200',
                                              !barber.active && 'bg-red-100 text-red-800 border-red-200'
                                          )}
                                      >{barber.active ? 'disponible' : 'inactivo'}</Badge>
                                  </div>
                                  {hoveredBarberId === barber.id && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Link href={`/agenda/semanal/${barber.id}`} passHref>
                                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Ver agenda semanal</p>
                                        </TooltipContent>
                                    </Tooltip>
                                  )}
                              </div>

                              {/* Appointments Grid */}
                              <div 
                                className="relative bg-white/60"
                                ref={el => gridRefs.current[barber.id] = el}
                                onMouseMove={(e) => handleMouseMove(e, barber.id)}
                                onMouseLeave={handleMouseLeave}
                                onClick={(e) => handleClickSlot(e)}
                              >
                                  {/* Background Grid Lines */}
                                  {hours.map((hour) => (
                                      <div key={hour} className="h-[48px] border-b border-border"></div>
                                  ))}
                                  
                                  {/* Hover Popover */}
                                  {hoveredSlot?.barberId === barber.id && (
                                    <div
                                        className="absolute w-[calc(100%-8px)] ml-[4px] p-2 rounded-lg bg-primary/10 border border-primary/50 pointer-events-none transition-all duration-75"
                                        style={{...calculatePopoverPosition(hoveredSlot.time), height: `${HOURLY_SLOT_HEIGHT/2}px`}}
                                    >
                                        <p className="text-xs font-bold text-primary flex items-center">
                                            <Plus className="w-3 h-3 mr-1" />
                                            {hoveredSlot.time}
                                        </p>
                                    </div>
                                  )}

                                  {/* Click Popover */}
                                  {popoverState?.barberId === barber.id && (
                                      <div
                                        className="absolute w-[calc(100%_+_16px)] -ml-2 z-30"
                                        style={calculatePopoverPosition(popoverState.time)}
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
                                  {allEvents.filter(a => a.barberId === barber.id).map(event => (
                                    <Tooltip key={event.id}>
                                      <TooltipTrigger asChild>
                                        <div 
                                          className={cn(
                                              "absolute w-[calc(100%-8px)] ml-[4px] rounded-lg text-sm border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex items-center justify-start text-left py-1 px-2.5 z-10", 
                                              event.color,
                                              event.type === 'block' && 'bg-striped-gray',
                                              'text-blue-900'
                                          )} style={calculatePosition(event.start, event.duration)}>
                                          <p className="font-bold text-xs truncate leading-tight">{event.customer}</p>
                                        </div>
                                      </TooltipTrigger>
                                      {event.type === 'appointment' ? (
                                        <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border">
                                          <div className="space-y-2">
                                            <p className="font-bold text-base text-foreground">{event.customer}</p>
                                            <p className="text-sm text-muted-foreground">{event.service}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                              <Clock className="w-4 h-4" />
                                              <span>{formatHour(event.start)} - {formatHour(event.start + event.duration)}</span>
                                            </div>
                                            {(event as any).paymentStatus &&
                                              <div className="flex items-center gap-2 text-sm">
                                                  <DollarSign className="w-4 h-4" />
                                                  <span className={cn(
                                                      (event as any).paymentStatus === 'Pagado' ? 'text-green-600' : 'text-yellow-600'
                                                  )}>
                                                      {(event as any).paymentStatus}
                                                  </span>
                                              </div>
                                            }
                                            {(event as any).phone &&
                                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                  <Phone className="w-4 h-4" />
                                                  <span>{(event as any).phone}</span>
                                              </div>
                                            }
                                          </div>
                                        </TooltipContent>
                                      ) : (
                                        <TooltipContent>
                                            <p>Horario Bloqueado</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  ))}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </ScrollArea>
        </main>
      </div>
      <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
        <NewReservationForm 
          isOpen={isReservationModalOpen}
          onOpenChange={setIsReservationModalOpen}
          onFormSubmit={() => setIsReservationModalOpen(false)}
          initialData={reservationInitialData}
        />
      </Dialog>
      
      <BlockScheduleForm
        isOpen={isBlockScheduleModalOpen}
        onOpenChange={setIsBlockScheduleModalOpen}
        onFormSubmit={() => setIsBlockScheduleModalOpen(false)} 
        initialData={blockInitialData}
      />
    </TooltipProvider>
  );
}

    
