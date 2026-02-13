'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/firebase-auth-context';
import AppLayout from '@/components/layout/app-layout';
import React from 'react';

// Defines the logic for when to show the AppLayout (Sidebar, Header, etc.)
// vs when to show just the page content (Login, Public pages).
export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const pathname = usePathname();

    const isPublicPage = pathname === '/' || pathname.startsWith('/reservar') || pathname === '/privacidad' || pathname === '/terminos';
    const isAuthPage = pathname === '/login';

    // If we are waiting for a redirect (not user, not auth page, not public), likely handled by AuthProvider's useEffect,
    // but we can doubly ensure we don't render protected content here.
    // However, AuthProvider usually returns null in this state.

    // If user is logged in and acts like an app user (not on a public landing page)
    if (user && !isPublicPage && !isAuthPage) {
        return (
            <AppLayout>
                {children}
            </AppLayout>
        );
    }

    // Default: Render children without layout (Login, Landing, booking flow)
    return <>{children}</>;
}
