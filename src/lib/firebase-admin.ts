
import * as admin from 'firebase-admin';

// Check if the app is already initialized to prevent errors
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();
const adminStorage = admin.storage();

export { adminDb, adminAuth, adminStorage };
