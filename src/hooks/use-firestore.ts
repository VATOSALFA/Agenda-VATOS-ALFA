
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

function serializeConstraintValue(val: any, depth = 0): any {
  if (val === null || val === undefined) return val;
  if (depth > 4) return '[depth]';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) return `Date:${val.getTime()}`;
  if (typeof val.toMillis === 'function') return `Ts:${val.toMillis()}`;
  if (typeof val.seconds === 'number' && typeof val.nanoseconds === 'number') {
    return `Ts:${val.seconds}:${val.nanoseconds}`;
  }
  if (Array.isArray(val)) return val.map((item) => serializeConstraintValue(item, depth + 1));
  if (Array.isArray(val.segments)) return `Field:${val.segments.join('.')}`;
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(val).sort()) {
      if (key.startsWith('_') || key === 'type' || key === 'id' || key === 'path' || key === 'segments') {
        out[key] = serializeConstraintValue(val[key], depth + 1);
      }
    }
    return out;
  }
  return String(val);
}

function serializeQueryConstraint(c: any): any {
  if (!c || typeof c !== 'object') return String(c);
  return {
    type: c.type,
    field: c._field ? serializeConstraintValue(c._field) : undefined,
    op: c._op,
    value: c._value !== undefined ? serializeConstraintValue(c._value) : undefined,
    dir: c._directionStr,
    limit: c._limit,
    docs: c._docOrFields ? serializeConstraintValue(c._docOrFields) : undefined,
    nested: Array.isArray(c._queryConstraints)
      ? c._queryConstraints.map((nc: any) => serializeQueryConstraint(nc))
      : undefined,
  };
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

  const constraintsKey = JSON.stringify(finalConstraints.map(serializeQueryConstraint));

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
      const publicCollections = ['empresa', 'servicios', 'profesionales', 'locales', 'ajustes_sitio', 'productos', 'settings', 'promociones', 'categorias_servicios', 'configuracion', 'canjes_beneficios'];
      if (!user && !publicCollections.includes(collectionName)) {
        if (loading) setLoading(false);
        setData([]);
        return;
      }

      const q = query(collection(db, collectionName), ...finalConstraints);

      // On public pages (when user is not logged in), use one-time getDocs instead of onSnapshot listener.
      // onSnapshot opens a persistent WebChannel stream (Listen/channel) that stays open indefinitely and times out when Lighthouse runs,
      // triggering net::ERR_TIMED_OUT browser console errors in Lighthouse audits.
      if (!user) {
        let isMounted = true;
        getDocs(q)
          .then((querySnapshot) => {
            if (!isMounted) return;
            const items = querySnapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as T[];
            setData(items);
            setLoading(false);
          })
          .catch((err: FirestoreError) => {
            if (!isMounted) return;
            console.error(`Error fetching collection ${collectionName}:`, err);
            if (err.code === 'permission-denied') {
              const permissionError = new FirestorePermissionError({
                path: collectionName,
                operation: 'list',
                message: err.message,
              });
              errorEmitter.emit('permission-error', permissionError);
              setError(permissionError);
            } else {
              setError(err);
            }
            setLoading(false);
          });

        return () => {
          isMounted = false;
        };
      }

      let isCancelled = false;
      let retryTimeout: ReturnType<typeof setTimeout> | null = null;
      let permissionRetryCount = 0;

      const attachListener = () => {
        if (isCancelled) return;
        unsubscribe();
        unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
          if (isCancelled) return;
          permissionRetryCount = 0;
          const items = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as T[];
          setData(items);
          setLoading(false);
        }, (err: FirestoreError) => {
          if (isCancelled) return;

          // Si el usuario acaba de autenticarse y el canal WebChannel de Firestore aún está propagando el token,
          // reintentar brevemente antes de declarar error de permisos definitivo.
          if (err.code === 'permission-denied' && user && permissionRetryCount < 2) {
            permissionRetryCount += 1;
            const delayMs = permissionRetryCount === 1 ? 350 : 800;
            retryTimeout = setTimeout(() => {
              attachListener();
            }, delayMs);
            return;
          }

          console.error(`Error listening to collection ${collectionName}:`, err);

          if (err.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: collectionName,
              operation: 'list',
              message: err.message,
            });
            errorEmitter.emit('permission-error', permissionError);
            setError(permissionError);
          } else {
            setError(err);
          }
          setLoading(false);
        });
      };

      attachListener();

      return () => {
        isCancelled = true;
        if (retryTimeout) clearTimeout(retryTimeout);
        unsubscribe();
      };

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
