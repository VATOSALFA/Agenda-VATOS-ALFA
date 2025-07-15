
'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, QueryConstraint, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface UseFirestoreQuery<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

export function useFirestoreQuery<T>(
  collectionName: string,
  key?: any, // Key to re-trigger the query
  ...queryConstraints: QueryConstraint[]
): UseFirestoreQuery<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    const q = query(collection(db, collectionName), ...queryConstraints);
    
    // Use onSnapshot for real-time updates
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

    // Cleanup subscription on component unmount
    return () => unsubscribe();
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, key]); // Re-run effect if collectionName or the key changes

  return { data, loading, error };
}
