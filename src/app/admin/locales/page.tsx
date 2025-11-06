'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/locales page.
export default function DeprecatedLocalesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/locales');
    }, [router]);

    return null;
}
