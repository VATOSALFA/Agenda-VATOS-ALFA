
import { getApps, initializeApp, getApp, FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
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
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Ld-9_MpAAAAAN2Y03c9zIunS3s-2-DOAC3YcE3q'),
    isTokenAutoRefreshEnabled: true
  });
}


const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage, app };
