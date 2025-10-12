
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig: FirebaseOptions = {
    apiKey: "YOUR_API_KEY",
    authDomain: "vatosalfa--agenda-1ae08.firebaseapp.com",
    projectId: "vatosalfa--agenda-1ae08",
    storageBucket: "vatosalfa--agenda-1ae08.appspot.com",
    messagingSenderId: "1083906282837",
    appId: "1:1083906282837:web:808892f39b69b5c92d5257",
    measurementId: "G-9XG33J03H0"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize App Check
if (typeof window !== 'undefined') {
  // This allows the app to work in development environments without a real reCAPTCHA setup.
  if (process.env.NODE_ENV !== 'production') {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  
  try {
    const recaptchaKey = "6LfwqgsqAAAAAIYn0x10aJq3hA_3f1q2iS-mXyde";
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
