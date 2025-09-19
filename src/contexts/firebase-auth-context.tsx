
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface CustomUser extends FirebaseUser {
    role?: string;
    permissions?: string[];
    local_id?: string;
    avatarUrl?: string;
}
interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  authInstance: Auth;
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
    // --- INICIO DEL CAMBIO: Simulación de Administrador General ---
    // Forzamos el estado de autenticación a un usuario administrador para saltar el login.
    const adminUser = {
        uid: '6ITeQawj9hMDyw8xWfRs5n4h5yg2',
        email: 'vatosalfa@gmail.com',
        displayName: 'Administrador VATOS ALFA',
        role: 'Administrador general',
        // --- Simulamos el resto de la estructura de FirebaseUser para evitar errores ---
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        providerId: 'firebase',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({}),
        phoneNumber: null,
        photoURL: null,
    };

    setUser(adminUser as CustomUser);
    setLoading(false);
    // --- FIN DEL CAMBIO ---

    // El código original de onAuthStateChanged se comenta temporalmente.
    /*
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const customData = userDoc.data();
          setUser({
            ...firebaseUser,
            role: customData.role,
            permissions: customData.permissions,
            local_id: customData.local_id,
            avatarUrl: customData.avatarUrl
          });
        } else {
             console.error(`No user document found in Firestore for UID: ${firebaseUser.uid}.`);
             setUser(firebaseUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
    */
  }, []);

  const signOut = async () => {
    // A pesar de la simulación, mantenemos un signOut funcional si es necesario.
    // await firebaseSignOut(auth); 
    setUser(null); // Para la simulación, simplemente limpiamos el usuario.
  }

  const value = {
    user,
    loading,
    authInstance: auth,
    signOut,
  };

  if (loading) {
      return (
          <div className="flex justify-center items-center h-screen">
              <Loader2 className="h-8 w-8 animate-spin" />
          </div>
      )
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
