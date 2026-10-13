'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, Calendar, Clock, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomLoader } from '@/components/ui/custom-loader';

function ActionResultContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const status = searchParams.get('status');
    const action = searchParams.get('action');
    const nombre = searchParams.get('nombre') || '';
    const fecha = searchParams.get('fecha') || '';
    const hora = searchParams.get('hora') || '';
    const message = searchParams.get('message') || '';

    const isConfirmSuccess = status === 'success' && action === 'confirm';
    const isCancelSuccess = status === 'success' && action === 'cancel';
    const isAlready = status === 'already';

    const getHeaderInfo = () => {
        if (isConfirmSuccess) {
            return {
                icon: <CheckCircle className="w-8 h-8 text-blue-400 mb-1" />,
                title: '¡Cita Confirmada!',
                subtitle: 'Tu asistencia ha quedado registrada con éxito.'
            };
        }
        if (isCancelSuccess) {
            return {
                icon: <XCircle className="w-8 h-8 text-red-400 mb-1" />,
                title: 'Cita Cancelada',
                subtitle: 'Tu cita ha sido cancelada en el sistema.'
            };
        }
        if (isAlready) {
            return {
                icon: <Info className="w-8 h-8 text-blue-400 mb-1" />,
                title: action === 'confirm' ? 'Cita ya Confirmada' : 'Cita ya Cancelada',
                subtitle: 'Este enlace ya fue procesado anteriormente.'
            };
        }
        return {
            icon: <AlertCircle className="w-8 h-8 text-red-400 mb-1" />,
            title: 'Enlace No Válido',
            subtitle: 'No se pudo procesar la solicitud.'
        };
    };

    const header = getHeaderInfo();

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="w-full max-w-md bg-slate-900 border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] overflow-hidden relative z-10">
                {/* Official Header */}
                <div className="relative bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-6 text-center border-b border-blue-500/20 overflow-hidden">
                    <div className="header-light-beam pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col items-center">
                        <img 
                            src="/logo-v-400x400.webp" 
                            alt="Vatos Alfa" 
                            className="w-14 h-14 rounded-full border-2 border-blue-500/40 object-cover shadow-lg mb-3"
                        />
                        {header.icon}
                        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{header.title}</h1>
                        <p className="text-xs sm:text-sm text-slate-300 mt-1">{header.subtitle}</p>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Status Content */}
                    {isConfirmSuccess && (
                        <div className="space-y-4 text-center">
                            {nombre && (
                                <p className="text-sm text-slate-300">
                                    Muchas gracias <strong className="text-white font-semibold">{nombre}</strong>, tu lugar está asegurado.
                                </p>
                            )}
                            {(fecha || hora) && (
                                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-2 text-left">
                                    {fecha && (
                                        <div className="flex items-center gap-2.5 text-slate-200">
                                            <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
                                            <span className="text-sm font-semibold capitalize">{fecha}</span>
                                        </div>
                                    )}
                                    {hora && (
                                        <div className="flex items-center gap-2.5 text-slate-200">
                                            <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                                            <span className="text-sm font-semibold">{hora} hrs</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <p className="text-xs text-slate-400">Te esperamos puntualmente. Puedes cerrar esta ventana.</p>
                        </div>
                    )}

                    {isCancelSuccess && (
                        <div className="space-y-4 text-center">
                            {nombre && (
                                <p className="text-sm text-slate-300">
                                    <strong className="text-white font-semibold">{nombre}</strong>, tu cita ha sido cancelada exitosamente.
                                </p>
                            )}
                            {(fecha || hora) && (
                                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-2 text-left opacity-70">
                                    {fecha && (
                                        <div className="flex items-center gap-2.5 text-slate-300">
                                            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span className="text-sm capitalize">{fecha}</span>
                                        </div>
                                    )}
                                    {hora && (
                                        <div className="flex items-center gap-2.5 text-slate-300">
                                            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span className="text-sm">{hora} hrs</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <p className="text-xs text-slate-400">Si deseas reagendar en otra fecha, puedes hacerlo cuando gustes.</p>
                        </div>
                    )}

                    {isAlready && (
                        <div className="space-y-4 text-center">
                            <p className="text-sm text-slate-300">
                                {nombre && <><strong className="text-white font-semibold">{nombre}</strong>, </>}
                                {action === 'confirm'
                                    ? 'tu cita ya se encuentra confirmada. ¡Te esperamos!'
                                    : 'tu cita ya fue cancelada anteriormente.'
                                }
                            </p>
                            <p className="text-xs text-slate-400">Puedes cerrar esta ventana con total tranquilidad.</p>
                        </div>
                    )}

                    {!isConfirmSuccess && !isCancelSuccess && !isAlready && (
                        <div className="space-y-4 text-center">
                            <div className="bg-red-950/20 p-4 rounded-xl border border-red-500/30 text-left">
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    {message || 'Este enlace no es válido o ha expirado. Si necesitas ayuda con tu cita, contáctanos por WhatsApp.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-3 pt-2">
                        <Button 
                            variant="alfa" 
                            className="w-full h-11 text-sm font-bold shadow-lg"
                            onClick={() => router.push('/')}
                        >
                            <Home className="w-4 h-4 mr-2" />
                            Ir a la Página Principal
                        </Button>
                        <Button 
                            variant="outline" 
                            className="w-full h-10 text-xs sm:text-sm text-slate-300 border-slate-700 bg-slate-800/40 hover:bg-slate-800 hover:text-white"
                            onClick={() => router.push('/reservar')}
                        >
                            <RotateCcw className="w-3.5 h-3.5 mr-2 text-slate-400" />
                            Agendar Cita en Línea
                        </Button>
                    </div>

                    <div className="pt-3 border-t border-slate-800 text-center">
                        <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400">VATOS ALFA Barber Shop</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Sistema Oficial de Citas</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CitaAccionPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <CustomLoader />
            </div>
        }>
            <ActionResultContent />
        </Suspense>
    );
}
