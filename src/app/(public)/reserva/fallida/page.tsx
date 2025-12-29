'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, AlertTriangle } from 'lucide-react';

export default function ReservaFallidaPage() {
    const searchParams = useSearchParams();
    const router = useRouter();

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-red-200">
                <CardHeader className="text-center bg-red-50 rounded-t-lg pb-6 border-b border-red-100">
                    <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                        <XCircle className="w-10 h-10 text-red-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-red-800">¡Pago Fallido!</CardTitle>
                    <p className="text-red-700 mt-2">Hubo un problema al procesar tu pago.</p>
                </CardHeader>
                <CardContent className="space-y-6 pt-6 bg-white text-center">
                    <p className="text-slate-600">
                        La transacción ha sido rechazada o cancelada. Tu reserva no ha sido confirmada todavía.
                    </p>

                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-left flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">
                            No se ha realizado ningún cargo a tu tarjeta. Puedes intentar de nuevo con otro método de pago.
                        </p>
                    </div>

                    <div className="pt-4 space-y-3">
                        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white" onClick={() => router.back()}>
                            Intentar de Nuevo
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
                            Volver al Inicio
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
