
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Store, Clock, DollarSign, Phone, ArrowLeft, Loader2, Lock, Globe, Monitor, User } from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Profesional, Reservation, Local, Client } from '@/lib/types';
import { where, doc, updateDoc } from 'firebase/firestore';
import { ReservationDetailModal } from '@/components/reservations/reservation-detail-modal';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';


export default function WeeklyAgendaPage() {
  const router = useRouter();
  const params = useParams();
  const professionalId = params.professionalId as string;

  const [currentDate, setCurrentDate] = useState(new Date());

  const { db } = useAuth();
  const { toast } = useToast();
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleReservationClick = (res: Reservation) => {
    setSelectedReservation(res);
    setIsDetailOpen(true);
  };

  const handleUpdateStatus = async (reservationId: string, status: string) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'reservas', reservationId), { estado: status });
      toast({ title: 'Estado actualizado' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al actualizar' });
    }
  };

  const { data: allProfessionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const professional = useMemo(() => allProfessionals.find(b => b.id === professionalId), [professionalId, allProfessionals]);

  const { data: allLocals, loading: localsLoading } = useFirestoreQuery<Local>('locales');
  const { data: allClients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
  const local = useMemo(() => {
    if (!professional || !allLocals) return null;
    return allLocals.find(l => l.id === professional.local_id);
  }, [professional, allLocals]);


  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate]);

  const { constraints, queryKey } = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    // Use the professional's local_id to fetch all reservations for the shop, then filter.
    const targetLocalId = professional?.local_id || 'waiting_for_local_id';
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');

    return {
      constraints: [
        where('local_id', '==', targetLocalId),
        where('fecha', '>=', startDate),
        where('fecha', '<=', endDate),
      ],
      queryKey: `week-${targetLocalId}-${startDate}`
    };
  }, [currentDate, professional]);

  const { data: rawAppointments, loading: rawAppointmentsLoading } = useFirestoreQuery<Reservation>('reservas', queryKey, ...constraints);

  const appointmentsForWeek = useMemo(() => {
    if (!rawAppointments) return [];

    // Filter first
    const filtered = rawAppointments.filter(res => {
      if (res.estado === 'Cancelado') return false;
      const isMain = res.barbero_id === professionalId;
      const isItem = res.items?.some(item => item.barbero_id === professionalId);
      return isMain || isItem;
    });

    // Enrich with client data and professional names
    return filtered.map(res => {
      let customer = res.customer;
      if (!customer && res.cliente_id && allClients) {
        customer = allClients.find(c => c.id === res.cliente_id);
      }

      let professionalNames = res.professionalNames;
      if (!professionalNames && allProfessionals) {
        const barberIds = new Set<string>();
        if (res.barbero_id) barberIds.add(res.barbero_id);
        res.items?.forEach(item => item.barbero_id && barberIds.add(item.barbero_id));

        professionalNames = Array.from(barberIds).map(id => {
          return allProfessionals.find(p => p.id === id)?.name;
        }).filter(Boolean).join(', ');
      }

      return { ...res, customer, professionalNames };
    });
  }, [rawAppointments, professionalId, allClients, allProfessionals]);

  const appointmentsLoading = rawAppointmentsLoading;

  const { hours, startHour, endHour } = useMemo(() => {
    if (!local || !local.schedule) {
      // Default hours if no schedule is found
      const defaultHours = Array.from({ length: 13 }, (_, i) => 9 + i); // 9 AM to 9 PM
      return { hours: defaultHours, startHour: 9, endHour: 21 };
    }

    let minHour = 24;
    let maxHour = 0;

    Object.values(local.schedule).forEach(day => {
      if (day.enabled) {
        const startH = parseInt(day.start.split(':')[0], 10);
        const endH = parseInt(day.end.split(':')[0], 10);
        if (startH < minHour) minHour = startH;
        if (endH > maxHour) maxHour = endH;
      }
    });

    if (minHour === 24) minHour = 9; // Fallback if no enabled days
    if (maxHour === 0) maxHour = 21; // Fallback

    const hourSlots = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
    return { hours: hourSlots, startHour: minHour, endHour: maxHour };
  }, [local]);

  const HOURLY_SLOT_HEIGHT = 48;

  const handleSetThisWeek = () => setCurrentDate(new Date());
  const handlePrevWeek = () => setCurrentDate(d => subDays(d, 7));
  const handleNextWeek = () => setCurrentDate(d => addDays(d, 7));

  const calculatePosition = (startDecimal: number, durationDecimal: number) => {
    const top = (startDecimal - startHour) * HOURLY_SLOT_HEIGHT;
    const height = durationDecimal * HOURLY_SLOT_HEIGHT;
    return { top: `${top}px`, height: `${height}px` };
  };

  const formatHour = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const getReservationStyles = (res: Reservation) => {
    let bg = 'bg-blue-100';
    let border = 'border-blue-500';
    let text = 'text-blue-800';

    const status = res.estado;

    if (status === 'Reservado') {
      bg = 'bg-blue-100';
      border = 'border-blue-500';
      text = 'text-blue-800';
    } else if (status === 'Confirmado') {
      bg = 'bg-yellow-100';
      border = 'border-yellow-500';
      text = 'text-yellow-800';
    } else if (status === 'Asiste') {
      bg = 'bg-pink-100';
      border = 'border-pink-500';
      text = 'text-pink-800';
    } else if (status === 'No asiste') {
      bg = 'bg-orange-100';
      border = 'border-orange-500';
      text = 'text-orange-800';
    } else if (status === 'Pendiente') {
      bg = 'bg-red-100';
      border = 'border-red-500';
      text = 'text-red-800';
    } else if (status === 'En espera') {
      bg = 'bg-green-100';
      border = 'border-green-500';
      text = 'text-green-800';
    }

    return { bg, border, text };
  };

  const selectedWeekFormatted = `${format(weekDays[0], "d 'de' MMMM", { locale: es })} - ${format(weekDays[6], "d 'de' MMMM 'de' yyyy", { locale: es })}`;

  const isLoading = professionalsLoading || appointmentsLoading || localsLoading || clientsLoading;

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
        <Button onClick={() => router.push('/agenda')}>Volver a la agenda</Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full p-4 md:p-6 bg-[#f8f9fc]">
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Agenda Navigation Header - Responsive */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 pb-4 border-b shrink-0">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <Button variant="outline" size="sm" onClick={() => router.push('/agenda')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="sm:inline">Volver</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleSetThisWeek}>Esta Semana</Button>
              <div className='flex items-center bg-background border rounded-md'>
                <Button variant="ghost" size="sm" className="h-8 w-8 px-0 hover:bg-muted" onClick={handlePrevWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-[1px] h-4 bg-border"></div>
                <Button variant="ghost" size="sm" className="h-8 w-8 px-0 hover:bg-muted" onClick={handleNextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto bg-white p-2 rounded-lg border md:border-0 md:bg-transparent md:p-0 shadow-sm md:shadow-none">
              <Avatar className="h-10 w-10 md:h-12 md:w-12 rounded-lg border md:border-2 border-white shadow-sm">
                <AvatarImage src={professional.avatarUrl} alt={professional.name} />
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary uppercase">{professional.name?.substring(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-base md:text-lg font-bold text-[#202A49] capitalize leading-none mb-1">{professional.name}</h2>
                <p className="text-xs text-muted-foreground capitalize">
                  {selectedWeekFormatted}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto relative">
            <div className="flex min-w-max h-full pb-2 pl-2">
              {/* Time Column - Sticky */}
              <div className="sticky left-0 z-30 bg-[#f8f9fc] w-12 md:w-16 flex-shrink-0 flex flex-col pt-14">
                {hours.map((hour) => (
                  <div key={hour} className="h-[48px] text-right pr-2 text-[10px] md:text-xs text-muted-foreground flex items-center justify-end">
                    <span className="-mt-6">{`${hour}:00`}</span>
                  </div>
                ))}
              </div>

              {/* Days Columns */}
              <div className="flex-grow grid grid-flow-col auto-cols-min gap-2 md:gap-3 px-2">
                {weekDays.map((day) => (
                  <div key={day.toString()} className="w-[160px] md:w-64 flex-shrink-0 flex flex-col relative h-full">
                    {/* Day Header - Sticky */}
                    <div className="flex flex-col items-center justify-center p-2 bg-white rounded-t-lg shadow-sm sticky top-0 z-20 border-b h-14 border-x border-t">
                      <p className="font-semibold text-sm text-gray-800 capitalize">{format(day, "EEEE", { locale: es })}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground">{format(day, "d MMM", { locale: es })}</p>
                    </div>

                    {/* Grid content */}
                    <div className="relative flex-1 bg-white min-h-[calc(48px*12)] shadow-sm rounded-b-lg border-x border-b">
                      {/* Grid Lines */}
                      {hours.map((hour) => (
                        <div key={hour} className="h-[48px] border-b border-gray-100"></div>
                      ))}

                      {/* Appointments */}
                      {appointmentsForWeek.filter(a => a.fecha === format(day, 'yyyy-MM-dd')).map(appointment => {
                        const [startH, startM] = appointment.hora_inicio.split(':').map(Number);
                        const [endH, endM] = appointment.hora_fin.split(':').map(Number);
                        const startDecimal = startH + startM / 60;
                        const endDecimal = endH + endM / 60;
                        const durationDecimal = endDecimal - startDecimal;

                        const styles = getReservationStyles(appointment);
                        return (
                          <Tooltip key={appointment.id}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute w-[calc(100%-8px)] ml-[4px] rounded-[6px] text-[13px] border-l-4 transition-all duration-200 ease-in-out hover:shadow-lg hover:scale-[1.02] flex flex-col justify-center text-left py-1 px-2 cursor-pointer z-10",
                                  styles.bg, styles.border, styles.text
                                )} style={calculatePosition(startDecimal, durationDecimal)}
                                onClick={() => handleReservationClick(appointment)}
                              >
                                <div className="flex justify-between items-start w-full overflow-hidden">
                                  <p className="font-bold truncate leading-tight text-xs flex-1">
                                    {appointment.customer ? `${appointment.customer.nombre} ${appointment.customer.apellido || ''}` : 'Sin cliente'}
                                  </p>
                                  <div className="flex flex-col gap-0.5 ml-1 shrink-0">
                                    {appointment.pago_estado === 'Pagado' && (
                                      <div className="bg-green-500 rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm">
                                        <DollarSign className="w-2.5 h-2.5 text-white" />
                                      </div>
                                    )}
                                    {appointment.origen === 'online' ? (
                                      <Globe className="w-3.5 h-3.5 opacity-70" />
                                    ) : (
                                      <User className="w-3.5 h-3.5 opacity-70" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-background shadow-lg rounded-lg p-3 w-64 border-border z-50">
                              <div className="space-y-2">
                                <div>
                                  <p className="font-bold text-base text-foreground">
                                    {appointment.customer ? `${appointment.customer.nombre} ${appointment.customer.apellido || ''}` : 'Sin cliente'}
                                  </p>
                                  <p className="text-sm text-muted-foreground">{appointment.servicio}</p>
                                </div>
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
                                <p className="text-xs text-muted-foreground mt-1">Clic para ver detalles</p>
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
          </div>
        </main>

        {selectedReservation && (
          <ReservationDetailModal
            reservation={selectedReservation}
            isOpen={isDetailOpen}
            onOpenChange={setIsDetailOpen}
            onPay={() => {
              toast({ title: "Función no disponible", description: "Para cobrar, utilice la agenda principal." });
            }}
            onUpdateStatus={handleUpdateStatus}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
