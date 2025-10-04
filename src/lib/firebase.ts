
// src/lib/firebase.ts
// THIS FILE IS FOR SERVER-SIDE USE (when necessary) AND BASE CONFIGURATION.
// CLIENT-SIDE INITIALIZATION IS HANDLED IN `firebase-client.ts`.
// DO NOT EXPORT `db` OR `auth` FROM THIS FILE FOR CLIENT-SIDE USE.
import type { FirebaseOptions } from "firebase/app";

export const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// --- STARTUP DIAGNOSTIC ---
console.log("✅ Pilar 1/4 [Credenciales]: La configuración de Firebase se ha cargado:", firebaseConfig.projectId ? "OK" : "¡FALLÓ! projectId está vacío.");
// --- END DIAGNOSTIC ---
