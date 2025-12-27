'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the default sales page.
export default function SalesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/sales/invoiced');
    }, [router]);

    return null; // Or a loading spinner
}
