<<<<<<< HEAD

import { getApps, initializeApp, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyAsUWZLiMR7sVkL0of4i09-6zWfBHFjSUY",
  authDomain: "agenda-1ae08.firebaseapp.com",
  projectId: "agenda-1ae08",
  storageBucket: "agenda-1ae08.appspot.com",
  messagingSenderId: "1071166848434",
  appId: "1:1071166848434:web:e33d3c7373f15c7365d19e",
  measurementId: "G-152Q913238",
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize App Check
if (typeof window !== 'undefined') {
  try {
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6Ld-9_MpAAAAAN2Y03c9zIunS3s-2-DOAC3YcE3q'),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.error("Error initializing App Check:", error);
  }
}


const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage, app };
=======
// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {getAuth,setPersistence,browserLocalPersistence,} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBFVn5uDL7RkAQJdXoGrTitwqcl6kSb-vE",
  authDomain: "agenda-vatos-alfa-v1.firebaseapp.com",
  projectId: "agenda-vatos-alfa-v1",
  storageBucket: "agenda-vatos-alfa-v1.appspot.com", // ← corregido
  messagingSenderId: "964979094210",
  appId: "1:964979094210:web:ebff0199f5c4ec3d98015b",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;

// Persistencia (se ejecuta solo en navegador)
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    /* no-op */
  });
}
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
