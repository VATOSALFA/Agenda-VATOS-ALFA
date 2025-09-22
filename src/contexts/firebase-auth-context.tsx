
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
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
  authInstance: Auth;
  signIn: (email: string, pass: string) => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Partial<AuthContextType>>({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set persistence on the client-side
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            // First, try to get user data from 'usuarios' collection
            let userDocRef = doc(db, 'usuarios', firebaseUser.uid);
            let userDoc = await getDoc(userDocRef);
            let customData;

            if (userDoc.exists()) {
                customData = userDoc.data();
            } else {
                // If not in 'usuarios', try 'profesionales'
                userDocRef = doc(db, 'profesionales', firebaseUser.uid);
                userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    customData = userDoc.data();
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
      })
      .catch((error) => {
        console.error("Error setting auth persistence:", error);
        setLoading(false);
      });
  }, []);
  
  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null); 
  }
  
  const signIn = async (email: string, pass: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  };

  const value = {
    user,
    loading,
    authInstance: auth,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
