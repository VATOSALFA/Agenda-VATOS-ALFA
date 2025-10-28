
'use server';

import * as admin from 'firebase-admin';

// Variable para almacenar la app de Firebase y evitar reinicializaciones.
let firebaseAdminApp: admin.app.App | null = null;

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Las variables de entorno solo están disponibles en el entorno de ejecución, no durante la construcción.
  const serviceAccountKeyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKeyString) {
    // During local dev, this might be unavailable. The function calling this should handle it.
    // During build/run on App Hosting, this should always be present.
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY no está disponible. La inicialización del Admin SDK se omitirá.');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKeyString);
    
    console.log("Inicializando Firebase Admin SDK...");
    firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK inicializado con éxito.");
    return firebaseAdminApp;
  } catch (e: any) {
    console.error("Error al parsear FIREBASE_SERVICE_ACCOUNT_KEY o al inicializar Firebase Admin:", e.message);
    // Lanza el error para que la función que lo llama sepa que falló.
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
