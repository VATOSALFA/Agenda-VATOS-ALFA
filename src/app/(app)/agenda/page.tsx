'use client';

import AgendaView from '@/components/agenda/agenda-view';

export const dynamic = 'force-dynamic';

export default function AgendaPage() {
    return (
        <div className="pt-16">
            <AgendaView />
        </div>
    );
}
