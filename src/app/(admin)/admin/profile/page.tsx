
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the main profile page.
export default function DeprecatedProfilePage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/profile');
    }, [router]);

    return null; // Or a loading spinner
}
