

// Import the functions you need from the SDKs you need
import { getApps, initializeApp, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from "firebase/app-check";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAsUWZLiMR7sVkL0of4i09-6zWfBHFjSUY",
  authDomain: "agenda-1ae08.firebaseapp.com",
  projectId: "agenda-1ae08",
  storageBucket: "agenda-1ae08.appspot.com",
  messagingSenderId: "34221543030",
  appId: "1:34221543030:web:b46655e3ef8d7de4539957",
  measurementId: "G-MZC8TZBYFL"
};

// Initialize Firebase
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// App Check initialization (Temporarily disabled for development)
// if (typeof window !== 'undefined') {
//   try {
//     // Set the debug token in development. This will be used by the CustomProvider.
//     if (process.env.NODE_ENV === 'development') {
//       (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
//     }
    
//     const appCheck = initializeAppCheck(app, {
//       provider: new ReCaptchaV3Provider('6LcMPcYrAAAAANsqhsBgm9ja0C8mJ7Mh8WN8TcTo'),
//       isTokenAutoRefreshEnabled: true
//     });
//   } catch (e) {
//     console.error("Error initializing Firebase App Check:", e);
//   }
// }

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage, app };
