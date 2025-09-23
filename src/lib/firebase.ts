
// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

let firebaseConfig;

// On the server, Firebase App Hosting provides the config as a JSON string.
// On the client, it's exposed via process.env.
if (typeof window === 'undefined' && process.env.FIREBASE_WEBAPP_CONFIG) {
    firebaseConfig = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG);
} else {
    // Fallback for client-side and local development
    firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: "agenda-1ae08.firebaseapp.com",
      projectId: "agenda-1ae08",
      storageBucket: "agenda-1ae08.appspot.com",
      messagingSenderId: "56391456543",
      appId: "1:56391456543:web:5d79c3f5904acb8e61198e",
    };
}


const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
