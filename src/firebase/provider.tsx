
'use client';

import React, { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, FirebaseStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, Functions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { firebaseConfig } from "./config";

interface FirebaseContextType {
    app: FirebaseApp;
    auth: Auth;
    db: Firestore;
    storage: FirebaseStorage;
    functions: Functions;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

function initializeFirebase() {
    if (getApps().length > 0) {
        const app = getApp();
        return {
            app,
            auth: getAuth(app),
            db: getFirestore(app),
            storage: getStorage(app),
            functions: getFunctions(app, 'us-central1')
        };
    }

    if (!firebaseConfig.apiKey) {
        throw new Error("Firebase API Key is missing. Check your environment variables.");
    }
    
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    const functions = getFunctions(app, 'us-central1'); // Specify region if needed

    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
        // connectAuthEmulator(auth, "http://localhost:9099");
        // connectFirestoreEmulator(db, "localhost", 8080);
        // connectFunctionsEmulator(functions, "localhost", 5001);
        // connectStorageEmulator(storage, "localhost", 9199);
    }

    return { app, auth, db, storage, functions };
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
    const firebaseServices = initializeFirebase();

    return (
        <FirebaseContext.Provider value={firebaseServices}>
            {children}
        </FirebaseContext.Provider>
    );
}

export const useFirebase = () => {
    const context = useContext(FirebaseContext);
    if (!context) {
        throw new Error("useFirebase must be used within a FirebaseProvider");
    }
    return context;
};

// Re-export core instances for convenience
export const { app, auth, db, storage, functions } = initializeFirebase();
export { httpsCallable };
