
// src/lib/firebase-client.ts
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig: FirebaseOptions = {
    apiKey: "YOUR_API_KEY", // Reemplaza con la clave de API real de tu proyecto
    authDomain: "agenda-1ae08.firebaseapp.com",
    projectId: "agenda-1ae08",
    storageBucket: "agenda-1ae08.appspot.com",
    messagingSenderId: "34221543030", // Asumiendo que es el número del proyecto
    appId: "YOUR_APP_ID", // Reemplaza con el App ID real
    measurementId: "YOUR_MEASUREMENT_ID" // Opcional, reemplaza si lo tienes
};


const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

console.log("✅ Firebase App del cliente inicializada.");

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app };
