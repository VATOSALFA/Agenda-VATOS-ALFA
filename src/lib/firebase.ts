// src/lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";

export const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// This function will be called ONLY within a controlled client-side context
export const getFirebaseApp = () => {
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
}
