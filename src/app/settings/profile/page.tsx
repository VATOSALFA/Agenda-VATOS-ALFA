'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the admin/profile page.
export default function DeprecatedProfilePage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/profile');
    }, [router]);

    return null; // Or a loading spinner
}
