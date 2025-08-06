
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type Auth, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface CustomUser extends User {
    role?: string;
    permissions?: string[];
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
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

    if (userData.password !== pass) {
        throw new Error("El correo o la contraseña son incorrectos.");
    }

    // This part is tricky. We can't "log in" to Firebase Auth with a custom password check.
    // What we do here is simulate a user session. For a real app, it's better to migrate
    // these users to Firebase Auth. For now, we'll store user info in the context.
    // We are creating a mock user object to use in the app.
    const mockUser: CustomUser = {
        uid: userDoc!.id,
        email: userData.email,
        displayName: userData.name,
        role: userData.role,
        permissions: userData.permissions,
        // Add other required User properties with mock values
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        providerId: 'password', // or 'custom'
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
    setUser(null); // Clear our custom user session
    return Promise.resolve();
  }

  const value = {
    user,
    loading,
    authInstance: auth,
    signIn,
    signOut,
  };

  if (loading && !user) {
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
