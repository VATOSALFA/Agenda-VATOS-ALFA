
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
      // Don't start fetching if db is not ready or query is not active
      // but ensure loading is false if it was previously true
      if(loading) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
        const q = query(collection(db, collectionName), ...finalConstraints);
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const items = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as T[];
          setData(items);
          setLoading(false);
        }, (err) => {
          setError(err instanceof Error ? err : new Error('An unknown error occurred'));
          console.error(`Error listening to collection ${collectionName}:`, err);
          setLoading(false);
        });

        return () => unsubscribe();

    } catch (err: any) {
        console.error(`Error setting up query for ${collectionName}:`, err);
        setError(err);
        setLoading(false);
    }
    
  }, [collectionName, JSON.stringify(finalConstraints), effectiveKey, isQueryActive, db]);

  return { data, loading, error, key: effectiveKey, setKey: setInternalKey };
}
