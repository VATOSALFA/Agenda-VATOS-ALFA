// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

// Evita la reinicialización en entornos de desarrollo con recarga rápida.
// Este es el método de inicialización estándar y recomendado para entornos de Google Cloud como App Hosting.
// Se basa en la variable de entorno GOOGLE_APPLICATION_CREDENTIALS que se configura a nivel de infraestructura.
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('Error al inicializar Firebase Admin SDK:', error);
  }
}

export const db = admin.firestore();
export const adminAuth = admin.auth();
