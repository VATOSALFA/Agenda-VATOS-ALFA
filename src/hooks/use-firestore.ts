
'use client';

import * as React from "react"
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, QueryConstraint, getDocs, doc, type QuerySnapshot, type DocumentData, type FirestoreError } from 'firebase/firestore';
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
  const { db, user } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [manualKey, setManualKey] = useState(0);

  const finalConstraints: QueryConstraint[] = [];

  let depsKey: any = manualKey;
  let useKeyForDeps = true;

  if (typeof keyOrFirstConstraint === 'string' || typeof keyOrFirstConstraint === 'number' || typeof keyOrFirstConstraint === 'boolean' || keyOrFirstConstraint === undefined) {
    depsKey = keyOrFirstConstraint ?? manualKey;
    finalConstraints.push(...otherConstraints.filter((c): c is QueryConstraint => c !== undefined));
  } else if (keyOrFirstConstraint) {
    // If the first argument is a constraint, don't use it as a key.
    useKeyForDeps = false;
    finalConstraints.push(keyOrFirstConstraint as QueryConstraint);
    finalConstraints.push(...otherConstraints.filter((c): c is QueryConstraint => c !== undefined));
  }

  const constraintsKey = JSON.stringify(finalConstraints.map(c => c.type));

  useEffect(() => {
    // Crucial check: do not run if db is not initialized.
    if (!db) {
      if (loading) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubscribe = () => { };

    try {
      // Standard query handling

      // DEFENSA ZOMBIE: Si no hay usuario y la colección NO es pública, detenemos la consulta.
      const publicCollections = ['empresa', 'servicios', 'profesionales', 'locales', 'ajustes_sitio', 'productos', 'settings', 'promociones', 'categorias_servicios'];
      if (!user && !publicCollections.includes(collectionName)) {
        if (loading) setLoading(false);
        setData([]);
        return;
      }

      const q = query(collection(db, collectionName), ...finalConstraints);

      unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
        const items = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[];
        setData(items);
        setLoading(false);
      }, (err: FirestoreError) => {
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

    // Added db to dependency array.
  }, [collectionName, constraintsKey, manualKey, db, user, (useKeyForDeps ? depsKey : undefined)]);

  return { data, loading, error, setKey: setManualKey };
}
