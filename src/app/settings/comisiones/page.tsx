
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /admin/comisiones page.
export default function DeprecatedComisionesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/comisiones');
    }, [router]);

    return null;
}
