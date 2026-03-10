'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Info } from 'lucide-react';

export default function ReservaPendientePage() {
    const searchParams = useSearchParams();
    const router = useRouter();

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-amber-200">
                <CardHeader className="text-center bg-amber-50 rounded-t-lg pb-6 border-b border-amber-100">
                    <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                        <Clock className="w-10 h-10 text-amber-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-amber-800">¡Pago Pendiente!</CardTitle>
                    <p className="text-amber-700 mt-2">Estamos procesando tu pago.</p>
                </CardHeader>
                <CardContent className="space-y-6 pt-6 bg-white text-center">
                    <p className="text-slate-600">
                        Tu pago está en proceso. Si realizaste el pago en efectivo (OXXO, 7-Eleven), puede tardar unas horas en reflejarse.
                    </p>

                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-left flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-800">
                            Tu reserva se confirmará automáticamente una vez que recibamos la confirmación del pago. Te enviaremos un mensaje.
                        </p>
                    </div>

                    <div className="pt-4 space-y-3">
                        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white" onClick={() => router.push('/')}>
                            Volver al Inicio
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
