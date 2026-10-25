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
        console.error("Global boundary caught error:", error);

        const name = (error?.name || '').toLowerCase();
        const msg = (error?.message || '').toLowerCase();
        const isChunkError =
            name === 'chunkloaderror' ||
            msg.includes('chunk') ||
            msg.includes('failed to fetch dynamically imported module') ||
            msg.includes("reading 'call'") ||
            msg.includes('reading "call"') ||
            msg.includes("reading 'default'") ||
            msg.includes('loading css chunk') ||
            msg.includes('importing a module script failed');

        if (isChunkError) {
            const STORAGE_KEY = 'vatos_chunk_reload_ts';
            const now = Date.now();
            const lastReload = Number(sessionStorage.getItem(STORAGE_KEY) || '0');
            if (now - lastReload > 15000) {
                sessionStorage.setItem(STORAGE_KEY, String(now));
                window.location.reload();
            }
        }
    }, [error]);

    return (
        <html lang="es">
            <body style={{ margin: 0, backgroundColor: '#0d1424', color: '#f8fafc' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
                    <div style={{ maxWidth: '420px', width: '100%', padding: '24px', borderRadius: '16px', border: '2px solid #3b82f6', backgroundColor: '#111827', textAlign: 'center', boxShadow: '0 10px 30px rgba(59,130,246,0.18)' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#ffffff' }}>Sincronización necesaria</h2>
                        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
                            {error.message || "Es posible que estemos actualizando el sistema."}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                            <button
                                onClick={() => {
                                    sessionStorage.removeItem('vatos_chunk_reload_ts');
                                    window.location.reload();
                                }}
                                style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                            >
                                Recargar página
                            </button>
                            <button
                                onClick={() => reset()}
                                style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #3b82f6', background: '#202A49', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                            >
                                Intentar de nuevo
                            </button>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    )
}
