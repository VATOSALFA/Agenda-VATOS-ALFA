'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Esta página está deprecada y redirige a la configuración unificada de pagos y terminales
export default function DeprecatedTerminalPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/pagos');
    }, [router]);

    return null;
}
