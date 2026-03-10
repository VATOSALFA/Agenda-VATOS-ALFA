import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';

interface Features {
    enableMarketing: boolean;
    enableLoyaltyPoints: boolean;
    loyaltyCashbackPercentage: number;
    enableBarberDashboard: boolean;
    enableOfflineMode: boolean;
    loading: boolean;
}

export function useFeatures() {
    const [features, setFeatures] = useState<Features>({
        enableMarketing: false,
        enableLoyaltyPoints: false,
        loyaltyCashbackPercentage: 10, // Default 10%
        enableBarberDashboard: false,
        enableOfflineMode: false,
        loading: true
    });

    useEffect(() => {
        if (!db) return;

        const unsubscribe = onSnapshot(doc(db, 'configuracion', 'features'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFeatures({
                    enableMarketing: data.enableMarketing ?? false,
                    enableLoyaltyPoints: data.enableLoyaltyPoints ?? false,
                    loyaltyCashbackPercentage: data.loyaltyCashbackPercentage ?? 10,
                    enableBarberDashboard: data.enableBarberDashboard ?? false,
                    enableOfflineMode: data.enableOfflineMode ?? false,
                    loading: false
                });
            } else {
                setFeatures(prev => ({ ...prev, loading: false }));
            }
        });

        return () => unsubscribe();
    }, []);

    return features;
}
