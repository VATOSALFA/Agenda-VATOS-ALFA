'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/conversations page.
export default function DeprecatedConversationsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/conversations');
    }, [router]);

    return null;
}
