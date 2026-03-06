
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    console.error("Application error caught:", error);

    // Check if error is due to a stale deployment / chunk loading failure
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      (error.message && error.message.toLowerCase().includes('chunk')) ||
      (error.message && error.message.toLowerCase().includes('failed to fetch dynamically imported module'));

    if (isChunkError) {
      console.log("Chunk error detected. Reloading page to fetch new assets...");
      setIsReloading(true);

      // Force a hard reload from the server to bypass stale cache
      window.location.reload();
    }
  }, [error]);

  if (isReloading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
        <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
        <h2 className="text-2xl font-bold mb-2">Actualizando la aplicación...</h2>
        <p className="text-muted-foreground">Estamos descargando una nueva versión. Por favor espera.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
      <h2 className="text-2xl font-bold mb-4">¡Algo salió mal!</h2>
      <p className="text-muted-foreground mb-6 max-w-2xl text-sm break-words px-4">
        {error.message || "Ocurrió un error inesperado al cargar esta sección."}
      </p>
      <div className="flex gap-4">
        <Button onClick={() => window.location.reload()} variant="outline">
          Recargar Página
        </Button>
        <Button onClick={() => reset()}>
          Intentar de nuevo
        </Button>
      </div>
    </div>
  )
}
