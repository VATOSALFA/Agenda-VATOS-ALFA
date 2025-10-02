
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';
import { firebaseConfig } from './firebase';

// Evita la reinicialización en entornos de desarrollo con recarga rápida.
if (!admin.apps.length) {
  try {
    // Para entornos de producción de Google, initializeApp() sin argumentos funciona.
    // Para desarrollo local, podrías necesitar un archivo de credenciales.
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...firebaseConfig
    });
  } catch (error: any) {
    // Ignorar el error de "ya existe" que puede ocurrir en el hot-reload de Next.js
    if (!/already exists/i.test(error.message)) {
      console.error('Error al inicializar Firebase Admin SDK:', error);
    }
  }
}

export const db = admin.firestore();
export const adminAuth = admin.auth();
