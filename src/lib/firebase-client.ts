
// src/lib/firebase-client.ts
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig: FirebaseOptions = {
    apiKey: "YOUR_API_KEY",
    authDomain: "agenda-1ae08.firebaseapp.com",
    projectId: "agenda-1ae08",
    storageBucket: "agenda-1ae08.appspot.com",
    messagingSenderId: "59388998399",
    appId: "1:59388998399:web:73c1d3319045832d20b633",
    measurementId: "G-J61G1R3Y2E"
};


const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

console.log("✅ Firebase App del cliente inicializada.");

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app };
