
'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, QueryConstraint, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

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
  const { db } = useAuth();
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
    if (!db) {
      if(loading) setLoading(false);
      return;
    }
    
    // Do not run query if the dependencies are explicitly set to undefined (except for manual key)
    if (keyOrFirstConstraint === undefined && manualKey === 0 && otherConstraints.length === 0) {
        // This is a special case for queries that should wait for an action,
        // but we still want them to run on manual refetch.
        // For now, we will allow them to run if `db` is present.
    }


    setLoading(true);
    setError(null);
    
    try {
        const q = query(collection(db, collectionName), ...finalConstraints);
        
        // Initial fetch to get data quickly
        getDocs(q).then(initialSnapshot => {
            const items = initialSnapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as T[];
            setData(items);
            setLoading(false);

            // Then listen for realtime updates
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
              const updatedItems = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              })) as T[];
              setData(updatedItems);
            }, (err) => {
              setError(err instanceof Error ? err : new Error('An unknown error occurred'));
              console.error(`Error listening to collection ${collectionName}:`, err);
              setLoading(false);
            });
    
            return unsubscribe;
        }).catch(err => {
             console.error(`Error fetching initial data for ${collectionName}:`, err);
             if (err instanceof Error) {
                 setError(err);
             } else {
                 setError(new Error('An unknown error occurred during initial fetch'));
             }
             setLoading(false);
        });

    } catch (err: unknown) {
        console.error(`Error setting up query for ${collectionName}:`, err);
        if (err instanceof Error) {
            setError(err);
        } else {
            setError(new Error('An unknown error occurred'));
        }
        setLoading(false);
    }
    
  // We use JSON.stringify on finalConstraints to create a stable dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(finalConstraints), manualKey, db]);

  return { data, loading, error, setKey: setManualKey };
}
