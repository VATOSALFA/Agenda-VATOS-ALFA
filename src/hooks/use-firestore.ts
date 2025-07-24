
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
): UseFirestoreQuery<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  let key: any = collectionName;
  let constraints: (QueryConstraint | undefined)[] = [];

  if (typeof keyOrConstraint === 'object' && keyOrConstraint !== null && 'type' in keyOrConstraint) {
      constraints = [keyOrConstraint as QueryConstraint, ...queryConstraints];
  } else if (keyOrConstraint !== undefined) {
      key = keyOrConstraint;
      constraints = queryConstraints;
  } else {
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
    
  }, [collectionName, key, JSON.stringify(finalConstraints.map(c => c ? c.toString() : ''))]);

  return { data, loading, error };
}
