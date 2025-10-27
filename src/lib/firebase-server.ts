'use server';

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet.
if (!admin.apps.length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      // This will be the case during the build process, which is fine.
      // The app will have the env var at runtime.
      console.log('FIREBASE_SERVICE_ACCOUNT_KEY is not available during build. Skipping admin initialization.');
    } else {
      const serviceAccount = JSON.parse(serviceAccountKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    // Don't throw an error during build, but log it.
    // The runtime environment should have the correct key.
  }
}

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };
