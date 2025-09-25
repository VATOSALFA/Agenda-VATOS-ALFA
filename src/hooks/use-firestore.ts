
'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, QueryConstraint, onSnapshot, Firestore } from 'firebase/firestore';
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
  keyOrConstraint?: any,
  ...queryConstraints: (QueryConstraint | undefined)[]
): UseFirestoreQuery<T> & { key: any, setKey: React.Dispatch<React.SetStateAction<any>> } {
  const { db, loading: authLoading } = useAuth(); // Use auth loading to wait for db instance
  const [internalKey, setInternalKey] = useState(0);
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  let effectiveKey: any;
  let constraints: (QueryConstraint | undefined)[];

  // Determine how arguments were passed
  if (keyOrConstraint === undefined || typeof keyOrConstraint === 'string' || typeof keyOrConstraint === 'number' || (keyOrConstraint && Object.prototype.toString.call(keyOrConstraint) === '[object Object]' && !keyOrConstraint.type)) {
      effectiveKey = keyOrConstraint !== undefined ? keyOrConstraint : internalKey;
      constraints = queryConstraints;
  } else {
      effectiveKey = internalKey;
      constraints = [keyOrConstraint as QueryConstraint, ...queryConstraints];
  }
  
  const finalConstraints = constraints.filter((c): c is QueryConstraint => c !== undefined);
  const isQueryActive = constraints.every(c => c !== undefined);

  useEffect(() => {
    // Wait for authentication and a valid db instance.
    // The key check is to prevent running on initial mount if a specific key is expected but not ready.
    if (authLoading || !db || !(db instanceof Firestore) || !isQueryActive) {
      setLoading(true);
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
          console.error(`Error fetching from ${collectionName}:`, err);
          setLoading(false);
        });

        return () => unsubscribe();

    } catch (err: any) {
        console.error(`Firestore query setup error for ${collectionName}:`, err);
        setError(err);
        setLoading(false);
    }
    
  }, [collectionName, JSON.stringify(finalConstraints), effectiveKey, isQueryActive, authLoading, db]);

  return { data, loading: authLoading || loading, error, key: effectiveKey, setKey: setInternalKey };
}
