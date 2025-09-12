
// Import the functions you need from the SDKs you need
import { getApps, initializeApp, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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

// Initialize App Check
if (typeof window !== 'undefined') {
  try {
    // IMPORTANT: Replace with your actual reCAPTCHA v3 site key from the Google Cloud console.
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LcMPcYrAAAAANsqhsBgm9ja0C8mJ7Mh8WN8TcTo'), 
      isTokenAutoRefreshEnabled: true
    });
    console.log("Firebase App Check initialized.");
  } catch (error) {
    console.error("Error initializing Firebase App Check:", error);
  }
}

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage, app };
