'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db, storage } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { allPermissions, initialRoles } from '@/lib/permissions';
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
            const isSuperAdminByEmail = firebaseUser.email?.toLowerCase() === 'zeusalejandro.vatosalfa@gmail.com'.toLowerCase();

            if (isSuperAdminByEmail) {
                setUser({
                    ...firebaseUser,
                    displayName: 'Zeus Pacheco',
                    email: firebaseUser.email,
                    role: 'Administrador general',
                    permissions: allPermissions.map(p => p.key),
                    uid: firebaseUser.uid,
                });
            } else {
                let userDocRef = doc(db, 'usuarios', firebaseUser.uid);
                let userDoc = await getDoc(userDocRef);
                let customData: any;

                if (userDoc.exists()) {
                    customData = userDoc.data();
                } else {
                    console.warn(`User not found in 'usuarios' for UID: ${firebaseUser.uid}. Checking 'profesionales'...`);
                    const profDocRef = doc(db, 'profesionales', firebaseUser.uid);
                    const profDoc = await getDoc(profDocRef);
                    if (profDoc.exists()) {
                        customData = profDoc.data();
                        if (!customData.role) {
                            customData.role = 'Staff'; 
                        }
                    }
                }
                
                if (customData) {
                    const role = customData.role || 'Administrador general';
                    const isSuperAdminByRole = role === 'Administrador general';

                    // Fetch permissions for the role from Firestore
                    const roleDocRef = doc(db, 'roles', role.toLowerCase().replace(/ /g, '_'));
                    const roleDoc = await getDoc(roleDocRef);
                    
                    let rolePermissions: string[] = [];
                    if (roleDoc.exists()) {
                        rolePermissions = roleDoc.data().permissions || [];
                    } else {
                        // Fallback to initialRoles if not found in DB
                        const initialRole = initialRoles.find(r => r.title === role);
                        rolePermissions = initialRole ? initialRole.permissions : [];
                    }
                    
                    setUser({
                        ...firebaseUser,
                        displayName: customData.name || firebaseUser.displayName,
                        email: customData.email,
                        role: role,
                        permissions: isSuperAdminByRole ? allPermissions.map(p => p.key) : rolePermissions,
                        uid: firebaseUser.uid,
                        local_id: customData.local_id,
                        avatarUrl: customData.avatarUrl,
                    });
                } else {
                     console.error(`CRITICAL: User document for UID ${firebaseUser.uid} not found in 'usuarios' or 'profesionales'. Please verify the user exists in Firestore.`);
                     setUser({ 
                        ...firebaseUser, 
                        role: 'Administrador general', 
                        permissions: allPermissions.map(p => p.key), 
                        uid: firebaseUser.uid 
                    });
                }
            }
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
  const isAuthPage = pathname === '/'; // The root is now the login page

  useEffect(() => {
    if (loading) return;
    
    // If there is a user and they are on the login page, redirect to the main app page
    if (user && isAuthPage) {
        router.replace('/agenda');
    }
    
    // If there is no user and they are on a protected page, redirect to login
    if (!user && !isAuthPage && !isPublicPage) {
        router.replace('/');
    }

  }, [user, loading, pathname, router, isAuthPage, isPublicPage]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    router.push('/');
  };

  const signInAndSetup = async (email: string, pass: string) => {
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
