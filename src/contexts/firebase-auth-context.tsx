
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase-client';
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
  storage: any; // Add storage to context if needed elsewhere
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
  
  const pathname = usePathname();
  const router = useRouter();
  
  const signOut = React.useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
            // Grant full permissions to any logged-in user
            const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const userData = userDoc.data();
                setUser({
                    ...(firebaseUser as FirebaseUser),
                    displayName: userData.name || firebaseUser.displayName,
                    email: userData.email,
                    role: userData.role,
                    permissions: allPermissions.map(p => p.key),
                    uid: firebaseUser.uid,
                    local_id: userData.local_id,
                    avatarUrl: userData.avatarUrl,
                });
            } else {
                 setUser({
                    ...(firebaseUser as FirebaseUser),
                    displayName: firebaseUser.displayName || 'Usuario',
                    role: 'Administrador general',
                    permissions: allPermissions.map(p => p.key),
                    uid: firebaseUser.uid
                });
            }

        } catch (error) {
            console.error("Error al obtener datos de usuario de Firestore:", error);
            // Fallback to a super user in case of error, ensuring access
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
    if (loading) return; 

    // Force sign-out on initial load if not on login/public page
    if (user && !isAuthPage && !isPublicPage) {
        // This logic is now handled inside onAuthStateChanged
    } else if (!user && !isAuthPage && !isPublicPage) {
        router.push('/login');
    }
    
    // On initial load, sign out any existing session
    const初回読み込み時に既存のセッションをサインアウトする
    if (user) {
        const sessionInitialized = sessionStorage.getItem('sessionInitialized');
        if (!sessionInitialized) {
            signOut();
            sessionStorage.setItem('sessionInitialized', 'true');
        }
    }


  }, [user, loading, pathname, router, isAuthPage, isPublicPage, signOut]);

  const signIn = (email: string, pass: string) => {
    sessionStorage.removeItem('sessionInitialized');
    return signInWithEmailAndPassword(auth, email, pass).then(cred => cred.user);
  };

  const value = {
    user,
    loading,
    signIn,
    signOut,
    db // Pass db instance through context
  };
  
  if (loading && !isAuthPage) {
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
