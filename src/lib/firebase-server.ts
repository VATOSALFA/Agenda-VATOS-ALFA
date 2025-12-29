
'use server';

import * as admin from 'firebase-admin';

// Variable para almacenar la app de Firebase y evitar reinicializaciones.
let firebaseAdminApp: admin.app.App | null = null;

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Las variables de entorno solo están disponibles en el entorno de ejecución.
  const serviceAccountKeyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  try {
    if (serviceAccountKeyString) {
      console.log("Inicializando Firebase Admin SDK con CLAVE proporcionada...");
      const serviceAccount = JSON.parse(serviceAccountKeyString);
      firebaseAdminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      console.log("Inicializando Firebase Admin SDK con Credenciales por Defecto (ADC)...");
      // En entornos de Google Cloud (App Hosting, Functions, Run), esto usa la cuenta de servicio por defecto automáticamente.
      firebaseAdminApp = admin.initializeApp();
    }

    console.log("Firebase Admin SDK inicializado con éxito.");
    return firebaseAdminApp;
  } catch (e: any) {
    console.error("Error al inicializar Firebase Admin:", e.message);
    throw new Error("No se pudo inicializar Firebase Admin SDK: " + e.message);
  }
};

function getDb() {
  const app = firebaseAdminApp || initializeFirebaseAdmin();
  if (!app) {
    throw new Error("Firebase Admin SDK no está inicializado. No se puede acceder a Firestore.");
  }
  return admin.firestore(app);
}

function getAuth() {
  const app = firebaseAdminApp || initializeFirebaseAdmin();
  if (!app) {
    throw new Error("Firebase Admin SDK no está inicializado. No se puede acceder a Auth.");
  }
  return admin.auth(app);
}

// Exportar las funciones para obtener las instancias
export { getDb, getAuth };
