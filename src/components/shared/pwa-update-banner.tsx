'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RotateCw, CheckCircle2 } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface UpdateInfo {
    version: string;
    title?: string;
    summary?: string;
    notes?: string[];
}

export function PwaUpdateBanner() {
    const [hasUpdate, setHasUpdate] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const pathname = usePathname();

    // Determinar si es una página pública (landing page, reservas públicas, etc.)
    const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname === '/privacidad' || pathname === '/terminos' || pathname.startsWith('/promociones/');

    // Auto-recuperación ante chunks obsoletos (404 / MIME text/plain tras nuevo despliegue)
    useEffect(() => {
        if (typeof window === 'undefined' || process.env.NODE_ENV === 'development') return;

        const RELOAD_GUARD_KEY = 'vatos_alfa_chunk_reload_ts';
        const tryRecoverStaleChunks = async () => {
            try {
                const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0');
                if (Date.now() - lastReload < 30000) return;
                sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));

                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map((r) => r.unregister()));
                }
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((key) => caches.delete(key)));
                }
            } catch (_) {
                // Ignore cleanup errors
            }
            window.location.reload();
        };

        const handleResourceOrChunkError = (event: ErrorEvent) => {
            const target = event.target as HTMLElement | null;
            const src =
                (target as HTMLScriptElement | null)?.src ||
                (target as HTMLLinkElement | null)?.href ||
                '';
            const msg = String(event.message || '');
            const isStaleNextAsset =
                src.includes('/_next/static/') ||
                msg.includes('ChunkLoadError') ||
                msg.includes('Loading chunk');
            if (isStaleNextAsset) {
                tryRecoverStaleChunks();
            }
        };

        const handlePromiseRejection = (event: PromiseRejectionEvent) => {
            const reasonMsg = String((event.reason && (event.reason.message || event.reason)) || '');
            if (
                reasonMsg.includes('ChunkLoadError') ||
                reasonMsg.includes('Loading chunk') ||
                reasonMsg.includes('Failed to fetch dynamically imported module')
            ) {
                tryRecoverStaleChunks();
            }
        };

        window.addEventListener('error', handleResourceOrChunkError, true);
        window.addEventListener('unhandledrejection', handlePromiseRejection);
        return () => {
            window.removeEventListener('error', handleResourceOrChunkError, true);
            window.removeEventListener('unhandledrejection', handlePromiseRejection);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || isPublicPage || process.env.NODE_ENV === 'development') return;

        const clearSilentCaches = async () => {
            try {
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map((r) => r.update().catch(() => {})));
                }
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((key) => caches.delete(key)));
                }
            } catch (_) {}
        };

        const checkVersion = async () => {
            try {
                // Fetch version with a cache-buster query parameter to bypass service worker & browser cache
                const res = await fetch(`/version.json?t=${Date.now()}`);
                if (!res.ok) return;
                const data: UpdateInfo = await res.json();
                const serverVersion = data.version;
                const localVersion = process.env.NEXT_PUBLIC_BUILD_VERSION;

                if ((data as any).silent || (data as any).showModal === false) {
                    if (serverVersion && localVersion && serverVersion !== localVersion) {
                        await clearSilentCaches();
                    }
                    return;
                }

                if (serverVersion && localVersion && serverVersion !== localVersion) {
                    setUpdateInfo(data);
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
        <div
            style={{ zIndex: 9999 }}
            className="fixed bottom-24 md:bottom-6 left-4 right-4 sm:right-auto sm:left-6 z-[9999] max-w-sm sm:max-w-md w-auto sm:w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-10 fade-in duration-500"
        >
            <div className="rounded-2xl border-2 border-blue-500 bg-slate-950/95 text-white p-4 sm:p-5 shadow-[0_15px_45px_rgba(30,58,138,0.45)] backdrop-blur-2xl flex flex-col gap-3.5">
                <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 animate-pulse text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="font-bold text-sm leading-tight text-white tracking-wide uppercase">
                                {updateInfo?.title || 'Actualización disponible'}
                            </h4>
                            <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 shrink-0">
                                Nuevo
                            </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-normal">
                            {updateInfo?.summary || 'Hay nuevas mejoras listas en el sistema.'}
                        </p>
                    </div>
                </div>

                {/* Bullets de Cambios */}
                {updateInfo?.notes && updateInfo.notes.length > 0 && (
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1.5 text-xs text-slate-200">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">
                            Cambios en esta versión:
                        </p>
                        <ul className="space-y-1.5 pl-0.5">
                            {updateInfo.notes.map((note, idx) => (
                                <li key={idx} className="flex items-start gap-2 leading-tight">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                                    <span>{note}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex justify-end pt-1">
                    <div className="relative p-[1.5px] overflow-hidden rounded-xl group w-full">
                        {/* Animated border light beam */}
                        <div className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_60%,#93c5fd_85%,#3b82f6_95%,transparent_100%)]" />
                        
                        <Button 
                            size="sm" 
                            onClick={handleUpdate}
                            disabled={isUpdating}
                            className="relative w-full bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold py-2 px-4 h-auto border-none rounded-[10px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-[0_0_20px_rgba(59,130,246,0.35)]"
                        >
                            <RotateCw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
                            {isUpdating ? 'Instalando actualización...' : 'Actualizar ahora'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
