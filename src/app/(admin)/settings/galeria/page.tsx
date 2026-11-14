'use client';

import { GaleriaCortesManager } from '@/components/admin/galeria-cortes-manager';

export default function GaleriaSettingsPage() {
    return (
        <div className="flex-1 space-y-4 max-w-5xl pb-6">
            <div className="pb-2.5 border-b border-border/60">
                <h2 className="text-xl font-bold tracking-tight text-foreground">GALERÍA</h2>
            </div>

            <GaleriaCortesManager />
        </div>
    );
}
