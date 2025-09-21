
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the default settings page.
export default function SettingsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/empresa');
    }, [router]);

    return null; // Or a loading spinner
}
