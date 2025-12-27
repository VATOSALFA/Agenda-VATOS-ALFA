'use client';

import AgendaView from '@/components/agenda/agenda-view';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AgendaPage() {
    const { user } = useAuth();
    const router = useRouter();

    // This is a simple redirect for the root page after login
    // In a real app, you might have a dashboard here.
    if (user && router) {
      // router.replace('/agenda');
    }
    
    return (
        <AgendaView />
    );
}
