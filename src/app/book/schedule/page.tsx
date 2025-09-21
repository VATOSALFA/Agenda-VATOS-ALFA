

'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Service, Profesional, Reservation, TimeBlock } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, ShoppingCart, User, Clock, Calendar as CalendarIcon, Loader2, Info } from 'lucide-react';
import { format, addMinutes, set, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function SchedulePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const serviceIds = useMemo(() => searchParams.get('services')?.split(',') || [], [searchParams]);
    
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [selectedProfessional, setSelectedProfessional] = useState<string>('any');
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [availableTimes, setAvailableTimes] = useState<string[]>([]);
    const [isFetchingTimes, setIsFetchingTimes] = useState(false);

    const { data: allServices, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', where('active', '==', true));
    const { data: allProfessionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));

    const selectedServices = useMemo(() => {
        if (servicesLoading || serviceIds.length === 0) return [];
        return allServices.filter(s => serviceIds.includes(s.id));
    }, [allServices, serviceIds, servicesLoading]);
    
    const availableProfessionals = useMemo(() => {
        if (professionalsLoading || selectedServices.length === 0 || !selectedDate) return [];
        
        const activeProfessionals = allProfessionals.filter(p => p.active && p.acceptsOnline);
        const dayOfWeek = format(selectedDate, 'eeee', { locale: es }).toLowerCase();

        return activeProfessionals.filter(prof => {
            const canPerformServices = serviceIds.every(serviceId => prof.services?.includes(serviceId));
            if (!canPerformServices) return false;

            const daySchedule = prof.schedule?.[dayOfWeek as keyof typeof prof.schedule];
            return daySchedule?.enabled ?? false;
        });
    }, [allProfessionals, serviceIds, professionalsLoading, selectedServices.length, selectedDate]);

    const totalDuration = useMemo(() => selectedServices.reduce((acc, s) => acc + s.duration, 0), [selectedServices]);
    const totalPrice = useMemo(() => selectedServices.reduce((acc, s) => acc + s.price, 0), [selectedServices]);
    
    const fetchOccupiedSlots = useCallback(async (date: Date, professionalId: string) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        // Fetch reservations
        const reservationsRef = collection(db, 'reservas');
        const resQuery = query(reservationsRef, where('fecha', '==', dateStr), where('barbero_id', '==', professionalId));
        const resSnapshot = await getDocs(resQuery);
        const bookedSlots = resSnapshot.docs.map(doc => {
            const data = doc.data() as Reservation;
            return {
                start: parse(data.hora_inicio, 'HH:mm', new Date()),
                end: parse(data.hora_fin, 'HH:mm', new Date()),
            }
        });

        // Fetch time blocks
        const blocksRef = collection(db, 'bloqueos_horario');
        const blockQuery = query(blocksRef, where('fecha', '==', dateStr), where('barbero_id', '==', professionalId));
        const blockSnapshot = await getDocs(blockQuery);
        blockSnapshot.docs.forEach(doc => {
            const data = doc.data() as TimeBlock;
            bookedSlots.push({
                start: parse(data.hora_inicio, 'HH:mm', new Date()),
                end: parse(data.hora_fin, 'HH:mm', new Date()),
            });
        });

        return bookedSlots;
    }, []);

    useEffect(() => {
        if (!selectedDate || totalDuration === 0 || availableProfessionals.length === 0) {
            setAvailableTimes([]);
            return;
        };

        const getTimes = async () => {
            setIsFetchingTimes(true);
            const times: string[] = [];
            
            const professionalsToScan = selectedProfessional === 'any' 
                ? availableProfessionals
                : availableProfessionals.filter(p => p.id === selectedProfessional);

            for(const prof of professionalsToScan) {
                if (!prof.schedule) continue;

                const dayOfWeek = format(selectedDate, 'eeee', { locale: es }).toLowerCase();
                const daySchedule = prof.schedule[dayOfWeek as keyof typeof prof.schedule];

                if (!daySchedule || !daySchedule.enabled) continue;

                const occupiedSlots = await fetchOccupiedSlots(selectedDate, prof.id);

                const [startH, startM] = daySchedule.start.split(':').map(Number);
                let slotTime = set(selectedDate, { hours: startH, minutes: startM, seconds: 0 });
                const [endH, endM] = daySchedule.end.split(':').map(Number);
                const endTime = set(selectedDate, { hours: endH, minutes: endM, seconds: 0 });

                while (slotTime < endTime) {
                    const potentialEndTime = addMinutes(slotTime, totalDuration);
                    if (potentialEndTime > endTime) break;

                    const isBooked = occupiedSlots.some(booked => 
                        (slotTime >= booked.start && slotTime < booked.end) ||
                        (potentialEndTime > booked.start && potentialEndTime <= booked.end) ||
                        (slotTime < booked.start && potentialEndTime > booked.end)
                    );

                    if (!isBooked && !times.includes(format(slotTime, 'HH:mm'))) {
                        times.push(format(slotTime, 'HH:mm'));
                    }
                    slotTime = addMinutes(slotTime, 15);
                }
            }
            setAvailableTimes(times.sort());
            setIsFetchingTimes(false);
        };
        getTimes();
    }, [selectedDate, selectedProfessional, totalDuration, availableProfessionals, fetchOccupiedSlots]);

    const isLoading = servicesLoading || professionalsLoading;

    const handleNextStep = () => {
        const params = new URLSearchParams();
        params.set('services', serviceIds.join(','));
        params.set('date', format(selectedDate!, 'yyyy-MM-dd'));
        params.set('time', selectedTime!);
        params.set('professional', selectedProfessional);
        router.push(`/book/confirm?${params.toString()}`);
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Elige un profesional</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-10 w-full" /> : (
                            <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Cualquier profesional</SelectItem>
                                    {availableProfessionals.map(prof => (
                                        <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                         { !isLoading && availableProfessionals.length === 0 && (
                            <p className="text-sm text-muted-foreground mt-2">No hay profesionales disponibles que ofrezcan todos los servicios seleccionados en esta fecha.</p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Selecciona fecha y hora</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                             <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                className="rounded-md border"
                                locale={es}
                                disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() - 1))}
                            />
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-semibold text-center">{selectedDate ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: es }) : 'Elige un día'}</h4>
                            <div className="grid grid-cols-3 gap-2">
                                {isFetchingTimes ? Array.from({length: 9}).map((_, i) => <Skeleton key={i} className="h-9 w-full" />) :
                                    availableTimes.length > 0 ? (
                                        availableTimes.map(time => (
                                            <Button 
                                                key={time} 
                                                variant={selectedTime === time ? 'default' : 'outline'}
                                                onClick={() => setSelectedTime(time)}
                                            >
                                                {time}
                                            </Button>
                                        ))
                                    ) : (
                                        <p className="col-span-3 text-center text-sm text-muted-foreground p-4">No hay horarios disponibles para este día. Por favor, selecciona otra fecha.</p>
                                    )
                                }
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
             <div className="lg:col-span-1 sticky top-24">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Tu Cita</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 border-b pb-4">
                            {selectedServices.map(service => (
                                <div key={service.id} className="text-sm">
                                    <p className="font-medium">{service.name}</p>
                                    <p className="text-muted-foreground">${service.price.toLocaleString('es-MX')}</p>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2 text-sm">
                             <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground"/>
                                {isLoading ? <Skeleton className="h-5 w-24" /> : 
                                    <span>
                                        {availableProfessionals.find(p => p.id === selectedProfessional)?.name || 'Cualquier profesional'}
                                    </span>
                                }
                            </div>
                             <div className="flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4 text-muted-foreground"/>
                                <span>{selectedDate ? format(selectedDate, 'PPP', {locale: es}) : 'No seleccionado'}</span>
                            </div>
                             <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground"/>
                                <span>{selectedTime || 'No seleccionado'}</span>
                            </div>
                        </div>

                        <div className="border-t pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Duración total</span>
                                <span className="font-medium">{totalDuration} min</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total</span>
                                <span>${totalPrice.toLocaleString('es-MX')}</span>
                            </div>
                        </div>

                        <Button className="w-full" size="lg" disabled={!selectedTime} onClick={handleNextStep}>
                            Continuar <ArrowRight className="ml-2 h-4 w-4"/>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

