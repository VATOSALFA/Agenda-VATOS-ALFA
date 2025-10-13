
'use client';

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig: FirebaseOptions = {
    apiKey: "AIzaSyAsUWZLiMR7sVkL0of4i09-6zWfBHFjSUY",
    authDomain: "agenda-1ae08.firebaseapp.com",
    projectId: "agenda-1ae08",
    storageBucket: "agenda-1ae08.firebasestorage.app",
    messagingSenderId: "34221543030",
    appId: "1:34221543030:web:b46655e3ef8d7de4539957",
    measurementId: "G-MZC8TZBYFL"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize App Check
if (typeof window !== 'undefined') {
  // This allows the app to work in development environments without a real reCAPTCHA setup.
  if (process.env.NODE_ENV !== 'production') {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  
  try {
    const recaptchaKey = "6LfPidorAAAAAMRvfe91b-8_Jmzsrdc_qNmj3N78";
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


export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export { app, httpsCallable };
