'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Calendar, Clock, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CustomLoader } from '@/components/ui/custom-loader';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-browser';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ReservaConfirmadaPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const reservationId = searchParams.get('external_reference');
    const paymentId = searchParams.get('payment_id');
    const status = searchParams.get('status');

    const [reservation, setReservation] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReservation = async () => {
            if (!reservationId) {
                setLoading(false);
                return;
            }
            try {
                const docRef = doc(db, 'reservas', reservationId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setReservation({ id: docSnap.id, ...docSnap.data() });
                }
            } catch (error) {
                console.error("Error fetching reservation:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchReservation();
    }, [reservationId]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><CustomLoader /></div>;
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-green-200">
                <CardHeader className="text-center bg-green-50 rounded-t-lg pb-6 border-b border-green-100">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-green-800">¡Pago Exitoso!</CardTitle>
                    <p className="text-green-700 mt-2">Tu reserva ha sido confirmada.</p>
                </CardHeader>
                <CardContent className="space-y-6 pt-6 bg-white">
                    {reservation ? (
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-lg space-y-3 border border-slate-100">
                                <div className="flex items-center gap-3 text-slate-700">
                                    <Calendar className="w-5 h-5 text-blue-600" />
                                    <span className="font-medium capitalize">
                                        {format(parseDate(reservation.fecha), 'EEEE d, MMMM yyyy', { locale: es })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-700">
                                    <Clock className="w-5 h-5 text-blue-600" />
                                    <span className="font-medium">{reservation.hora_inicio}</span>
                                </div>
                                {reservation.local_id && (
                                    <div className="flex items-center gap-3 text-slate-700">
                                        <MapPin className="w-5 h-5 text-blue-600" />
                                        <span className="text-sm">Sucursal Confirmada</span>
                                    </div>
                                )}
                            </div>

                            <div className="text-sm text-slate-500 text-center">
                                <p>ID de Reserva: <span className="font-mono text-slate-700">{reservationId}</span></p>
                                <p>ID de Pago: <span className="font-mono text-slate-700">{paymentId}</span></p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-center text-slate-500">
                            No se encontraron los detalles de la reserva, pero tu pago fue procesado correctamente.
                            <br />ID Referencia: {reservationId}
                        </p>
                    )}

                    <div className="pt-4 space-y-3">
                        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white" onClick={() => router.push('/')}>
                            Volver al Inicio
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => router.push('/reservar')}>
                            Hacer otra reserva
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// Helper simple para fecha
function parseDate(dateStr: string) {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}
