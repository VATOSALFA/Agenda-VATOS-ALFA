// src/lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";

// ESTE ARCHIVO ES PARA USO DEL LADO DEL SERVIDOR (cuando sea necesario) Y CONFIGURACIÓN BASE.
// LA INICIALIZACIÓN DEL CLIENTE SE MANEJA EN `firebase-client.ts`.

export const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// --- INICIO DE DIAGNÓSTICO ---
console.log("✅ Pilar 1/4 [Credenciales]: La configuración de Firebase se ha cargado:", firebaseConfig.projectId ? "OK" : "¡FALLÓ! projectId está vacío.");
// --- FIN DE DIAGNÓSTICO ---
