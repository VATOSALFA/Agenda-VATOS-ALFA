
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the default admin page.
export default function AdminPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/locales');
    }, [router]);

    return null; // Or a loading spinner
}
