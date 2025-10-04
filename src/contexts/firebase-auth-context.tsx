
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser, getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFirebaseApp } from '@/lib/firebase-client';
import { allPermissions } from '@/lib/permissions';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { FirebaseApp } from 'firebase/app';

export interface CustomUser extends FirebaseUser {
    role?: string;
    permissions?: string[];
    local_id?: string;
    avatarUrl?: string;
}
interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  db: Firestore;
  storage: FirebaseStorage;
  auth: Auth;
  app: FirebaseApp;
  signIn: (email: string, pass: string) => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Partial<AuthContextType>>({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [firebaseServices, setFirebaseServices] = useState<{
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
    storage: FirebaseStorage;
  } | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    setFirebaseServices({ app, auth, db, storage });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
            const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
                const customData = userDoc.data();
                const isSuperAdmin = customData.role === 'Administrador general' || firebaseUser.email === 'vatosalfa@gmail.com';

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
                 console.warn(`No se encontró documento de usuario en Firestore para UID: ${firebaseUser.uid}.`);
                 setUser({ ...(firebaseUser as FirebaseUser), role: 'Invitado', permissions: [], uid: firebaseUser.uid });
            }
        } catch (error) {
            console.error("Error al obtener datos de usuario de Firestore:", error);
            setUser(firebaseUser as CustomUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const isPublicPage = pathname.startsWith('/book');
  const isAuthPage = pathname === '/login';

  useEffect(() => {
    if (loading) return; 

    // Always require login unless it's a public page
    if (!user && !isAuthPage && !isPublicPage) {
        router.push('/login');
    }
  }, [user, loading, pathname, router, isAuthPage, isPublicPage]);

  const signIn = (email: string, pass: string) => {
    if (!firebaseServices?.auth) throw new Error("Firebase Auth not initialized");
    return signInWithEmailAndPassword(firebaseServices.auth, email, pass).then(cred => cred.user);
  };

  const signOut = async () => {
    if (!firebaseServices?.auth) throw new Error("Firebase Auth not initialized");
    await firebaseSignOut(firebaseServices.auth);
  };

  const value = {
    user,
    loading,
    db: firebaseServices?.db,
    storage: firebaseServices?.storage,
    auth: firebaseServices?.auth,
    app: firebaseServices?.app,
    signIn,
    signOut,
  };
  
  if (loading && !isAuthPage) {
     return (
      <div className="flex justify-center items-center h-screen bg-muted/40">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <AuthContext.Provider value={value as AuthContextType}>
      {children}
    </AuthContext.Provider>
  );
};
