'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RotateCw } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function PwaUpdateBanner() {
    const [hasUpdate, setHasUpdate] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const pathname = usePathname();

    // Determinar si es una página pública (landing page, reservas públicas, etc.)
    const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname === '/privacidad' || pathname === '/terminos' || pathname.startsWith('/promociones/');

    useEffect(() => {
        if (typeof window === 'undefined' || isPublicPage || process.env.NODE_ENV === 'development') return;

        const checkVersion = async () => {
            try {
                // Fetch version with a cache-buster query parameter to bypass service worker & browser cache
                const res = await fetch(`/version.json?t=${Date.now()}`);
                if (!res.ok) return;
                const data = await res.json();
                const serverVersion = data.version;
                const localVersion = process.env.NEXT_PUBLIC_BUILD_VERSION;

                if (serverVersion && localVersion && serverVersion !== localVersion) {
                    setHasUpdate(true);
                }
            } catch (error) {
                console.warn("[Update Check] Error checking app version:", error);
            }
        };

        // 1. Check version on load
        checkVersion();

        // 2. Poll every 3 minutes (180,000 ms)
        const intervalId = setInterval(() => {
            checkVersion();
        }, 180000);

        // 3. Check when the tab/window is focused/returned to
        const handleFocus = () => {
            checkVersion();
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [isPublicPage]);

    const handleUpdate = async () => {
        setIsUpdating(true);
        try {
            // Unregister any active Service Workers to clear PWA caching
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
            }

            // Clear Browser Cache Storage
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(key => caches.delete(key)));
            }
        } catch (error) {
            console.error("[Update Check] Error cleaning caches/sw:", error);
        } finally {
            // Force reload with cache-busting timestamp
            window.location.href = window.location.origin + window.location.pathname + '?update=' + Date.now();
        }
    };

    // No mostrar el anuncio en la landing page ni en páginas públicas
    if (isPublicPage || !hasUpdate) return null;

    return (
        <div className="fixed bottom-6 left-6 z-[100] max-w-sm w-[calc(100vw-3rem)] animate-in slide-in-from-bottom-10 fade-in duration-500">
            <div className="rounded-xl border border-blue-500/35 bg-slate-950/90 text-white p-4 shadow-[0_10px_35px_rgba(59,130,246,0.25)] backdrop-blur-xl flex flex-col gap-3">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg shrink-0 text-blue-400 border border-blue-500/25">
                        <Sparkles className="h-5 w-5 animate-pulse" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <h4 className="font-bold text-sm leading-tight text-white tracking-wide uppercase">
                            Actualización disponible
                        </h4>
                        <p className="text-xs text-slate-300 leading-normal">
                            Hay mejoras y nuevas funciones listas en el servidor. Actualiza ahora para cargarlas.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end">
                    <div className="relative p-[1.5px] overflow-hidden rounded-lg group">
                        {/* Animated border light beam with fade */}
                        <div className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_60%,#93c5fd_85%,#3b82f6_95%,transparent_100%)]" />
                        
                        <Button 
                            size="sm" 
                            onClick={handleUpdate}
                            disabled={isUpdating}
                            className="relative bg-secondary hover:bg-secondary/90 text-secondary-foreground text-xs font-semibold py-1.5 px-4 h-auto border-none rounded-[7px] flex items-center gap-1.5 active:scale-95 transition-all w-full shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                        >
                            <RotateCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                            {isUpdating ? 'Actualizando...' : 'Actualizar ahora'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
