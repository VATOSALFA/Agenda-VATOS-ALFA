// src/lib/firebase-server.ts
import * as admin from 'firebase-admin';

// Evita la reinicialización en entornos de desarrollo con recarga rápida.
if (!admin.apps.length) {
  try {
    // Estas variables deben estar definidas en tu entorno de hosting (ej. App Hosting)
    // como secretos.
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('La variable de entorno FIREBASE_PRIVATE_KEY no está definida.');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Reemplaza los escapes literales \\n con saltos de línea reales
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin SDK:', error);
  }
}

export const db = admin.firestore();
export const adminAuth = admin.auth();
