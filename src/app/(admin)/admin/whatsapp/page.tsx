
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is deprecated and redirects to the /settings/whatsapp page.
export default function DeprecatedWhatsappPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/settings/whatsapp');
    }, [router]);

    return null;
}
