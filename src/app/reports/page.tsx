
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the default reports page.
export default function ReportsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/reports/reservations');
    }, [router]);

    return null; // Or a loading spinner
}

    