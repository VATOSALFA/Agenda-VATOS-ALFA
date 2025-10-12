
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
            // First, try to find the user in the 'usuarios' collection
            let userDocRef = doc(db, 'usuarios', firebaseUser.uid);
            let userDoc = await getDoc(userDocRef);
            let customData: any;

            if (userDoc.exists()) {
                customData = userDoc.data();
            } else {
                 // Fallback: If not in 'usuarios', check 'profesionales'
                console.warn(`User not found in 'usuarios' for UID: ${firebaseUser.uid}. Checking 'profesionales'...`);
                const profDocRef = doc(db, 'profesionales', firebaseUser.uid);
                const profDoc = await getDoc(profDocRef);
                if (profDoc.exists()) {
                    customData = profDoc.data();
                    // Assign a default role if a professional logs in without a role in their doc
                    if (!customData.role) {
                        customData.role = 'Staff';
                        customData.permissions = ['ver_agenda']; // Minimal permission for a staff member
                    }
                }
            }
            
            if (customData) {
                const isSuperAdmin = customData.role === 'Administrador general';
                setUser({
                    ...firebaseUser,
                    displayName: customData.name || firebaseUser.displayName,
                    email: customData.email,
                    role: isSuperAdmin ? 'Administrador general' : customData.role,
                    permissions: isSuperAdmin ? allPermissions.map(p => p.key) : (customData.permissions || []),
                    uid: firebaseUser.uid,
                    local_id: customData.local_id,
                    avatarUrl: customData.avatarUrl,
                });
            } else {
                 console.error(`CRITICAL: User document for UID ${firebaseUser.uid} not found in 'usuarios' or 'profesionales'. Please verify the user exists in Firestore.`);
                 // Fallback to a restricted user to prevent app crash
                 setUser({ 
                    ...firebaseUser, 
                    role: 'Invitado', 
                    permissions: [], 
                    uid: firebaseUser.uid 
                });
            }

        } catch (error) {
            console.error("Error fetching user data from Firestore:", error);
            // Fallback to super admin on error to prevent being locked out
            setUser({ 
              ...firebaseUser, 
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
