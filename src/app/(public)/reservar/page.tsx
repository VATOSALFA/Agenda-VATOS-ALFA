'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { CustomLoader } from '@/components/ui/custom-loader';
import { format, addDays, isBefore, startOfToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, ChevronLeft, ChevronRight, Clock, User, Scissors, Calendar as CalendarIcon, Phone } from 'lucide-react';
import { getAvailableSlots, createPublicReservation } from '@/lib/actions/booking';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils'; // Assuming this exists
import { AnimatePresence, motion } from 'framer-motion';

export default function BookingPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();

    // Steps: 0=Service, 1=Professional, 2=Date/Time, 3=Details, 4=Success
    const [step, setStep] = useState(0);

    // Selections
    const [selectedServiceId, setSelectedServiceId] = useState<string | null>(searchParams.get('serviceId'));
    const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(searchParams.get('professionalId'));
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);

    // Client Details
    const [clientDetails, setClientDetails] = useState({
        name: '',
        lastName: '',
        phone: '',
        birthday: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Data Fetching
    const { data: services, loading: loadingServices } = useFirestoreQuery<any>('servicios');
    const { data: professionals, loading: loadingProfessionals } = useFirestoreQuery<any>('profesionales');
    const { data: locales } = useFirestoreQuery<any>('locales'); // To get default local

    // Derived Data
    const selectedService = useMemo(() => services.find(s => s.id === selectedServiceId), [services, selectedServiceId]);
    const selectedProfessional = useMemo(() => professionals.find(p => p.id === selectedProfessionalId), [professionals, selectedProfessionalId]);

    // Initial Step Logic
    useEffect(() => {
        if (searchParams.get('serviceId')) {
            if (searchParams.get('professionalId')) {
                setStep(2); // Skip to Date
            } else {
                setStep(1); // Skip to Professional
            }
        }
    }, [searchParams]);

    // Fetch Slots when Date/Prof changes
    useEffect(() => {
        if (selectedDate && selectedProfessionalId && selectedService) {
            setLoadingSlots(true);
            setAvailableSlots([]);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            getAvailableSlots({
                date: dateStr,
                professionalId: selectedProfessionalId,
                durationMinutes: selectedService.duration || 30
            }).then(result => {
                if (result.slots) {
                    setAvailableSlots(result.slots);
                } else if (result.error) {
                    console.error(result.error);
                    toast({ variant: 'destructive', title: 'Error al cargar horarios', description: 'Intenta con otra fecha.' });
                }
                setLoadingSlots(false);
            });
        }
    }, [selectedDate, selectedProfessionalId, selectedService]);

    const handleNext = () => {
        if (step === 0 && !selectedServiceId) return;
        if (step === 1 && !selectedProfessionalId) return;
        if (step === 2 && (!selectedDate || !selectedTime)) return;
        setStep(prev => prev + 1);
    };

    const handleBack = () => {
        setStep(prev => prev - 1);
    };

    const confirmBooking = async () => {
        if (!selectedService || !selectedProfessional || !selectedDate || !selectedTime) return;

        setIsSubmitting(true);
        const result = await createPublicReservation({
            client: clientDetails,
            serviceId: selectedService.id,
            professionalId: selectedProfessional.id,
            date: format(selectedDate, 'yyyy-MM-dd'),
            time: selectedTime,
            locationId: selectedProfessional.local_id || locales?.[0]?.id
        });

        if (result.success) {
            setStep(4);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'No se pudo crear la reserva.' });
        }
        setIsSubmitting(false);
    };

    if (loadingServices || loadingProfessionals) {
        return <div className="h-screen flex items-center justify-center"><CustomLoader size={50} /></div>;
    }

    // Helper for currency
    const formatPrice = (price: any) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(price) || 0);

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col items-center">

            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden min-h-[600px] flex flex-col">
                {/* Header Progress */}
                <div className="bg-primary p-6 text-primary-foreground">
                    <h1 className="text-2xl font-bold mb-2">Reservar Cita</h1>
                    <div className="flex items-center gap-2 text-sm opacity-90 overflow-x-auto whitespace-nowrap">
                        <span className={step >= 0 ? 'font-bold' : ''}>1. Servicio</span>
                        <ChevronRight className="h-4 w-4" />
                        <span className={step >= 1 ? 'font-bold' : ''}>2. Profesional</span>
                        <ChevronRight className="h-4 w-4" />
                        <span className={step >= 2 ? 'font-bold' : ''}>3. Horario</span>
                        <ChevronRight className="h-4 w-4" />
                        <span className={step >= 3 ? 'font-bold' : ''}>4. Datos</span>
                    </div>
                </div>

                <div className="flex-1 p-6 relative">
                    <AnimatePresence mode="wait">
                        {/* STEP 0: SERVICE */}
                        {step === 0 && (
                            <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                                <h2 className="text-xl font-semibold mb-4">Selecciona un servicio</h2>
                                <div className="grid grid-cols-1 gap-3">
                                    {services.filter((s: any) => s.active).map((service: any) => (
                                        <div
                                            key={service.id}
                                            className={cn(
                                                "flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50",
                                                selectedServiceId === service.id ? "border-primary bg-primary/5" : "border-transparent bg-slate-50"
                                            )}
                                            onClick={() => { setSelectedServiceId(service.id); setTimeout(() => setStep(1), 200); }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="bg-white p-2 rounded-full shadow-sm">
                                                    <Scissors className="h-5 w-5 text-primary" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold">{service.name}</h3>
                                                    <p className="text-sm text-muted-foreground">{service.duration} min</p>
                                                </div>
                                            </div>
                                            <div className="font-bold text-lg">{formatPrice(service.price)}</div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 1: PROFESSIONAL */}
                        {step === 1 && (
                            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                                <div className="flex items-center mb-4">
                                    <Button variant="ghost" size="icon" onClick={handleBack} className="-ml-2 mr-2"><ChevronLeft /></Button>
                                    <h2 className="text-xl font-semibold">Selecciona un barbero</h2>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {professionals.filter((p: any) => p.active).map((prof: any) => (
                                        <div
                                            key={prof.id}
                                            className={cn(
                                                "flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-all hover:border-primary/50",
                                                selectedProfessionalId === prof.id ? "border-primary bg-primary/5" : "border-transparent bg-slate-50"
                                            )}
                                            onClick={() => { setSelectedProfessionalId(prof.id); setTimeout(() => setStep(2), 200); }}
                                        >
                                            <div className="h-20 w-20 rounded-full bg-muted overflow-hidden mb-3 border-2 border-white shadow-sm">
                                                {prof.avatarUrl ? (
                                                    <img src={prof.avatarUrl} alt={prof.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-full h-full p-4 text-muted-foreground" />
                                                )}
                                            </div>
                                            <h3 className="font-bold text-center">{prof.name}</h3>
                                            <p className="text-xs text-muted-foreground text-center">Disponible</p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 2: DATE & TIME */}
                        {step === 2 && (
                            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                <div className="flex items-center mb-2">
                                    <Button variant="ghost" size="icon" onClick={handleBack} className="-ml-2 mr-2"><ChevronLeft /></Button>
                                    <h2 className="text-xl font-semibold">Elige fecha y hora</h2>
                                </div>

                                <div className="flex flex-col md:flex-row gap-8">
                                    <div className="flex justify-center">
                                        <Calendar
                                            mode="single"
                                            selected={selectedDate}
                                            onSelect={(d) => { setSelectedDate(d); setSelectedTime(null); }}
                                            disabled={(date) => isBefore(date, startOfToday())}
                                            className="rounded-md border p-4 bg-white shadow-sm"
                                            locale={es}
                                            initialFocus
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-medium mb-3 flex items-center gap-2"><Clock className="h-4 w-4" /> Horarios disponibles</h3>
                                        {!selectedDate ? (
                                            <p className="text-muted-foreground text-sm">Selecciona un día en el calendario.</p>
                                        ) : loadingSlots ? (
                                            <div className="flex py-10 justify-center"><CustomLoader size={30} /></div>
                                        ) : availableSlots.length === 0 ? (
                                            <div className="text-center p-4 border rounded-md border-dashed text-muted-foreground bg-slate-50">
                                                No hay buena disponibilidad para este día. Intenta otro.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                                {availableSlots.map(time => (
                                                    <Button
                                                        key={time}
                                                        variant={selectedTime === time ? "default" : "outline"}
                                                        className="w-full"
                                                        onClick={() => setSelectedTime(time)}
                                                    >
                                                        {time}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <Button onClick={handleNext} disabled={!selectedDate || !selectedTime} className="w-full md:w-auto">
                                        Continuar <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 3: DETAILS */}
                        {step === 3 && (
                            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                <div className="flex items-center mb-2">
                                    <Button variant="ghost" size="icon" onClick={handleBack} className="-ml-2 mr-2"><ChevronLeft /></Button>
                                    <h2 className="text-xl font-semibold">Tus Datos</h2>
                                </div>

                                <Card className="bg-slate-50/50">
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Servicio:</span>
                                            <span className="font-medium">{selectedService?.name}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Profesional:</span>
                                            <span className="font-medium">{selectedProfessional?.name}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Fecha:</span>
                                            <span className="font-medium capitalize">{selectedDate ? format(selectedDate, 'EEEE d, MMMM', { locale: es }) : ''} - {selectedTime}</span>
                                        </div>
                                        <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                                            <span>Total:</span>
                                            <span>{formatPrice(selectedService?.price)}</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Nombre</Label>
                                            <Input
                                                id="name"
                                                placeholder="Juan"
                                                value={clientDetails.name}
                                                onChange={(e) => setClientDetails({ ...clientDetails, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="lastname">Apellido</Label>
                                            <Input
                                                id="lastname"
                                                placeholder="Pérez"
                                                value={clientDetails.lastName}
                                                onChange={(e) => setClientDetails({ ...clientDetails, lastName: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Celular</Label>
                                        <Input
                                            id="phone"
                                            type="tel"
                                            placeholder="55 1234 5678"
                                            value={clientDetails.phone}
                                            onChange={(e) => setClientDetails({ ...clientDetails, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="birthday">Cumpleaños (Opcional)</Label>
                                        <Input
                                            id="birthday"
                                            type="date"
                                            value={clientDetails.birthday}
                                            onChange={(e) => setClientDetails({ ...clientDetails, birthday: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <Button
                                    className="w-full mt-4"
                                    size="lg"
                                    onClick={confirmBooking}
                                    disabled={!clientDetails.name || !clientDetails.lastName || !clientDetails.phone || isSubmitting}
                                >
                                    {isSubmitting ? <CustomLoader size={20} color="white" /> : 'Confirmar Reserva'}
                                </Button>
                            </motion.div>
                        )}

                        {/* STEP 4: SUCCESS */}
                        {step === 4 && (
                            <motion.div key="step4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4 animate-in zoom-in duration-500">
                                    <Check className="w-10 h-10" />
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800">¡Reserva Confirmada!</h2>
                                <p className="text-muted-foreground max-w-sm">
                                    Gracias <strong>{clientDetails.name}</strong>, tu cita ha sido agendada con éxito. Te esperamos.
                                </p>
                                <div className="p-4 bg-muted/30 rounded-lg w-full max-w-sm border text-sm">
                                    <p><strong>{selectedService?.name}</strong> con <strong>{selectedProfessional?.name}</strong></p>
                                    <p className="capitalize mt-1">{selectedDate ? format(selectedDate, 'EEEE d, MMMM', { locale: es }) : ''} a las {selectedTime}</p>
                                </div>
                                <Button className="mt-8" onClick={() => router.push('/')}>
                                    Volver al Inicio
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
