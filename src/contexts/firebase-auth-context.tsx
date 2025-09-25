
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { allPermissions } from '@/lib/permissions';

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
  return useContext(AuthContext);
};

interface AuthProviderProps {
    children: ReactNode;
    authInstance: Auth;
    dbInstance: Firestore;
    storageInstance: FirebaseStorage;
}

export const AuthProvider = ({ children, authInstance, dbInstance, storageInstance }: AuthProviderProps) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(authInstance, async (firebaseUser) => {
      if (firebaseUser) {
        let userDocRef = doc(dbInstance, 'usuarios', firebaseUser.uid);
        let userDoc = await getDoc(userDocRef);
        let customData;

        if (userDoc.exists()) {
            customData = userDoc.data();
        } else {
            userDocRef = doc(dbInstance, 'profesionales', firebaseUser.uid);
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
  }, [authInstance, dbInstance]);

  const signOut = async () => {
    await firebaseSignOut(authInstance);
    setUser(null);
  }
  
  const signIn = async (email: string, pass: string) => {
    const userCredential = await signInWithEmailAndPassword(authInstance, email, pass);
    return userCredential.user;
  };

  const value = {
    user,
    loading,
    auth: authInstance,
    db: dbInstance,
    storage: storageInstance,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
