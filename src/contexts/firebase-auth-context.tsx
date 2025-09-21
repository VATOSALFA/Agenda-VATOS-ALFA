
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

interface CustomUser extends Partial<FirebaseUser> {
    role?: string;
    permissions?: string[];
    local_id?: string;
    avatarUrl?: string;
    displayName?: string;
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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const customData = userDoc.data();
          setUser({
            ...firebaseUser,
            displayName: customData.name || firebaseUser.displayName,
            role: customData.role,
            permissions: customData.permissions || [],
            local_id: customData.local_id,
            avatarUrl: customData.avatarUrl
          });
        } else {
             console.error(`No se encontró documento de usuario en Firestore para UID: ${firebaseUser.uid}.`);
             setUser({ ...firebaseUser, role: 'Invitado', permissions: [] }); // Fallback with no permissions
        }
      } else {
        setUser(null);
        if (pathname !== '/login') {
            router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [pathname, router]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null); 
    router.push('/login');
  }

  const value = {
    user,
    loading,
    authInstance: auth,
    signOut,
  };

  if (loading) {
      return (
          <div className="flex justify-center items-center h-screen bg-muted/40">
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
