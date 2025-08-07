
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface CustomUser extends FirebaseUser {
    role?: string;
    permissions?: string[];
    local_id?: string;
}
interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  authInstance: Auth;
  signIn: (email: string, pass: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Partial<AuthContextType>>({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // This is a real Firebase Auth user. For this app, we need to fetch our custom user data.
        // Let's assume the document ID in 'usuarios' is the same as the Firebase Auth UID.
        const userDocRef = doc(db, 'usuarios', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const customData = userDocSnap.data();
            setUser({ ...firebaseUser, ...customData });
        } else {
            // Fallback or handle case where custom user doc doesn't exist
            setUser(firebaseUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string) => {
    const usersRef = collection(db, "usuarios");
    const q = query(usersRef, where("email", "==", email));
    
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        throw new Error("El correo o la contraseña son incorrectos.");
    }
    
    let userData: any = null;
    let userDoc = null;
    querySnapshot.forEach((doc) => {
        userData = doc.data();
        userDoc = doc;
    });

    // For a real app using Firebase Auth, this would be `signInWithEmailAndPassword`.
    // Here we are simulating login based on a password field in Firestore.
    if (!userData.password || userData.password !== pass) {
        throw new Error("El correo o la contraseña son incorrectos.");
    }
    
    const mockUser: CustomUser = {
        uid: userDoc!.id,
        email: userData.email,
        displayName: userData.name,
        role: userData.role,
        permissions: userData.permissions,
        local_id: userData.local_id,
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        providerId: 'password',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({}),
        phoneNumber: null,
        photoURL: null,
    };
    
    setUser(mockUser);
    
    return mockUser;
  }

  const signOut = () => {
    setUser(null); 
    return Promise.resolve();
  }

  const value = {
    user,
    loading,
    authInstance: auth,
    signIn,
    signOut,
  };

  if (loading) {
      return (
          <div className="flex justify-center items-center h-screen">
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
