
'use client';

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

let app;

// Initialize Firebase only once
if (getApps().length === 0) {
    if (!firebaseConfig.apiKey) {
        throw new Error("Firebase API Key is missing. Check your environment variables.");
    }
    app = initializeApp(firebaseConfig);

    // Initialize App Check
    if (typeof window !== 'undefined') {
      // This allows the app to work in development environments without a real reCAPTCHA setup.
      if (process.env.NODE_ENV !== 'production') {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      
      try {
        // IMPORTANT: Replace this with your actual reCAPTCHA v3 site key from the Firebase console.
        const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
        if (recaptchaKey) {
            initializeAppCheck(app, {
              provider: new ReCaptchaV3Provider(recaptchaKey),
              isTokenAutoRefreshEnabled: true
            });
            console.log("Firebase App Check initialized successfully.");
        } else {
            console.warn("reCAPTCHA site key not found. App Check will not be initialized.");
        }
      } catch (error) {
        console.error("Error initializing Firebase App Check:", error);
      }
    }

} else {
    app = getApp();
}


export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export { app, httpsCallable };
