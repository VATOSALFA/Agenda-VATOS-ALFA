
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page just redirects to the admin/empresa page.
export default function DeprecatedEmpresaPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/empresa');
    }, [router]);

    return null;
}
