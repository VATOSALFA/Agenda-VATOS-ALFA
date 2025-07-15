
'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, ArrowLeft } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Mock data - In a real app, this would come from a database
const barbers = [
  { id: '1', name: 'El Patrón', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'barber portrait' },
  { id: '2', name: 'El Sicario', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'man serious' },
  { id: '3', name: 'El Padrino', status: 'ocupado', avatar: 'https://placehold.co/100x100', dataAiHint: 'stylish man' },
  { id: '4', name: 'Barbero Extra', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'man portrait' },
  { id: '5', name: 'Otro Barbero', status: 'disponible', avatar: 'https://placehold.co/100x100', dataAiHint: 'cool man' },
];

const allAppointments = [
    { id: 1, barberId: '1', date: '2025-07-14', customer: 'Juan Perez', service: 'Corte Vatos', start: 9, duration: 1, color: 'bg-blue-100 border-blue-500 text-blue-800', paymentStatus: 'Pagado', phone: '+56912345678' },
    { id: 2, barberId: '1', date: '2025-07-14', customer: 'Carlos Gomez', service: 'Afeitado Alfa', start: 11, duration: 1.5, color: 'bg-green-100 border-green-500 text-green-800', paymentStatus: 'Pendiente', phone: '+56987654321' },
    { id: 3, barberId: '2', date: '2025-07-15', customer: 'Luis Rodriguez', service: 'Corte y Barba', start: 10, duration: 2, color: 'bg-indigo-100 border-indigo-500 text-indigo-800', paymentStatus: 'Pagado', phone: '+56911223344' },
    { id: 4, barberId: '1', date: '2025-07-16', customer: 'Miguel Hernandez', service: 'Corte Vatos', start: 14, duration: 1, color: 'bg-blue-100 border-blue-500 text-blue-800', paymentStatus: 'Pagado', phone: '+56955667788' },
];

export default function WeeklyAgendaPage() {
  const router = useRouter();
  const params = useParams();
  const professionalId = params.professionalId as string;
  
  const [currentDate, setCurrentDate] = useState(new Date('2025-07-14')); // Start with a fixed date for demo

  const professional = useMemo(() => barbers.find(b => b.id === professionalId), [professionalId]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const appointmentsForWeek = useMemo(() => {
    if (!professionalId) return [];
    const start = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const end = format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    
    return allAppointments.filter(app => 
      app.barberId === professionalId &&
      app.date >= start &&
      app.date <= end
    );
  }, [currentDate, professionalId]);

  const hours = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 AM to 9 PM
  const HOURLY_SLOT_HEIGHT = 48;

  const handleSetThisWeek = () => setCurrentDate(new Date());
  const handlePrevWeek = () => setCurrentDate(d => subDays(d, 7));
  const handleNextWeek = () => setCurrentDate(d => addDays(d, 7));
  
  const calculatePosition = (start: number, duration: number) => {
    const top = (start - 9) * HOURLY_SLOT_HEIGHT;
    const height = duration * HOURLY_SLOT_HEIGHT;
    return { top: `${top}px`, height: `${height}px` };
  };

  const formatHour = (hour: number) => {
      const h = Math.floor(hour);
      const m = (hour % 1) * 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const selectedWeekFormatted = `${format(weekDays[0], "d 'de' MMMM", { locale: es })} - ${format(weekDays[6], "d 'de' MMMM 'de' yyyy", { locale: es })}`;

  if (!professional) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Profesional no encontrado.</p>
        <Button onClick={() => router.push('/')}>Volver a la agenda</Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full p-4 md:p-6 bg-[#f8f9fc]">
        <main className="flex-1 flex flex-col">
          {/* Agenda Navigation Header */}
          <div className="flex items-center gap-4 mb-4 pb-4 border-b h-[90px]">
              <Button variant="outline" onClick={() => router.push('/')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Button>
              <Button variant="outline" onClick={handleSetThisWeek}>Esta Semana</Button>
              <div className='flex items-center gap-2'>
                  <Button variant="ghost" size="icon" onClick={handlePrevWeek}>
                      <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleNextWeek}>
                      <ChevronRight className="h-5 w-5" />
                  </Button>
              </div>
              <div>
                  <h2 className="text-xl font-semibold text-[#202A49] capitalize">{professional.name}</h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                      {selectedWeekFormatted}
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
                  
                  {/* Days Columns */}
                  <div className="flex-grow grid grid-flow-col auto-cols-min gap-6">
                      {weekDays.map((day) => (
                          <div key={day.toString()} className="w-64 flex-shrink-0">
                              {/* Day Header */}
                              <div className="flex flex-col items-center justify-center p-3 rounded-t-lg bg-white sticky top-0 z-10 border-b h-14">
                                  <p className="font-semibold text-sm text-gray-800 capitalize">{format(day, "EEEE", { locale: es })}</p>
                                  <p className="text-xs text-muted-foreground">{format(day, "d MMM", { locale: es })}</p>
                              </div>

                              {/* Appointments Grid */}
                              <div className="relative bg-white/60">
                                  {/* Background Grid Lines */}
                                  {hours.map((hour) => (
                                      <div key={hour} className="h-[48px] border-b border-border"></div>
                                  ))}

                                  {/* Appointments */}
                                  {appointmentsForWeek.filter(a => a.date === format(day, 'yyyy-MM-dd')).map(appointment => (
                                    <Tooltip key={appointment.id}>
                                      <TooltipTrigger asChild>
                                        <div 
                                          className={cn(
                                              "absolute w-[calc(100%-8px)] ml-[4px] rounded-[6px] text-[13px] border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex flex-col justify-center text-left py-1 px-2", 
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
    </TooltipProvider>
  );
}
