
'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, QueryConstraint, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';

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

  useEffect(() => {
    if (!db) {
      if(loading) setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    let unsubscribe = () => {};

    try {
        const q = query(collection(db, collectionName), ...finalConstraints);
        
        unsubscribe = onSnapshot(q, (querySnapshot) => {
          const items = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as T[];
          setData(items);
          setLoading(false);
        }, (err) => {
          console.error(`Error listening to collection ${collectionName}:`, err);
          
          const permissionError = new FirestorePermissionError({
            path: collectionName,
            operation: 'list',
            message: err.message,
          });
          errorEmitter.emit('permission-error', permissionError);
          
          setError(permissionError);
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

    return () => unsubscribe();
    
  // We use JSON.stringify on finalConstraints to create a stable dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(finalConstraints), manualKey, db]);

  return { data, loading, error, setKey: setManualKey };
}
