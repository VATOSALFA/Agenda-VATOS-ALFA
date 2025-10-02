// src/lib/firebase-client.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { firebaseConfig } from "./firebase";

let app: FirebaseApp;

// This function ensures Firebase is initialized only once (singleton pattern)
// and ONLY on the client-side.
export function getFirebaseApp(): FirebaseApp {
  if (typeof window === 'undefined') {
    // On the server, return a partially initialized app or handle as needed.
    // This avoids crashes during server-side rendering.
    // This is a safe-guard, this function should ideally only be called client-side.
    return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }

  if (getApps().length === 0) {
    // Initialize the app on the client
    app = initializeApp(firebaseConfig);
    console.log("✅ Pilar 2/4 [Conexión]: Firebase App inicializada correctamente.");

    // Initialize App Check
    try {
      if (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
        initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
        console.log("✅ Pilar 3/4 [Seguridad]: App Check con reCAPTCHA inicializado.");
      } else {
        console.warn("⚠️ Pilar 3/4 [Seguridad]: NO se encontró clave reCAPTCHA. App Check no inicializado.");
      }
    } catch(e) {
      console.error("❌ Pilar 3/4 [Seguridad]: Error inicializando Firebase App Check:", e);
    }
  } else {
    app = getApp();
  }

  return app;
}
