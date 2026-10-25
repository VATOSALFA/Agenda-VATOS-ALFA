
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'

function isNavigationOrChunkError(error: Error & { digest?: string }): boolean {
  const name = (error?.name || '').toLowerCase();
  const msg = (error?.message || '').toLowerCase();
  return (
    name === 'chunkloaderror' ||
    msg.includes('chunk') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes("reading 'call'") ||
    msg.includes('reading "call"') ||
    msg.includes("reading 'default'") ||
    msg.includes('loading css chunk') ||
    msg.includes('importing a module script failed')
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isReloading, setIsReloading] = useState(() => isNavigationOrChunkError(error));

  useEffect(() => {
    console.error("Application error caught:", error);

    if (isNavigationOrChunkError(error)) {
      const STORAGE_KEY = 'vatos_chunk_reload_ts';
      const now = Date.now();
      const lastReload = Number(sessionStorage.getItem(STORAGE_KEY) || '0');

      // Guard against infinite reload loops (only auto-reload if > 15s since last reload)
      if (now - lastReload > 15000) {
        sessionStorage.setItem(STORAGE_KEY, String(now));
        setIsReloading(true);

        // Clear stale Next.js RSC/Webpack caches in Service Worker before reloading
        if (typeof window !== 'undefined' && 'caches' in window && window.caches) {
          window.caches.keys()
            .then((names) =>
              Promise.all(
                names
                  .filter((n) => n.includes('rsc') || n.includes('next-data') || n.includes('pages'))
                  .map((n) => window.caches.delete(n))
              )
            )
            .catch(() => {})
            .finally(() => {
              window.location.reload();
            });
        } else {
          (window as Window).location.reload();
        }
        return;
      } else {
        setIsReloading(false);
      }
    }
  }, [error]);

  if (isReloading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-4">
        <Loader2 className="h-8 w-8 text-blue-400 animate-spin mb-3" />
        <h2 className="text-base font-bold text-foreground mb-1">Sincronizando sección...</h2>
        <p className="text-xs text-muted-foreground">Actualizando módulos de navegación, un momento por favor.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-4">
      <div className="max-w-md w-full rounded-2xl border-2 border-blue-500 bg-card p-6 shadow-[0_10px_30px_rgba(59,130,246,0.18)] space-y-4">
        <h2 className="text-lg font-bold text-foreground">¡Algo salió mal!</h2>
        <p className="text-muted-foreground text-xs break-words leading-relaxed">
          { isNavigationOrChunkError(error)
            ? "Se detectó una actualización pendiente al cambiar de página. Recarga la pantalla para continuar."
            : (error.message || "Ocurrió un error inesperado al cargar esta sección.") }
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            onClick={() => {
              sessionStorage.removeItem('vatos_chunk_reload_ts');
              window.location.reload();
            }}
            variant="outline"
            size="sm"
            className="text-xs h-9 rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
            Recargar Página
          </Button>
          <Button
            onClick={() => reset()}
            size="sm"
            className="btn-vatos-alfa text-xs h-9 rounded-xl"
          >
            Intentar de nuevo
          </Button>
        </div>
      </div>
    </div>
  )
}
