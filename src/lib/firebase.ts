
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
  // Only initialize App Check on localhost to avoid reCAPTCHA errors in production
  // The long term solution is to properly configure reCAPTCHA for the production domains in the Google Cloud Console.
  if (window.location.hostname === "localhost") {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6Ld-i_spAAAAANd2JwA4h0c0eXmhS3F5_dbsS5B_'), // Replace with your reCAPTCHA v3 site key
        isTokenAutoRefreshEnabled: true
      });
      console.log("Firebase App Check initialized for localhost");
    } catch (error) {
      console.error("Error initializing Firebase App Check:", error);
    }
  }
}

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage, app };
