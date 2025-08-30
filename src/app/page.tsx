
'use client';

import { useState } from 'react';
import AgendaView from '@/components/agenda/agenda-view';
import MainLayout from '@/components/layout/main-layout';

export default function Home() {
    const [key, setKey] = useState(0);
    const refreshData = () => setKey(prev => prev + 1);

    return (
        <MainLayout onDataRefresh={refreshData}>
            <AgendaView key={key} />
        </MainLayout>
    );
}
