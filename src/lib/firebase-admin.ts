import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();
const adminStorage = admin.storage();

export { adminDb, adminAuth, adminStorage };
