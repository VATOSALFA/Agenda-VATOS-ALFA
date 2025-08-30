'use client';

import { useState } from 'react';
import AgendaView from '@/components/agenda/agenda-view';

export default function Home() {
    const [key, setKey] = useState(0);
    const refreshData = () => setKey(prev => prev + 1);

    return (
        <AgendaView key={key} onDataRefresh={refreshData} />
    );
}