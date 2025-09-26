
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { allPermissions } from '@/lib/permissions';
import { useFirebase } from './firebase-context';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

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
  auth: Auth;
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
    if (!firebaseContext || !firebaseContext.auth || !firebaseContext.db) {
      setLoading(false);
      return;
    }

    const { auth, db } = firebaseContext;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
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
                    if (!customData.role) customData.role = 'Staff (Sin edición)';
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
                 console.warn(`No user document found for UID: ${firebaseUser.uid}. Treating as guest.`);
                 setUser({ ...(firebaseUser as FirebaseUser), role: 'Invitado', permissions: [], uid: firebaseUser.uid }); 
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            setUser(null);
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
    setUser(null); 
    router.push('/login');
  }

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signOut,
    auth: firebaseContext?.auth,
    db: firebaseContext?.db,
    storage: firebaseContext?.storage,
  } as AuthContextType;

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
