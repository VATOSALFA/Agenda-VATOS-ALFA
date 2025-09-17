
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: "agenda-1ae08.appspot.com",
    });
  } catch (error: any) {
    console.error("Firebase Admin Initialization Error: ", error.message);
  }
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();
const adminStorage = admin.storage();

export { adminDb, adminAuth, adminStorage };
