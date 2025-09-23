
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { doc, getDoc } from 'firebase/firestore';
import { allPermissions } from '@/lib/permissions';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// --- End Firebase Initialization ---

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
  db: typeof db;
  storage: typeof storage;
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
  const pathname = usePathname();
  const router = useRouter();

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
  }, []);
  
  useEffect(() => {
    if (!loading && !user) {
      const isProtectedRoute = !pathname.startsWith('/book') && pathname !== '/login';
      if (isProtectedRoute) {
        router.push('/login');
      }
    }
  }, [user, loading, pathname, router]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null); 
    router.push('/login');
  }
  
  const signIn = async (email: string, pass: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  };

  const value = {
    user,
    loading,
    authInstance: auth,
    db,
    storage,
    signIn,
    signOut,
  };
  
  const isAuthPage = pathname === '/login';
  const isPublicBookingPage = pathname.startsWith('/book');

  if (loading && !isAuthPage && !isPublicBookingPage) {
    return (
      <div className="flex justify-center items-center h-screen bg-muted/40">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
