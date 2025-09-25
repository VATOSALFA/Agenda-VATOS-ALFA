
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser, getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseApp } from '@/lib/firebase';
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
  return useContext(AuthContext) as AuthContextType;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Initialize Firebase services here, ensuring it only runs on the client
  const app = getFirebaseApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);


  useEffect(() => {
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
  }, [auth, db]);

  const signIn = async (email: string, pass: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  }

  const value = {
    user,
    loading,
    auth,
    db,
    storage,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
