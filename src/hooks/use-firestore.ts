'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface UseFirestoreQuery<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

export function useFirestoreQuery<T>(
  collectionName: string,
  ...queryConstraints: QueryConstraint[]
): UseFirestoreQuery<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(collection(db, collectionName), ...queryConstraints);
      const querySnapshot = await getDocs(q);
      const items = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[];
      setData(items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
      console.error(`Error fetching from ${collectionName}:`, err);
    } finally {
      setLoading(false);
    }
  }, [collectionName, ...queryConstraints.map(c => c.type + c.toString())]); // Basic memoization

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error };
}
