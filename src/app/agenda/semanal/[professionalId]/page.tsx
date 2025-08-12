
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, ArrowLeft, Loader2 } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Profesional, Reservation } from '@/lib/types';
import { where } from 'firebase/firestore';


export default function WeeklyAgendaPage() {
  const router = useRouter();
  const params = useParams();
  const professionalId = params.professionalId as string;
  
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: allProfessionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const professional = useMemo(() => allProfessionals.find(b => b.id === professionalId), [professionalId, allProfessionals]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const weekRangeQuery = useMemo(() => {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return [
        where('barbero_id', '==', professionalId),
        where('fecha', '>=', format(start, 'yyyy-MM-dd')),
        where('fecha', '<=', format(end, 'yyyy-MM-dd')),
      ]
  }, [currentDate, professionalId]);

  const { data: appointmentsForWeek, loading: appointmentsLoading } = useFirestoreQuery<Reservation>('reservas', ...weekRangeQuery);

  const hours = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 AM to 9 PM
  const HOURLY_SLOT_HEIGHT = 48;

  const handleSetThisWeek = () => setCurrentDate(new Date());
  const handlePrevWeek = () => setCurrentDate(d => subDays(d, 7));
  const handleNextWeek = () => setCurrentDate(d => addDays(d, 7));
  
  const calculatePosition = (startDecimal: number, durationDecimal: number) => {
    const top = (startDecimal - 9) * HOURLY_SLOT_HEIGHT;
    const height = durationDecimal * HOURLY_SLOT_HEIGHT;
    return { top: `${top}px`, height: `${height}px` };
  };

  const formatHour = (hour: number) => {
      const h = Math.floor(hour);
      const m = (hour % 1) * 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const selectedWeekFormatted = `${format(weekDays[0], "d 'de' MMMM", { locale: es })} - ${format(weekDays[6], "d 'de' MMMM 'de' yyyy", { locale: es })}`;

  const isLoading = professionalsLoading || appointmentsLoading;

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    )
  }

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
                                  {appointmentsForWeek.filter(a => a.fecha === format(day, 'yyyy-MM-dd')).map(appointment => {
                                    const [startH, startM] = appointment.hora_inicio.split(':').map(Number);
                                    const [endH, endM] = appointment.hora_fin.split(':').map(Number);
                                    const startDecimal = startH + startM / 60;
                                    const endDecimal = endH + endM / 60;
                                    const durationDecimal = endDecimal - startDecimal;

                                    return (
                                        <Tooltip key={appointment.id}>
                                        <TooltipTrigger asChild>
                                            <div 
                                            className={cn(
                                                "absolute w-[calc(100%-8px)] ml-[4px] rounded-[6px] text-[13px] border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex flex-col justify-center text-left py-1 px-2", 
                                                'bg-blue-100 border-blue-500 text-blue-800'
                                            )} style={calculatePosition(startDecimal, durationDecimal)}>
                                            <p className="font-bold truncate leading-tight">{appointment.servicio}</p>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border">
                                            <div className="space-y-2">
                                            <p className="font-bold text-base text-foreground">{appointment.servicio}</p>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Clock className="w-4 h-4" />
                                                <span>{formatHour(startDecimal)} - {formatHour(endDecimal)}</span>
                                            </div>
                                            {appointment.pago_estado &&
                                                <div className="flex items-center gap-2 text-sm">
                                                    <DollarSign className="w-4 h-4" />
                                                    <span className={cn(
                                                        appointment.pago_estado === 'Pagado' ? 'text-green-600' : 'text-yellow-600'
                                                    )}>
                                                        {appointment.pago_estado}
                                                    </span>
                                                </div>
                                            }
                                            </div>
                                        </TooltipContent>
                                        </Tooltip>
                                    )
                                  })}
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
