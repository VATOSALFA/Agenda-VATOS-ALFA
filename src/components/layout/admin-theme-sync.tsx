'use client';

import { useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';

export function AdminThemeSync({ applyTheme }: { applyTheme: (theme: Record<string, any>) => void }) {
  const { data: empresaData, loading } = useFirestoreQuery<any>('empresa', 'main');

  useEffect(() => {
    if (!loading && empresaData.length > 0) {
      const companyDoc = empresaData.find((d: any) => d.theme) || empresaData[0];
      if (companyDoc?.theme) {
        applyTheme(companyDoc.theme);
      }
    }
  }, [empresaData, loading, applyTheme]);

  return null;
}
