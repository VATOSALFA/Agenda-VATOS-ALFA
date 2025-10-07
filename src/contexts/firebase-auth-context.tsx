
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db, storage } from '@/lib/firebase-client';
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
  db: typeof db;
  storage: typeof storage;
  signInAndSetup: (email: string, pass: string) => Promise<FirebaseUser>;
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
  
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
            let userDocRef = doc(db, 'usuarios', firebaseUser.uid);
            let userDoc = await getDoc(userDocRef);
            let customData;

            if (userDoc.exists()) {
                customData = userDoc.data();
            } else {
                console.warn(`User document not found in 'usuarios' for UID: ${firebaseUser.uid}. This may not be an error if the user is a 'profesional'.`);
            }
            
            if (customData) {
                const isSuperAdmin = customData.role === 'Administrador general';
                setUser({
                    ...(firebaseUser as FirebaseUser),
                    displayName: customData.name || firebaseUser.displayName,
                    email: customData.email,
                    role: isSuperAdmin ? 'Administrador general' : customData.role,
                    permissions: isSuperAdmin ? allPermissions.map(p => p.key) : (customData.permissions || []),
                    uid: firebaseUser.uid,
                    local_id: customData.local_id,
                    avatarUrl: customData.avatarUrl,
                });
            } else {
                 // If user is not in 'usuarios', treat as super admin for initial setup or error case
                 setUser({
                    ...(firebaseUser as FirebaseUser),
                    displayName: firebaseUser.displayName || 'Super Admin',
                    role: 'Administrador general',
                    permissions: allPermissions.map(p => p.key),
                    uid: firebaseUser.uid
                });
            }

        } catch (error) {
            console.error("Error fetching user data from Firestore:", error);
            // Fallback to super admin on error to prevent being locked out
            setUser({ 
              ...(firebaseUser as FirebaseUser), 
              role: 'Administrador general', 
              permissions: allPermissions.map(p => p.key),
              uid: firebaseUser.uid 
            });
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
    if (!loading && !user && !isAuthPage && !isPublicPage) {
        router.push('/login');
    }
  }, [user, loading, pathname, router, isAuthPage, isPublicPage]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  const signInAndSetup = async (email: string, pass: string) => {
    await firebaseSignOut(auth).catch(() => {}); // Clear any potential session remnants
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    // The onAuthStateChanged listener will handle setting the user state.
    return userCredential.user;
  };

  const value = {
    user,
    loading,
    signInAndSetup,
    signOut,
    db,
    storage,
  };
  
  if (loading && !isAuthPage && !isPublicPage) {
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
