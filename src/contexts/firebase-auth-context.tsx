
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { getAuth } from 'firebase/auth';
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
  const [app, setApp] = useState<FirebaseApp | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [db, setDb] = useState<Firestore | null>(null);
  const [storage, setStorage] = useState<FirebaseStorage | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // This effect ensures Firebase is initialized on the client side.
    const firebaseApp = getFirebaseApp();
    const firebaseAuth = getAuth(firebaseApp);
    const firestoreDb = getFirestore(firebaseApp);
    const firebaseStorage = getStorage(firebaseApp);

    setApp(firebaseApp);
    setAuth(firebaseAuth);
    setDb(firestoreDb);
    setStorage(firebaseStorage);

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
            if (!firestoreDb) {
              throw new Error("Firestore is not initialized yet.");
            }
            const userDocRef = doc(firestoreDb, 'usuarios', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
                const customData = userDoc.data();
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
  
  useEffect(() => {
    if (loading) return;

    const isAuthPage = pathname === '/login';
    const isPublicPage = pathname.startsWith('/book');

    if (!user && !isAuthPage && !isPublicPage) {
        router.push('/login');
    }
    
  }, [user, loading, pathname, router]);

  const signIn = (email: string, pass: string) => {
    if (!auth) throw new Error("Firebase Auth not initialized");
    return signInWithEmailAndPassword(auth, email, pass).then(cred => cred.user);
  };

  const signOut = async () => {
    if (!auth) throw new Error("Firebase Auth not initialized");
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    loading,
    db,
    storage,
    auth,
    app,
    signIn,
    signOut,
  };

  if (loading || !db || !auth || !storage || !app) {
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
