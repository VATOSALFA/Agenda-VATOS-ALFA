'use client';

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

export const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

function initializeFirebase() {
    if (getApps().length > 0) {
        return {
            app: getApp(),
            auth: getAuth(),
            db: getFirestore(),
            storage: getStorage(),
            functions: getFunctions(getApp())
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

    // Example for connecting to emulators in development
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
        // To run with emulators, uncomment the following lines
        // and ensure the Firebase Emulator Suite is running.
        // connectAuthEmulator(auth, "http://localhost:9099");
        // connectFirestoreEmulator(db, "localhost", 8080);
        // connectFunctionsEmulator(functions, "localhost", 5001);
        // connectStorageEmulator(storage, "localhost", 9199);
        // console.log("Firebase connected to local emulators.");
    }

    return { app, auth, db, storage, functions };
}


const { app, auth, db, storage, functions } = initializeFirebase();

export { app, auth, db, storage, functions, httpsCallable };
