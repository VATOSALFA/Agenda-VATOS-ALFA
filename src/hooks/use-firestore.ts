
'use client';

import { useState, useEffect, useDebugValue } from 'react';
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
    if (!isQueryActive) {
        setData([]);
        setLoading(false);
        return () => {}; // Return an empty cleanup function
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
    
  // Using JSON.stringify for deep comparison of constraints array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(finalConstraints), effectiveKey, isQueryActive]);

  return { data, loading, error, key: effectiveKey, setKey: setInternalKey };
}

