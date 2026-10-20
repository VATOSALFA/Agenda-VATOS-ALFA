'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Calendar, Clock, MapPin, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CustomLoader } from '@/components/ui/custom-loader';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { trackGoogleAdsReservation } from '@/lib/google-ads';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ReservaConfirmadaPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const reservationId = searchParams.get('external_reference') || searchParams.get('reservationId');
    const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');

    const [reservation, setReservation] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReservation = async () => {
            if (!reservationId) {
                setLoading(false);
                return;
            }
            try {
                // Ensure payment is verified and reservation document is created even if MP webhook had a slight delay
                await fetch(`/api/mercado-pago-webhook?reservationId=${encodeURIComponent(reservationId)}`).catch(() => null);

                const docRef = doc(db, 'reservas', reservationId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const resData: any = { id: docSnap.id, ...(docSnap.data() as any) };
                    setReservation(resData);

                    // Trigger isolated conversion tracking for confirmed online reservation
                    trackGoogleAdsReservation({
                        reservationId: docSnap.id,
                        value: Number(resData.totalAmount || resData.precio_total || resData.precio || resData.total || 0),
                        currency: 'MXN',
                    });
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
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <CustomLoader />
            </div>
        );
    }

    const displayDateStr = reservation?.fecha || reservation?.date || '';
    const displayTimeStr = reservation?.hora_inicio || reservation?.time || '';

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

            <Card className="w-full max-w-md shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-slate-900 rounded-2xl overflow-hidden relative z-10">
                {/* Official Header */}
                <div className="relative bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-6 text-center border-b border-blue-500/20 overflow-hidden">
                    <div className="header-light-beam pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col items-center">
                        <img 
                            src="/logo-v-400x400.webp" 
                            alt="Vatos Alfa" 
                            className="w-14 h-14 rounded-full border-2 border-blue-500/40 object-cover shadow-lg mb-3"
                        />
                        <CheckCircle className="w-8 h-8 text-blue-400 mb-1" />
                        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">¡Pago Exitoso!</h1>
                        <p className="text-xs sm:text-sm text-slate-300 mt-1">Tu reserva ha sido confirmada correctamente.</p>
                    </div>
                </div>

                <CardContent className="space-y-6 p-6">
                    {reservation ? (
                        <div className="space-y-4">
                            <div className="bg-slate-950/60 p-4 rounded-xl space-y-3 border border-slate-800">
                                {displayDateStr && (
                                    <div className="flex items-center gap-3 text-slate-200">
                                        <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
                                        <span className="font-semibold text-sm capitalize">
                                            {format(parseDate(displayDateStr), 'EEEE d, MMMM yyyy', { locale: es })}
                                        </span>
                                    </div>
                                )}
                                {displayTimeStr && (
                                    <div className="flex items-center gap-3 text-slate-200">
                                        <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                                        <span className="font-semibold text-sm">{displayTimeStr} hrs</span>
                                    </div>
                                )}
                                {(reservation.local_id || reservation.locationId) && (
                                    <div className="flex items-center gap-3 text-slate-200">
                                        <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                                        <span className="text-xs text-slate-400">Sucursal Confirmada</span>
                                    </div>
                                )}
                            </div>

                            <div className="text-xs text-slate-400 text-center space-y-1">
                                <p>Folio Reserva: <span className="font-mono text-white font-semibold">{reservationId?.slice(0, 8)}</span></p>
                                {paymentId && <p>ID de Pago: <span className="font-mono text-slate-300">{paymentId}</span></p>}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-sm text-slate-300 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                            <p>Tu pago fue procesado correctamente y tu cita ha quedado registrada.</p>
                            {reservationId && <p className="mt-2 font-mono text-xs text-blue-400">ID: {reservationId.slice(0, 8)}</p>}
                        </div>
                    )}

                    <div className="pt-2 space-y-3">
                        <Button 
                            variant="alfa" 
                            className="w-full h-11 text-sm font-bold shadow-lg"
                            onClick={() => router.push('/')}
                        >
                            Volver al Inicio
                        </Button>
                        <Button 
                            variant="outline" 
                            className="w-full h-10 text-xs sm:text-sm text-slate-300 border-slate-700 bg-slate-800/40 hover:bg-slate-800 hover:text-white"
                            onClick={() => router.push('/reservar')}
                        >
                            <RotateCcw className="w-3.5 h-3.5 mr-2 text-slate-400" />
                            Hacer otra reserva
                        </Button>
                    </div>

                    <div className="pt-3 border-t border-slate-800 text-center">
                        <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400">VATOS ALFA Barber Shop</p>
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
