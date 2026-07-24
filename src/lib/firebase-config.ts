export const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY.replace(/["']/g, "").trim() : undefined,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.replace(/["']/g, "").trim() : undefined,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.replace(/["']/g, "").trim() : undefined,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.replace(/["']/g, "").trim() : undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID.replace(/["']/g, "").trim() : undefined,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID.replace(/["']/g, "").trim() : undefined,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID.replace(/["']/g, "").trim() : undefined
};
