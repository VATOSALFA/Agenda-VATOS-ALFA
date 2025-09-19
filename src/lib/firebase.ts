
import { getApps, initializeApp, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCXXDfdMn8CxVEIwswUXspZzyGkkFebx_M",
  authDomain: "studio-7585847630-c5b35.firebaseapp.com",
  projectId: "studio-7585847630-c5b35",
  storageBucket: "studio-7585847630-c5b35.appspot.com",
  messagingSenderId: "568876080942",
  appId: "1:568876080942:web:94e3ee3c9284f9b5bda4bf",
  measurementId: "G-9W5741P291",
};

// Initialize Firebase
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage, app };
