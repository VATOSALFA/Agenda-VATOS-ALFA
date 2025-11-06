'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/integrations page.
export default function DeprecatedIntegrationsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/integrations');
    }, [router]);

    return null;
}
