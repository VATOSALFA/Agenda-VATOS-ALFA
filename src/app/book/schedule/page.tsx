
'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Service, Profesional } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, ShoppingCart, User, Clock, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function SchedulePage() {
    const searchParams = useSearchParams();
    const serviceIds = searchParams.get('services')?.split(',') || [];
    
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [selectedProfessional, setSelectedProfessional] = useState<string>('any');
    const [selectedTime, setSelectedTime] = useState<string | null>(null);

    const { data: allServices, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: allProfessionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');

    const selectedServices = useMemo(() => {
        if (servicesLoading || serviceIds.length === 0) return [];
        return allServices.filter(s => serviceIds.includes(s.id));
    }, [allServices, serviceIds, servicesLoading]);
    
    const availableProfessionals = useMemo(() => {
        if (professionalsLoading || selectedServices.length === 0) return [];
        
        // Filter professionals who are active and accept online bookings
        const activeProfessionals = allProfessionals.filter(p => p.active && p.acceptsOnline);

        // Filter professionals who can perform ALL selected services
        return activeProfessionals.filter(prof => 
            serviceIds.every(serviceId => prof.services?.includes(serviceId))
        );
    }, [allProfessionals, serviceIds, professionalsLoading, selectedServices.length]);

    const totalDuration = useMemo(() => selectedServices.reduce((acc, s) => acc + s.duration, 0), [selectedServices]);
    const totalPrice = useMemo(() => selectedServices.reduce((acc, s) => acc + s.price, 0), [selectedServices]);
    
    // Mock available times for now
    const availableTimes = ['10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '16:00', '16:30', '17:00'];
    
    const isLoading = servicesLoading || professionalsLoading;

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
                            <p className="text-sm text-muted-foreground mt-2">No hay profesionales disponibles que ofrezcan todos los servicios seleccionados.</p>
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
                                {isLoading ? Array.from({length: 9}).map((_, i) => <Skeleton key={i} className="h-9 w-full" />) :
                                    availableTimes.map(time => (
                                        <Button 
                                            key={time} 
                                            variant={selectedTime === time ? 'default' : 'outline'}
                                            onClick={() => setSelectedTime(time)}
                                        >
                                            {time}
                                        </Button>
                                    ))
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
                                    <p className="text-muted-foreground">${service.price.toLocaleString('es-CL')}</p>
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
                                <span>${totalPrice.toLocaleString('es-CL')}</span>
                            </div>
                        </div>

                        <Button className="w-full" size="lg" disabled={!selectedTime}>
                            Continuar <ArrowRight className="ml-2 h-4 w-4"/>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

