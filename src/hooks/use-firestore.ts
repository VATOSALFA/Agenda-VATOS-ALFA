
'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

interface UseFirestoreQuery<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  key?: any;
  setKey?: React.Dispatch<React.SetStateAction<any>>;
}

export function useFirestoreQuery<T>(
  collectionName: string,
  keyOrConstraints?: any | QueryConstraint | (QueryConstraint | undefined)[],
  ...queryConstraints: (QueryConstraint | undefined)[]
): UseFirestoreQuery<T> & { key: any, setKey: React.Dispatch<React.SetStateAction<any>> } {
  const { db } = useAuth();
  const [internalKey, setInternalKey] = useState(0);
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  let effectiveKey: any;
  let constraints: (QueryConstraint | undefined)[];

  // Argument handling logic
  if (typeof keyOrConstraints === 'string' || typeof keyOrConstraints === 'number' || keyOrConstraints === undefined) {
    effectiveKey = keyOrConstraints !== undefined ? keyOrConstraints : internalKey;
    constraints = queryConstraints;
  } else {
    effectiveKey = internalKey;
    if (Array.isArray(keyOrConstraints)) {
      constraints = [...keyOrConstraints, ...queryConstraints];
    } else {
      constraints = [keyOrConstraints, ...queryConstraints];
    }
  }
  
  const finalConstraints = constraints.filter((c): c is QueryConstraint => c !== undefined);
  const isQueryActive = finalConstraints.length === constraints.length;


  useEffect(() => {
    if (!db || !isQueryActive) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
        const q = query(collection(db, collectionName), ...finalConstraints);
        console.log(`✅ Pilar 4/4 [Petición de Datos]: Ejecutando consulta para la colección: "${collectionName}"`);
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const items = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as T[];
          setData(items);
          setLoading(false);
        }, (err) => {
          setError(err instanceof Error ? err : new Error('An unknown error occurred'));
          console.error(`❌ Pilar 4/4 [Petición de Datos]: Error escuchando la colección ${collectionName}:`, err);
          setLoading(false);
        });

        return () => unsubscribe();

    } catch (err: any) {
        console.error(`❌ Pilar 4/4 [Petición de Datos]: Error en la configuración de la consulta para ${collectionName}:`, err);
        setError(err);
        setLoading(false);
    }
    
  }, [collectionName, JSON.stringify(finalConstraints), effectiveKey, isQueryActive, db]);

  return { data, loading, error, key: effectiveKey, setKey: setInternalKey };
}
