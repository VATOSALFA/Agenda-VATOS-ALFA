'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DeprecatedEmpresaPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/empresa');
    }, [router]);

    return null;
}
