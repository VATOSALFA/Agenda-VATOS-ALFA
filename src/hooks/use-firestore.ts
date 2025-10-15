
'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';

interface UseFirestoreQuery<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  setKey: React.Dispatch<React.SetStateAction<any>>;
}

export function useFirestoreQuery<T>(
  collectionName: string,
  keyOrFirstConstraint?: any,
  ...otherConstraints: (QueryConstraint | undefined)[]
): UseFirestoreQuery<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [manualKey, setManualKey] = useState(0);

  const finalConstraints: QueryConstraint[] = [];
  
  let depsKey: any = manualKey;
  if (typeof keyOrFirstConstraint === 'string' || typeof keyOrFirstConstraint === 'number' || typeof keyOrFirstConstraint === 'boolean' || keyOrFirstConstraint === undefined) {
    depsKey = keyOrFirstConstraint ?? manualKey;
    finalConstraints.push(...otherConstraints.filter((c): c is QueryConstraint => c !== undefined));
  } else if (keyOrFirstConstraint) {
    finalConstraints.push(keyOrFirstConstraint as QueryConstraint);
    finalConstraints.push(...otherConstraints.filter((c): c is QueryConstraint => c !== undefined));
  }


  const isQueryActive = depsKey !== undefined;


  useEffect(() => {
    if (!db || !isQueryActive) {
      if(loading) setLoading(false);
      setData([]); // Clear data if query is not active
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

    } catch (err: unknown) {
        console.error(`Error setting up query for ${collectionName}:`, err);
        if (err instanceof Error) {
            setError(err);
        } else {
            setError(new Error('An unknown error occurred'));
        }
        setLoading(false);
    }
    
  }, [collectionName, JSON.stringify(finalConstraints), manualKey, isQueryActive, depsKey, loading]);

  return { data, loading, error, setKey: setManualKey };
}
