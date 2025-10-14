'use client';

import { useAuth } from '@/contexts/firebase-auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider } from '@/contexts/firebase-auth-context';

// This is now the root entry point. It will check auth and redirect.
// It wraps its children in AuthProvider.
function RootRedirect() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (user) {
                router.replace('/(app)');
            } else {
                router.replace('/login');
            }
        }
    }, [user, loading, router]);

    return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
}


export default function RootPage() {
    return (
        <AuthProvider>
            <RootRedirect />
        </AuthProvider>
    )
}
