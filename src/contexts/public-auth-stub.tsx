'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Lightweight AuthProvider stub for public-facing pages.
 * Exposes the same useAuth() interface as firebase-auth-context.tsx
 * but returns static defaults WITHOUT loading Firebase Auth SDK (~92KB).
 */

interface PublicAuthContextType {
  user: null;
  loading: false;
  db: any;
  storage: any;
  signInAndSetup: (email: string, pass: string, rememberMe?: boolean) => Promise<any>;
  signInWithGoogle: () => Promise<any>;
  signOut: () => Promise<void>;
}

const PublicAuthContext = createContext<Partial<PublicAuthContextType>>({
  user: null,
  loading: false,
});

export const useAuth = () => {
  const context = useContext(PublicAuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const PublicAuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();

  const redirectToLogin = async () => {
    router.push('/login');
    throw new Error('Authentication required. Redirecting to login.');
  };

  const value: PublicAuthContextType = {
    user: null,
    loading: false,
    db: null,
    storage: null,
    signInAndSetup: redirectToLogin,
    signInWithGoogle: redirectToLogin,
    signOut: async () => { router.push('/login'); },
  };

  return (
    <PublicAuthContext.Provider value={value}>
      {children}
    </PublicAuthContext.Provider>
  );
};
