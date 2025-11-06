'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/profesionales page.
export default function DeprecatedProfesionalesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/profesionales');
    }, [router]);

    return null;
}
