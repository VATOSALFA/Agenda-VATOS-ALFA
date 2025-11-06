'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/comisiones page.
export default function DeprecatedComisionesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/comisiones');
    }, [router]);

    return null;
}
