
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

// Evita la reinicialización en entornos de desarrollo con recarga rápida.
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
     console.log("✅ Firebase Admin SDK inicializado correctamente.");
  } catch (error: any) {
    if (!/already exists/i.test(error.message)) {
      console.error('Error al inicializar Firebase Admin SDK:', error);
    }
  }
}

export const db = admin.firestore();
export const adminAuth = admin.auth();
