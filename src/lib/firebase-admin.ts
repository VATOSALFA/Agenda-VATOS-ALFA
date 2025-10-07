
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let app: App;

if (!getApps().length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccountKey) {
        try {
            const serviceAccount = JSON.parse(serviceAccountKey);
            app = initializeApp({
                credential: cert(serviceAccount)
            });
        } catch (error) {
             console.error("Failed to parse Firebase service account key. Initializing default app.", error);
             app = initializeApp();
        }
    } else {
        console.warn("Firebase Admin SDK service account key is not available. Some backend features may not work. This is expected in client-side rendering.");
        app = initializeApp(); 
    }
} else {
    app = getApps()[0];
}

export const db = getFirestore(app);
export const authAdmin = getAuth(app);
