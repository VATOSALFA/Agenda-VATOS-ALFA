// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBFVn5uDL7RkAQJdXoGrTitwqcl6kSb-vE",
  authDomain: "agenda-vatos-alfa-v1.firebaseapp.com",
  projectId: "agenda-vatos-alfa-v1",
  storageBucket: "agenda-vatos-alfa-v1.appspot.com",
  messagingSenderId: "964979094210",
  appId: "1:964979094210:web:ebff0199f5c4ec3d98015b",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
