
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
  ...queryConstraints: (QueryConstraint | undefined)[]
): UseFirestoreQuery<T>;
export function useFirestoreQuery<T>(
  collectionName: string,
  key?: any,
  ...queryConstraints: (QueryConstraint | undefined)[]
): UseFirestoreQuery<T>;


export function useFirestoreQuery<T>(
  collectionName: string,
  keyOrConstraint?: any | QueryConstraint,
  ...queryConstraints: (QueryConstraint | undefined)[]
): UseFirestoreQuery<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  let key: any;
  let constraints: (QueryConstraint | undefined)[];

  if (keyOrConstraint && typeof keyOrConstraint === 'object' && 'type' in keyOrConstraint) {
      constraints = [keyOrConstraint as QueryConstraint, ...queryConstraints];
      key = collectionName; // default key if not provided
  } else {
      constraints = queryConstraints;
      key = keyOrConstraint;
  }
  
  const finalConstraints = constraints.filter((c): c is QueryConstraint => c !== undefined);

  useEffect(() => {
    // If a constraint is undefined, it means a condition is not met (e.g., client ID not ready).
    // In this case, we don't fetch and return empty data.
    if (constraints.some(c => c === undefined)) {
        setData([]);
        setLoading(false);
        return;
    }

    setLoading(true);
    setError(null);
    
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
    
  // We serialize the constraints to use them as a dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, key, JSON.stringify(finalConstraints.map(c => c.toString()))]);

  return { data, loading, error };
}
