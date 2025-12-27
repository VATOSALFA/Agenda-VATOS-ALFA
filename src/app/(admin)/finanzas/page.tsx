'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the default finances page.
export default function FinanzasPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/finanzas/resumen');
    }, [router]);

    return null; // Or a loading spinner
}
