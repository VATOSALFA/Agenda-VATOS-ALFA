'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/emails page.
export default function DeprecatedEmailsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/emails');
    }, [router]);

    return null;
}
