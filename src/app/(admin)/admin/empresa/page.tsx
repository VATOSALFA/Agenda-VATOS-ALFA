
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/empresa page.
export default function DeprecatedEmpresaPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/empresa');
    }, [router]);

    return null;
}
