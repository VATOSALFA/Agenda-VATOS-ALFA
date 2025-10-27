
'use server';

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet.
const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return;
  }

  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      console.warn('FIREBASE_SERVICE_ACCOUNT_KEY is not available. Admin SDK not initialized.');
      return;
    }
    
    // Check if the key is a valid JSON string before parsing
    let serviceAccount;
    try {
        serviceAccount = JSON.parse(serviceAccountKey);
    } catch(e) {
        console.error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.");
        return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully.");

  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin SDK:', error.message);
  }
};

// Ensure initialization is attempted when the module is loaded on the server
initializeFirebaseAdmin();

function getDb() {
  if (admin.apps.length === 0) {
    initializeFirebaseAdmin(); // Attempt to re-initialize if needed
    if (admin.apps.length === 0) {
      throw new Error("Firebase Admin SDK is not initialized. Cannot access Firestore.");
    }
  }
  return admin.firestore();
}

function getAuth() {
  if (admin.apps.length === 0) {
    initializeFirebaseAdmin(); // Attempt to re-initialize if needed
    if (admin.apps.length === 0) {
      throw new Error("Firebase Admin SDK is not initialized. Cannot access Auth.");
    }
  }
  return admin.auth();
}

// Export functions to get the instances
export { getDb, getAuth };

// For backwards compatibility in other files that might still use `db` directly.
// This will lazily call getDb() when `db` is accessed.
const db = getDb();
const auth = getAuth();
export { db, auth };
