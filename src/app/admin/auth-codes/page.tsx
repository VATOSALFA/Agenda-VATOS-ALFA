
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/auth-codes page.
export default function DeprecatedAuthCodesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/auth-codes');
    }, [router]);

    return null;
}
