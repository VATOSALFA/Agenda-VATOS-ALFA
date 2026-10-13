'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Info } from 'lucide-react';

export default function ReservaPendientePage() {
    const router = useRouter();

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
                        <Clock className="w-8 h-8 text-blue-400 mb-1" />
                        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">¡Pago Pendiente!</h1>
                        <p className="text-xs sm:text-sm text-slate-300 mt-1">Estamos procesando tu transacción.</p>
                    </div>
                </div>

                <CardContent className="space-y-6 p-6 text-center">
                    <p className="text-sm text-slate-300 leading-relaxed">
                        Tu pago está en proceso de validación. Si realizaste el pago en efectivo (OXXO, 7-Eleven), puede tardar unas horas en reflejarse.
                    </p>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-left flex items-start gap-3">
                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Tu reserva se confirmará automáticamente una vez que recibamos la confirmación del pago. Te notificaremos de inmediato por correo o mensaje.
                        </p>
                    </div>

                    <div className="pt-2 space-y-3">
                        <Button 
                            variant="alfa" 
                            className="w-full h-11 text-sm font-bold shadow-lg" 
                            onClick={() => router.push('/')}
                        >
                            Volver al Inicio
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
