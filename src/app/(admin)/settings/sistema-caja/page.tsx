
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /sales/cash-box page.
export default function DeprecatedSistemaCajaPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/sales/cash-box');
    }, [router]);

    return null;
}
