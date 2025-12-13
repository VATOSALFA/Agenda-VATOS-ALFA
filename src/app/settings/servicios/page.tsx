
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /admin/servicios page.
export default function DeprecatedServiciosPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/servicios');
    }, [router]);

    return null;
}
