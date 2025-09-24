// src/lib/firebase-server.ts
import * as admin from 'firebase-admin';

// Re-utiliza las variables de entorno que ya tenemos.
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Evita la reinicialización en entornos de desarrollo con recarga rápida.
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseConfig.projectId,
        // Las variables de cliente y email se obtienen del entorno de ejecución.
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
      databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`,
    });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin SDK:', error);
  }
}

export const db = admin.firestore();
export const adminAuth = admin.auth();
