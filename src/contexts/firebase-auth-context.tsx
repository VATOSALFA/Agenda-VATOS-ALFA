
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { type FirebaseStorage } from 'firebase/storage';
import { allPermissions } from '@/lib/permissions';
import { useFirebase } from './firebase-context';
import { useRouter, usePathname } from 'next/navigation';

export interface CustomUser extends FirebaseUser {
    role?: string;
    permissions?: string[];
    local_id?: string;
    avatarUrl?: string;
}

interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  signIn: (email: string, pass: string) => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Partial<AuthContextType>>({});

export const useAuth = () => {
  return useContext(AuthContext) as AuthContextType;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const firebaseContext = useFirebase();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!firebaseContext) return;

    const { auth, db } = firebaseContext;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let userDocRef = doc(db, 'usuarios', firebaseUser.uid);
        let userDoc = await getDoc(userDocRef);
        let customData;

        if (userDoc.exists()) {
            customData = userDoc.data();
        } else {
            userDocRef = doc(db, 'profesionales', firebaseUser.uid);
            userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                customData = userDoc.data();
                if (!customData.role) {
                  customData.role = 'Staff';
                }
            }
        }
        
        if (customData) {
          const isSuperAdmin = customData.role === 'Administrador general' || firebaseUser.email === 'ZeusAlejandro.VatosAlfa@gmail.com';

          setUser({
            ...(firebaseUser as FirebaseUser),
            displayName: customData.name || firebaseUser.displayName,
            role: isSuperAdmin ? 'Administrador general' : customData.role,
            permissions: isSuperAdmin ? allPermissions.map(p => p.key) : (customData.permissions || []),
            local_id: customData.local_id,
            avatarUrl: customData.avatarUrl,
            uid: firebaseUser.uid
          });

        } else {
             console.error(`No se encontró documento de usuario en Firestore para UID: ${firebaseUser.uid} en 'usuarios' o 'profesionales'.`);
             setUser({ ...(firebaseUser as FirebaseUser), role: 'Invitado', permissions: [], uid: firebaseUser.uid }); 
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firebaseContext]);

  useEffect(() => {
    if (!loading) {
      const isProtectedRoute = !pathname.startsWith('/book') && pathname !== '/login';
      if (!user && isProtectedRoute) {
        router.push('/login');
      }
    }
  }, [user, loading, pathname, router]);

  const signIn = async (email: string, pass: string) => {
    if (!firebaseContext) throw new Error("Firebase not initialized");
    const userCredential = await signInWithEmailAndPassword(firebaseContext.auth, email, pass);
    return userCredential.user;
  };

  const signOut = async () => {
    if (!firebaseContext) throw new Error("Firebase not initialized");
    await firebaseSignOut(firebaseContext.auth);
  }

  const value = {
    user,
    loading,
    signIn,
    signOut,
    ...firebaseContext
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
