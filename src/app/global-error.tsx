'use client'

import { useEffect } from 'react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error
        console.error("Global boundary caught error:", error);

        // Chunk load errors sometimes bubble up here if they affect the main entry points
        const isChunkError =
            error.name === 'ChunkLoadError' ||
            (error.message && error.message.toLowerCase().includes('chunk')) ||
            (error.message && error.message.toLowerCase().includes('failed to fetch dynamically imported module'));

        if (isChunkError) {
            console.log("Chunk error detected in global boundary. Reloading...");
            window.location.reload();
        }
    }, [error]);

    return (
        <html lang="es">
            <body>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>¡Ocurrió un error inesperado al cargar la aplicación!</h2>
                    <p style={{ color: '#666', marginBottom: '24px', textAlign: 'center', maxWidth: '500px' }}>
                        {error.message || "Es posible que estemos actualizando el sistema."}
                    </p>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={{ padding: '10px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontWeight: 500 }}
                        >
                            Recargar página
                        </button>
                        <button
                            onClick={() => reset()}
                            style={{ padding: '10px 16px', borderRadius: '6px', border: 'none', background: '#0f172a', color: 'white', cursor: 'pointer', fontWeight: 500 }}
                        >
                            Intentar de nuevo
                        </button>
                    </div>
                </div>
            </body>
        </html>
    )
}
