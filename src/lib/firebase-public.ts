'use client';

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

// This file initializes ONLY Firestore and App.
// It explicitly avoids importing `firebase/auth` to prevent the heavy ~92KB iframe SDK
// from loading on public pages where auth is not needed.

function initializePublicFirebase() {
    let app;
    if (getApps().length > 0) {
        app = getApp();
    } else {
        if (!firebaseConfig.apiKey) {
            console.warn("Firebase API Key is missing. Check your environment variables.");
        }
        app = initializeApp(firebaseConfig as any);
    }

    const db = getFirestore(app);

    if (typeof window !== 'undefined') {
        enableIndexedDbPersistence(db).catch(() => {
            // Silently ignore persistence errors in multi-tab/unsupported browsers
        });
    }

    return { app, db };
}

const { app, db } = initializePublicFirebase();

export { app, db };
