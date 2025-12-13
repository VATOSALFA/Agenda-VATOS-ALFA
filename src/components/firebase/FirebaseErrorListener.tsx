'use client';

import { useEffect, useState } from 'react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';
import { useAuth } from '@/contexts/firebase-auth-context';

export function FirebaseErrorListener() {
  const [error, setError] = useState<FirestorePermissionError | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const handleError = (e: FirestorePermissionError) => {
      console.info("Contextual error received by listener:", e);
      setError(e);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  if (!error) {
    return null;
  }
  
  const requestContext = {
      auth: user ? {
          uid: user.uid,
          token: {
              name: user.displayName,
              email: user.email,
              picture: user.photoURL,
              email_verified: user.emailVerified,
              phone_number: user.phoneNumber,
          }
      } : null,
      method: error.context.operation,
      path: error.context.path,
      request: {
          resource: {
              data: error.context.requestResourceData || null
          }
      }
  };

  const jsonString = JSON.stringify(requestContext, null, 2);

  return (
    <div 
        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: 'monospace',
            padding: '2rem'
        }}
    >
      <div style={{
          backgroundColor: '#282c34',
          borderRadius: '8px',
          padding: '2rem',
          width: '80%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          overflow: 'auto',
          border: '1px solid #ff5555'
      }}>
        <h2 style={{ color: '#ff5555', fontSize: '1.5rem', marginBottom: '1rem' }}>
          Firestore Security Rule Error
        </h2>
        <p style={{ color: '#abb2bf', marginBottom: '1.5rem' }}>
          The following request was denied by your security rules. Review the context below and adjust your `firestore.rules` file.
        </p>
        <pre
          style={{
            backgroundColor: '#21252b',
            padding: '1rem',
            borderRadius: '4px',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            color: '#c8ccd4'
          }}
        >
          {jsonString}
        </pre>
        <button
          onClick={() => setError(null)}
          style={{
            marginTop: '1.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#ff5555',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}