
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /conversations page.
export default function DeprecatedConversationsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/conversations');
    }, [router]);

    return null;
}
