'use client';

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
    getFirestore, 
    initializeFirestore, 
    persistentLocalCache, 
    persistentMultipleTabManager 
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

// This file initializes ONLY Firestore and App.
// It explicitly avoids importing `firebase/auth` to prevent the heavy ~92KB iframe SDK
// from loading on public pages where auth is not needed.

function initializePublicFirebase() {
    let app: any;
    let db: any;

    if (getApps().length > 0) {
        app = getApp();
        db = getFirestore(app);
    } else {
        if (!firebaseConfig.apiKey) {
            console.warn("Firebase API Key is missing. Check your environment variables.");
        }
        app = initializeApp(firebaseConfig as any);
        try {
            db = initializeFirestore(app, {
                localCache: persistentLocalCache({
                    tabManager: persistentMultipleTabManager()
                })
            });
        } catch {
            db = getFirestore(app);
        }
    }

    return { app, db };
}

const { app, db } = initializePublicFirebase();

export { app, db };
