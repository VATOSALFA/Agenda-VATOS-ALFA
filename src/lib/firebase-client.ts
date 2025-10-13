
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig: FirebaseOptions = {
    apiKey: "AIzaSyAZL8T2nJ3G-u_y_6c4s8N5rO7dZ1fX9Y8",
    authDomain: "vatosalfa-agenda.firebaseapp.com",
    projectId: "vatosalfa-agenda",
    storageBucket: "vatosalfa-agenda.appspot.com",
    messagingSenderId: "991483842329",
    appId: "1:991483842329:web:e7c1797c23b2b4e5488195",
    measurementId: "G-G5D1Q5L51P"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize App Check
if (typeof window !== 'undefined') {
  // This allows the app to work in development environments without a real reCAPTCHA setup.
  if (process.env.NODE_ENV !== 'production') {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  
  try {
    const recaptchaKey = "6LcU3vwpAAAAAJJz22WOZk5s_V2i65zC9i8i_fGz";
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
