
'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { collection, query, where, getDocs, writeBatch, Timestamp, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { addMinutes, format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { Service, Profesional, Client, Local } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { User, Calendar, Clock, Scissors, CheckCircle, Loader2 } from 'lucide-react';
import { sendTemplatedWhatsAppMessage } from '@/ai/flows/send-templated-whatsapp-flow';


const confirmSchema = z.object({
    nombre: z.string().min(2, 'El nombre es requerido.'),
    apellido: z.string().min(2, 'El apellido es requerido.'),
    correo: z.string().email('Debe ser un correo válido.'),
    telefono: z.string().min(8, 'El teléfono es requerido.'),
});

type ConfirmFormData = z.infer<typeof confirmSchema>;

function ConfirmPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const serviceIds = useMemo(() => searchParams.get('services')?.split(',') || [], [searchParams]);
    const dateStr = searchParams.get('date');
    const time = searchParams.get('time');
    const professionalId = searchParams.get('professional');

    const { data: allServices, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: allProfessionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

    const selectedServices = useMemo(() => allServices.filter(s => serviceIds.includes(s.id)), [allServices, serviceIds]);
    const selectedProfessional = useMemo(() => allProfessionals.find(p => p.id === professionalId), [allProfessionals, professionalId]);
    const totalDuration = useMemo(() => selectedServices.reduce((acc, s) => acc + s.duration, 0), [selectedServices]);
    const totalPrice = useMemo(() => selectedServices.reduce((acc, s) => acc + s.price, 0), [selectedServices]);
    const startTime = time ? parse(time, 'HH:mm', new Date()) : null;
    const endTime = startTime ? addMinutes(startTime, totalDuration) : null;

    const form = useForm<ConfirmFormData>({
        resolver: zodResolver(confirmSchema),
        defaultValues: { nombre: '', apellido: '', correo: '', telefono: '' }
    });

    const isLoading = servicesLoading || professionalsLoading || localesLoading;

    const handleConfirm = async (data: ConfirmFormData) => {
        setIsSubmitting(true);
        if (!db || !dateStr || !time || !professionalId || !endTime || !selectedProfessional) {
            toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos para confirmar la reserva.' });
            setIsSubmitting(false);
            return;
        }

        try {
            const batch = writeBatch(db);
            let clientId: string;

            // Check if client exists
            const clientsRef = collection(db, 'clientes');
            const q = query(clientsRef, where('correo', '==', data.correo));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                // Create new client
                const newClientRef = doc(clientsRef);
                batch.set(newClientRef, {
                    ...data,
                    creado_en: Timestamp.now()
                });
                clientId = newClientRef.id;
            } else {
                clientId = querySnapshot.docs[0].id;
            }
            
            const local = locales.find(l => l.id === selectedProfessional.local_id);
            
            const reservationData = {
                cliente_id: clientId,
                barbero_id: professionalId,
                servicio: selectedServices.map(s => s.name).join(', '),
                items: selectedServices.map(s => ({
                    servicio: s.name,
                    nombre: s.name,
                    barbero_id: professionalId,
                    precio: s.price,
                    duracion: s.duration
                })),
                fecha: dateStr,
                hora_inicio: time,
                hora_fin: format(endTime, 'HH:mm'),
                precio: totalPrice,
                estado: 'Reservado',
                canal_reserva: 'sitio_web',
                pago_estado: 'Pendiente',
                local_id: selectedProfessional.local_id,
                creado_en: Timestamp.now()
            };

            // Create reservation
            const newReservationRef = doc(collection(db, 'reservas'));
            batch.set(newReservationRef, reservationData);

            await batch.commit();

            // Send WhatsApp notification
            if (data.telefono) {
                try {
                    const fullDateStr = `${format(parse(dateStr, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", { locale: es })} a las ${time}`;
                    const contentSid = 'HX6162105c1002a6cf84fa345393869746'; // SID Proporcionado
                    await sendTemplatedWhatsAppMessage({
                        to: data.telefono,
                        contentSid: contentSid,
                        contentVariables: {
                            '1': data.nombre,
                            '2': local?.name || 'nuestro local',
                            '3': reservationData.servicio,
                            '4': fullDateStr,
                            '5': local?.address || 'nuestra sucursal',
                            '6': selectedProfessional.name,
                        },
                    });
                } catch (waError) {
                    console.error("WhatsApp notification failed:", waError);
                    // Do not block UI for this error, just log it.
                    toast({
                        variant: 'destructive',
                        title: 'Error de Notificación',
                        description: 'La reserva se creó, pero no se pudo enviar la notificación por WhatsApp.',
                    });
                }
            }
            
            toast({
                title: '¡Reserva Confirmada!',
                description: 'Tu cita ha sido agendada con éxito.',
                className: 'bg-green-100 text-green-800 border-green-200'
            });

            router.push('/book/success');

        } catch (error) {
            console.error("Error confirming reservation:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo confirmar la reserva. Por favor, inténtalo de nuevo.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="max-w-4xl mx-auto"><Skeleton className="w-full h-96" /></div>;
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleConfirm)} className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Confirma tus datos</CardTitle>
                            <CardDescription>Completa tu información para finalizar la reserva.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="nombre" render={({ field }) => (
                                    <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="apellido" render={({ field }) => (
                                    <FormItem><FormLabel>Apellido</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                             <FormField control={form.control} name="correo" render={({ field }) => (
                                <FormItem><FormLabel>Correo Electrónico</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="telefono" render={({ field }) => (
                                <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>Resumen de tu Cita</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="space-y-1">
                                <p className="font-semibold flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Fecha y Hora</p>
                                <p className="pl-6">{dateStr && format(parse(dateStr, 'yyyy-MM-dd', new Date()), 'EEEE, dd MMMM yyyy', {locale: es})}</p>
                                <p className="pl-6">{time} - {endTime && format(endTime, 'HH:mm')}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="font-semibold flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Profesional</p>
                                <p className="pl-6">{selectedProfessional?.name || 'Cualquiera'}</p>
                            </div>
                             <div className="space-y-1">
                                <p className="font-semibold flex items-center gap-2"><Scissors className="h-4 w-4 text-primary" /> Servicios</p>
                                <ul className="pl-6 list-disc list-inside">
                                    {selectedServices.map(s => <li key={s.id}>{s.name}</li>)}
                                </ul>
                            </div>
                             <div className="border-t pt-4 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Duración Total</span>
                                    <span className="font-medium">{totalDuration} min</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg">
                                    <span>Total</span>
                                    <span>${totalPrice.toLocaleString('es-MX')}</span>
                                </div>
                            </div>
                            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                                Confirmar Reserva
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </Form>
    );
}


export default function ConfirmPage() {
    return (
        <Suspense fallback={<div>Cargando...</div>}>
            <ConfirmPageContent />
        </Suspense>
    )
}
