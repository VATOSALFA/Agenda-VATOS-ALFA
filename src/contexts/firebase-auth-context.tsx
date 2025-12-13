
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type User as FirebaseUser, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { db, auth, storage } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { allPermissions, initialRoles } from '@/lib/permissions';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/app-layout'; 
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
            let userRole: string = 'Staff (Sin edición)'; // Default role if not found, but NOT Admin
            let userPermissions: string[] = [];

            // 1. Check 'usuarios' collection
            const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                customData = userDoc.data();
                userRole = customData.role || 'Staff (Sin edición)';
            } else {
                // 2. Check 'profesionales' collection
                const profDocRef = doc(db, 'profesionales', firebaseUser.uid);
                const profDoc = await getDoc(profDocRef);
                
                if (profDoc.exists()) {
                    customData = profDoc.data();
                    userRole = 'Staff (Sin edición)'; 
                } else {
                    // 3. User authenticated but has no data records
                    console.warn(`User document for UID ${firebaseUser.uid} not found.`);
                    // DO NOT GRANT ADMIN HERE. 
                    customData = { name: firebaseUser.displayName, email: firebaseUser.email };
                    // Keep default safe role
                }
            }

            // 4. Fetch permissions based on Role
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
             // In case of error, ensuring we don't grant Admin either
            setUser(null); 
            // Or maybe a limited user, but null forces re-login or error state
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

  // Handling redirects in a separate effect to avoid updates during render
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

  // Logic to wrap safe content
  // If we are logged in and in a protected route, we explicitly block rendering until we are sure
  if (!user && !isAuthPage && !isPublicPage) {
      return null; // Don't render anything while redirecting
  }

  // If there's a user and we are inside the app
  if (user && !isPublicPage && !isAuthPage) {
    return (
      <AuthContext.Provider value={value as AuthContextType}>
          <AppLayout>
            {children}
          </AppLayout>
          <FirebaseErrorListener />
      </AuthContext.Provider>
    );
  }

  // Default return (Login page, Public pages)
  return (
    <AuthContext.Provider value={value as AuthContextType}>
        {children}
        <FirebaseErrorListener />
    </AuthContext.Provider>
  );
};
