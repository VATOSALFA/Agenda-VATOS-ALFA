'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RotateCw } from 'lucide-react';

export function PwaUpdateBanner() {
    const [hasUpdate, setHasUpdate] = useState(false);
    const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

        // Check if there is already a waiting service worker
        navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg) {
                setSwRegistration(reg);
                if (reg.waiting) {
                    setHasUpdate(true);
                }

                // Listen for new service workers installing/installed
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                setHasUpdate(true);
                            }
                        });
                    }
                });
            }
        });

        // Listen for controller changes (reload when skipWaiting finishes)
        const handleControllerChange = () => {
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        };
    }, []);

    const handleUpdate = () => {
        if (swRegistration && swRegistration.waiting) {
            swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            window.location.reload();
        }
    };

    if (!hasUpdate) return null;

    return (
        <div className="fixed bottom-6 left-6 z-[100] max-w-sm w-[calc(100vw-3rem)] animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="rounded-xl border border-blue-500/30 bg-slate-950 text-white p-4 shadow-[0_10px_30px_rgba(59,130,246,0.3)] backdrop-blur-xl flex flex-col gap-3">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg shrink-0 text-blue-400 border border-blue-500/20">
                        <Sparkles className="h-5 w-5 animate-pulse" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <h4 className="font-bold text-sm leading-tight text-white tracking-wide uppercase">
                            Nueva actualización
                        </h4>
                        <p className="text-xs text-slate-300 leading-normal">
                            Hay cambios y mejoras disponibles para la agenda. Actualiza ahora para continuar.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button 
                        size="sm" 
                        onClick={handleUpdate}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1.5 px-4 h-auto shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/20 hover:scale-[1.02] transition-all"
                    >
                        <RotateCw className="mr-1.5 h-3.5 w-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                        Actualizar ahora
                    </Button>
                </div>
            </div>
        </div>
    );
}
