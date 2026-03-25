'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

function ActionResultContent() {
    const searchParams = useSearchParams();
    const status = searchParams.get('status');
    const action = searchParams.get('action');
    const nombre = searchParams.get('nombre') || '';
    const fecha = searchParams.get('fecha') || '';
    const hora = searchParams.get('hora') || '';
    const message = searchParams.get('message') || '';

    const renderContent = () => {
        if (status === 'success' && action === 'confirm') {
            return (
                <div className="text-center space-y-4">
                    <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-12 h-12 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">¡Cita Confirmada!</h1>
                    {nombre && <p className="text-lg text-gray-600">Gracias <strong>{nombre}</strong>, tu cita ha sido confirmada exitosamente.</p>}
                    {(fecha || hora) && (
                        <div className="bg-green-50 rounded-xl p-4 mt-4 border border-green-200">
                            {fecha && <p className="text-green-800 font-medium">📅 {fecha}</p>}
                            {hora && <p className="text-green-800 font-medium">🕐 {hora}</p>}
                        </div>
                    )}
                    <p className="text-sm text-gray-500 mt-6">Te esperamos puntualmente. Puedes cerrar esta ventana.</p>
                </div>
            );
        }

        if (status === 'success' && action === 'cancel') {
            return (
                <div className="text-center space-y-4">
                    <div className="mx-auto w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircle className="w-12 h-12 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Cita Cancelada</h1>
                    {nombre && <p className="text-lg text-gray-600"><strong>{nombre}</strong>, tu cita ha sido cancelada.</p>}
                    {(fecha || hora) && (
                        <div className="bg-red-50 rounded-xl p-4 mt-4 border border-red-200">
                            {fecha && <p className="text-red-800 font-medium">📅 {fecha}</p>}
                            {hora && <p className="text-red-800 font-medium">🕐 {hora}</p>}
                        </div>
                    )}
                    <p className="text-sm text-gray-500 mt-6">Si deseas reagendar, contáctanos por WhatsApp. Puedes cerrar esta ventana.</p>
                </div>
            );
        }

        if (status === 'already') {
            return (
                <div className="text-center space-y-4">
                    <div className="mx-auto w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                        <Info className="w-12 h-12 text-blue-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {action === 'confirm' ? 'Ya estaba confirmada' : 'Ya estaba cancelada'}
                    </h1>
                    <p className="text-lg text-gray-600">
                        {nombre && <><strong>{nombre}</strong>, </>}
                        {action === 'confirm'
                            ? 'tu cita ya se encuentra confirmada. ¡Te esperamos!'
                            : 'tu cita ya fue cancelada anteriormente.'
                        }
                    </p>
                    <p className="text-sm text-gray-500 mt-6">Puedes cerrar esta ventana.</p>
                </div>
            );
        }

        // Error state
        return (
            <div className="text-center space-y-4">
                <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-12 h-12 text-amber-500" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">No se pudo procesar</h1>
                <p className="text-lg text-gray-600">{message || 'Este enlace no es válido o ya expiró.'}</p>
                <p className="text-sm text-gray-500 mt-6">Contacta a la barbería por WhatsApp para gestionar tu cita.</p>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
                {renderContent()}

                <div className="mt-8 pt-6 border-t text-center">
                    <p className="text-xs text-gray-400">VATOS ALFA Barber Shop</p>
                    <p className="text-xs text-gray-300 mt-1">Sistema de gestión de citas</p>
                </div>
            </div>
        </div>
    );
}

export default function CitaAccionPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                <div className="animate-pulse text-gray-400">Procesando...</div>
            </div>
        }>
            <ActionResultContent />
        </Suspense>
    );
}
