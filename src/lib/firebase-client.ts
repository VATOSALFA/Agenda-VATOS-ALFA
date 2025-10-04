
// src/lib/firebase-client.ts
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig: FirebaseOptions = {
    apiKey: "YOUR_API_KEY",
    authDomain: "studio-7585847630.firebaseapp.com",
    projectId: "studio-7585847630",
    storageBucket: "studio-7585847630.appspot.com",
    messagingSenderId: "34221543030",
    appId: "1:34221543030:web:d6d4593452290d9f018d0c",
    measurementId: "G-J61G1R3Y2E"
};


const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

console.log("✅ Firebase App del cliente inicializada.");

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app };
