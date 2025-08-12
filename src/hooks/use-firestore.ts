
'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, QueryConstraint, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
  const [internalKey, setInternalKey] = useState(0);
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  let effectiveKey: any;
  let constraints: (QueryConstraint | undefined)[];

  if (typeof keyOrConstraint === 'string' || typeof keyOrConstraint === 'number') {
      effectiveKey = keyOrConstraint;
      constraints = queryConstraints;
  } else if (keyOrConstraint === undefined) {
      effectiveKey = internalKey;
      constraints = queryConstraints;
  } else if (keyOrConstraint && typeof keyOrConstraint.type === 'string') {
      effectiveKey = internalKey;
      constraints = [keyOrConstraint as QueryConstraint, ...queryConstraints];
  } else {
      effectiveKey = keyOrConstraint !== undefined ? keyOrConstraint : internalKey;
      constraints = queryConstraints;
  }
  
  const finalConstraints = constraints.filter((c): c is QueryConstraint => c !== undefined);

  useEffect(() => {
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
    
  }, [collectionName, JSON.stringify(finalConstraints), effectiveKey]);

  return { data, loading, error, key: effectiveKey, setKey: setInternalKey };
}
