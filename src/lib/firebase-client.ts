
'use client';

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig: FirebaseOptions = {
    apiKey: "YOUR_API_KEY",
    authDomain: "vatosalfa-agenda.firebaseapp.com",
    projectId: "vatosalfa-agenda",
    storageBucket: "vatosalfa-agenda.appspot.com",
    messagingSenderId: "362629633858",
    appId: "1:362629633858:web:7f64b81254359194e99f03",
    measurementId: "G-65YPS2P6M2"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize App Check
if (typeof window !== 'undefined') {
  // This allows the app to work in development environments without a real reCAPTCHA setup.
  if (process.env.NODE_ENV !== 'production') {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  
  try {
    const recaptchaKey = "6LejM_UpAAAAAJTqPzG5_k1ZgR-D3Y-xYgY-5_wZ";
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
