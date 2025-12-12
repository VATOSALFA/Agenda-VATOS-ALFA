
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type User as FirebaseUser, updateProfile, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { db, auth, storage } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { allPermissions, initialRoles } from '@/lib/permissions';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/app-layout'; // Importar AppLayout
import { LocalProvider } from './local-context';
import { FirebaseErrorListener } from '@/components/firebase/FirebaseErrorListener';

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
  signInAndSetup: (email: string, pass: string, rememberMe?: boolean) => Promise<FirebaseUser>;
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
            let customData: any;
            let userRole: string;
            let userPermissions: string[] = [];

            const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                customData = userDoc.data();
                userRole = customData.role || 'Staff (Sin edición)';
            } else {
                console.warn(`User not found in 'usuarios' for UID: ${firebaseUser.uid}. Checking 'profesionales'...`);
                const profDocRef = doc(db, 'profesionales', firebaseUser.uid);
                const profDoc = await getDoc(profDocRef);
                if (profDoc.exists()) {
                    customData = profDoc.data();
                    userRole = 'Staff (Sin edición)'; 
                } else {
                    console.warn(`User document for UID ${firebaseUser.uid} not found. Defaulting to Admin.`);
                    customData = { name: firebaseUser.displayName, email: firebaseUser.email };
                    userRole = 'Administrador general';
                }
            }

            if (userRole === 'Administrador general') {
                userPermissions = allPermissions.map(p => p.key);
            } else {
                const roleId = userRole.toLowerCase().replace(/ /g, '_');
                const roleDocRef = doc(db, 'roles', roleId);
                const roleDoc = await getDoc(roleDocRef);
                
                if (roleDoc.exists()) {
                    userPermissions = roleDoc.data().permissions || [];
                } else {
                    const initialRole = initialRoles.find(r => r.title === userRole);
                    userPermissions = initialRole ? initialRole.permissions : [];
                    console.warn(`Role '${userRole}' not found in Firestore. Using default permissions.`);
                }
            }
            
            setUser({
                ...firebaseUser,
                displayName: customData.name || firebaseUser.displayName,
                email: customData.email || firebaseUser.email,
                role: userRole,
                permissions: userPermissions,
                uid: firebaseUser.uid,
                local_id: customData.local_id,
                avatarUrl: customData.avatarUrl || firebaseUser.photoURL,
            });

        } catch (error) {
            console.error("Error fetching user data from Firestore:", error);
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
  const isAuthPage = pathname === '/';

  useEffect(() => {
    if (loading) return;
    
    if (user && isAuthPage) {
        router.replace('/agenda');
    }
    
    if (!user && !isAuthPage && !isPublicPage) {
        router.replace('/');
    }

  }, [user, loading, pathname, router, isAuthPage, isPublicPage]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    router.push('/');
  };

  const signInAndSetup = async (email: string, pass: string, rememberMe: boolean = false) => {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
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
  
  if (loading) {
     return (
      <div className="flex justify-center items-center h-screen bg-muted/40">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If there's a user, wrap the children with the full app layout and providers.
  if (user && !isPublicPage && !isAuthPage) {
    return (
      <AuthContext.Provider value={value as AuthContextType}>
        <LocalProvider>
            <AppLayout>{children}</AppLayout>
            <FirebaseErrorListener />
        </LocalProvider>
      </AuthContext.Provider>
    );
  }

  // For public pages or login page, render children without the main app layout.
  return (
    <AuthContext.Provider value={value as AuthContextType}>
        {children}
        <FirebaseErrorListener />
    </AuthContext.Provider>
  );
};
