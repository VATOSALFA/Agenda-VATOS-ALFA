
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let app: App;

if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : undefined;
    
    if (serviceAccount) {
        app = initializeApp({
            credential: cert(serviceAccount)
        });
    } else {
        console.warn("Firebase Admin SDK service account key is not available. Some backend features may not work.");
        // We can initialize a default app instance if needed, but it will have limited permissions.
        // For local development where admin SDK might not be strictly needed for all paths,
        // this can prevent crashes.
        app = initializeApp(); 
    }
} else {
    app = getApps()[0];
}

export const db = getFirestore(app);
export const authAdmin = getAuth(app);
