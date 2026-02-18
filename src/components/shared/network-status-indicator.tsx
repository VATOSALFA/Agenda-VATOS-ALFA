'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Wifi, WifiOff } from 'lucide-react';

export function NetworkStatusIndicator() {
    const [isOnline, setIsOnline] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        // Set initial state based on navigator.onLine (client-side only)
        if (typeof window !== 'undefined') {
            setIsOnline(navigator.onLine);
        }

        const handleOnline = () => {
            setIsOnline(true);
            toast({
                title: "Conexión restaurada",
                description: "Estás de nuevo en línea.",
                className: "bg-green-500 text-white border-green-600",
                action: <Wifi className="h-4 w-4" />,
                duration: 3000,
            });
        };

        const handleOffline = () => {
            setIsOnline(false);
            toast({
                variant: "destructive",
                title: "Sin conexión a internet",
                description: "Algunas funciones pueden no estar disponibles.",
                action: <WifiOff className="h-4 w-4" />,
                duration: Infinity, // Keep open until online
            });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [toast]);

    if (isOnline) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-destructive text-destructive-foreground p-2 text-center text-sm font-medium z-[100] animate-in slide-in-from-bottom">
            <div className="flex items-center justify-center gap-2">
                <WifiOff className="h-4 w-4" />
                <span>Sin conexión a internet. Verificando...</span>
            </div>
        </div>
    );
}
