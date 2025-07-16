
'use client';

import { useState, useRef, MouseEvent } from 'react';
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
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { NewReservationForm } from '../reservations/new-reservation-form';
import { BlockScheduleForm } from '../reservations/block-schedule-form';

const barbers = [
  { id: 1, name: 'El Patrón', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'barber portrait' },
  { id: 2, name: 'El Sicario', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'man serious' },
  { id: 3, name: 'El Padrino', status: 'ocupado', avatar: 'https://placehold.co/100x100', dataAiHint: 'stylish man' },
  { id: 4, name: 'Barbero Extra', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'man portrait' },
  { id: 5, name: 'Otro Barbero', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'cool man' },
];

const appointments = [
    { id: 1, barberId: 1, customer: 'Juan Perez', service: 'Corte Vatos', start: 9, duration: 1, color: 'bg-blue-100 border-blue-500 text-blue-800', paymentStatus: 'Pagado', phone: '+56912345678' },
    { id: 2, barberId: 1, customer: 'Carlos Gomez', service: 'Afeitado Alfa', start: 11, duration: 1.5, color: 'bg-green-100 border-green-500 text-green-800', paymentStatus: 'Pendiente', phone: '+56987654321' },
    { id: 3, barberId: 2, customer: 'Luis Rodriguez', service: 'Corte y Barba', start: 10, duration: 2, color: 'bg-indigo-100 border-indigo-500 text-indigo-800', paymentStatus: 'Pagado', phone: '+56911223344' },
    { id: 4, barberId: 3, customer: 'Miguel Hernandez', service: 'Corte Vatos', start: 14, duration: 1, color: 'bg-blue-100 border-blue-500 text-blue-800', paymentStatus: 'Pagado', phone: '+56955667788' },
    { id: 5, barberId: 1, customer: 'Cliente Ocasional', service: 'Corte Vatos', start: 15, duration: 1, color: 'bg-purple-100 border-purple-500 text-purple-800', paymentStatus: 'Pendiente', phone: null },
    { id: 6, barberId: 2, customer: 'Jorge Martinez', service: 'Diseño de Cejas', start: 13, duration: 0.5, color: 'bg-pink-100 border-pink-500 text-pink-800', paymentStatus: 'Pagado', phone: '+56999887766' },
    { id: 7, barberId: 3, customer: 'Horario Bloqueado', service: 'Almuerzo', start: 13, duration: 1, color: 'bg-gray-200 border-gray-400 text-gray-800', paymentStatus: null, phone: null },
];

export default function AgendaView() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [hoveredBarberId, setHoveredBarberId] = useState<number | null>(null);
  const hours = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 AM to 9 PM

  const [hoveredSlot, setHoveredSlot] = useState<{barberId: number, time: string} | null>(null);
  const [popoverState, setPopoverState] = useState<{barberId: number, time: string} | null>(null);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isBlockScheduleModalOpen, setIsBlockScheduleModalOpen] = useState(false);
  const gridRefs = useRef<{[key: number]: HTMLDivElement | null}>({});

  const HOURLY_SLOT_HEIGHT = 48; // in pixels
  const SLOT_DURATION_MINUTES = 30;
  
  const handleSetToday = () => setDate(new Date());
  const handlePrevDay = () => setDate(d => subDays(d || new Date(), 1));
  const handleNextDay = () => setDate(d => addDays(d || new Date(), 1));

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>, barberId: number) => {
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

  const handleClickSlot = (e: MouseEvent<HTMLDivElement>, barberId: number) => {
    e.stopPropagation();
    if(hoveredSlot) {
      setPopoverState(hoveredSlot)
    }
  }

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
    : '';

  return (
    <TooltipProvider>
      <div className="flex flex-col lg:flex-row gap-6 h-full p-4 md:p-6 bg-[#f8f9fc]">
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
                          {barbers.map((barber) => (
                              <SelectItem key={barber.id} value={String(barber.id)}>{barber.name}</SelectItem>
                          ))}
                      </SelectContent>
                      </Select>
                  </div>
              </CardContent>
          </Card>
          <Card className="shadow-md bg-white rounded-lg h-auto">
              <CardContent className="p-2">
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
                  </div>
                  
                  {/* Barbers Columns */}
                  <div className="flex-grow grid grid-flow-col auto-cols-min gap-6">
                      {barbers.map((barber) => (
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
                                      <Badge variant={barber.status === 'disponible' ? 'default' : 'destructive'} 
                                          className={cn(
                                              'text-xs py-0.5 px-2 font-medium',
                                              barber.status === 'disponible' && 'bg-green-100 text-green-800 border-green-200',
                                              barber.status !== 'disponible' && 'bg-red-100 text-red-800 border-red-200'
                                          )}
                                      >{barber.status}</Badge>
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
                                onClick={(e) => handleClickSlot(e, barber.id)}
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
                                        className="absolute w-[calc(100%_+_16px)] -ml-2 z-10"
                                        style={calculatePopoverPosition(popoverState.time)}
                                      >
                                        <Card className="shadow-lg border-primary">
                                            <CardContent className="p-2 space-y-1">
                                                <Button variant="ghost" className="w-full justify-start h-8" onClick={() => setIsReservationModalOpen(true)}>
                                                    <Plus className="w-4 h-4 mr-2" /> Agregar Reserva
                                                </Button>
                                                <Button variant="ghost" className="w-full justify-start h-8" onClick={() => setIsBlockScheduleModalOpen(true)}>
                                                    <Lock className="w-4 h-4 mr-2" /> Bloquear horario
                                                </Button>
                                            </CardContent>
                                        </Card>
                                      </div>
                                  )}

                                  {/* Appointments */}
                                  {appointments.filter(a => a.barberId === barber.id).map(appointment => (
                                    <Tooltip key={appointment.id}>
                                      <TooltipTrigger asChild>
                                        <div 
                                          className={cn(
                                              "absolute w-[calc(100%-8px)] ml-[4px] rounded-[6px] text-[13px] border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex flex-col justify-center text-left py-1 px-2 z-10", 
                                              appointment.color,
                                              'text-[#1A1A1A]'
                                          )} style={calculatePosition(appointment.start, appointment.duration)}>
                                          <p className="font-bold truncate leading-tight">{appointment.customer}</p>
                                          <p className="truncate leading-tight">{appointment.service}</p>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border">
                                        <div className="space-y-2">
                                          <p className="font-bold text-base text-foreground">{appointment.customer}</p>
                                          <p className="text-sm text-muted-foreground">{appointment.service}</p>
                                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Clock className="w-4 h-4" />
                                            <span>{formatHour(appointment.start)} - {formatHour(appointment.start + appointment.duration)}</span>
                                          </div>
                                          {appointment.paymentStatus &&
                                            <div className="flex items-center gap-2 text-sm">
                                                <DollarSign className="w-4 h-4" />
                                                <span className={cn(
                                                    appointment.paymentStatus === 'Pagado' ? 'text-green-600' : 'text-yellow-600'
                                                )}>
                                                    {appointment.paymentStatus}
                                                </span>
                                            </div>
                                          }
                                          {appointment.phone &&
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Phone className="w-4 h-4" />
                                                <span>{appointment.phone}</span>
                                            </div>
                                          }
                                        </div>
                                      </TooltipContent>
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
      {isReservationModalOpen && (
          <NewReservationForm onFormSubmit={() => setIsReservationModalOpen(false)} />
      )}
      {isBlockScheduleModalOpen && (
          <BlockScheduleForm onFormSubmit={() => setIsBlockScheduleModalOpen(false)} />
      )}
    </TooltipProvider>
  );
}
