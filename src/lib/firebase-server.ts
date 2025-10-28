
'use server';

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet.
const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY is not available. Admin SDK not initialized.');
    return null;
  }
  
  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch(e) {
      console.error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.");
      return null;
  }
};

function getDb() {
  const app = initializeFirebaseAdmin();
  if (!app) {
    throw new Error("Firebase Admin SDK is not initialized. Cannot access Firestore.");
  }
  return admin.firestore();
}

function getAuth() {
  const app = initializeFirebaseAdmin();
  if (!app) {
      throw new Error("Firebase Admin SDK is not initialized. Cannot access Auth.");
  }
  return admin.auth();
}

// Export functions to get the instances
export { getDb, getAuth };
