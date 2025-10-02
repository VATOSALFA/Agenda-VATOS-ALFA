
// src/lib/firebase-client.ts
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { firebaseConfig } from "./firebase";

let app: FirebaseApp;

// This function ensures Firebase is initialized only once (singleton pattern)
// and ONLY on the client-side.
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  app = initializeApp(firebaseConfig);
  console.log("✅ Pilar 2/4 [Conexión]: Firebase App inicializada correctamente.");

  // Initialize App Check only on the client
  if (typeof window !== 'undefined') {
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
  }

  return app;
}
