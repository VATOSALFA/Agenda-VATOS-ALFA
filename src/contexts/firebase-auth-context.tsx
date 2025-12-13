
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, type User as FirebaseUser, setPersistence, browserLocalPersistence, browserSessionPersistence, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { db, auth, storage } from '@/lib/firebase-client';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
  signInWithGoogle: () => Promise<FirebaseUser>;
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

          // 1. Check 'usuarios' collection by UID
          const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
          let userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            customData = userDoc.data();
            userRole = customData.role || 'Staff (Sin edición)';
          } else {
            // 1.5. Fallback: Check 'usuarios' by EMAIL (if they were manual created/invited)
            const usersRef = collection(db, 'usuarios');
            const q = query(usersRef, where('email', '==', firebaseUser.email));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              userDoc = querySnapshot.docs[0];
              customData = userDoc.data();
              userRole = customData.role || 'Staff (Sin edición)';
              // Optional: Here we could update the doc to include the new UID for future logins
            } else {
              // 2. Check 'profesionales' collection by UID
              const profDocRef = doc(db, 'profesionales', firebaseUser.uid);
              const profDoc = await getDoc(profDocRef);

              if (profDoc.exists()) {
                customData = profDoc.data();
                userRole = 'Staff (Sin edición)';
              } else {
                // 2.5 Fallback: Check 'profesionales' by email
                const prosRef = collection(db, 'profesionales');
                const qPro = query(prosRef, where('email', '==', firebaseUser.email));
                const querySnapshotPro = await getDocs(qPro);

                if (!querySnapshotPro.empty) {
                  customData = querySnapshotPro.docs[0].data();
                  userRole = 'Staff (Sin edición)';
                } else {
                  // 3. STRICT MODE: User authenticated but NOT AUTHORIZED
                  console.error(`User ${firebaseUser.email} (${firebaseUser.uid}) not found in database. Access Denied.`);
                  await firebaseSignOut(auth);
                  // Throwing error to be caught below
                  throw new Error("ACCESS_DENIED");
                }
              }
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

        } catch (error: any) {
          console.error("Error fetching user data from Firestore:", error);
          setUser(null);
          // If the error was our explicit ACCESS_DENIED, we want the UI to know, but this is inside onAuthStateChanged.
          // The best way is to ensure User is null, so the UI won't redirect to /agenda.
          // If we want to show a toast, we'd need a way to bubble this up, but onAuthStateChanged is a listener.
          // For now, logging out (done above) and handling null user is the safe path.
          if (error.message === "ACCESS_DENIED") {
            // Optionally trigger a custom event or set a global error state if possible. 
            // For simplicity, the user will just remain on the login page (or be redirected there).
          }
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

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    return userCredential.user;
  };

  const value = {
    user,
    loading,
    signInAndSetup,
    signInWithGoogle,
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
