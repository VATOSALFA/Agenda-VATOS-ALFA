'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the default products page.
export default function ProductsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/products/inventory');
    }, [router]);

    return null; // Or a loading spinner
}
