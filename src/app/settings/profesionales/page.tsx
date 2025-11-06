
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /admin/profesionales page.
export default function DeprecatedProfesionalesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/profesionales');
    }, [router]);

    return null;
}
