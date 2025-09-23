
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { allPermissions } from '@/lib/permissions';
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
            // Fallback to check professionals collection if not found in usuarios
            userDocRef = doc(db, 'profesionales', firebaseUser.uid);
            userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                customData = userDoc.data();
                // Assign a default role if not specified for professionals
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
             // Set a default guest user if no data found to avoid app crash
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
    if (!loading) {
      const isProtectedRoute = !pathname.startsWith('/book') && pathname !== '/login';
      if (!user && isProtectedRoute) {
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
