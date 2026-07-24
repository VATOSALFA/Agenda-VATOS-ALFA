const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin with backend credentials
try {
    const serviceAccount = require('../backend-credentials.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Initialized Firebase Admin using backend-credentials.json");
} catch(e) {
    console.warn("Failed to load backend-credentials.json, trying default init:", e.message);
    admin.initializeApp({
        projectId: 'agenda-1ae08'
    });
}

const db = admin.firestore();

async function run() {
    try {
        const snapshot = await db.collection('empresa').limit(1).get();
        if (snapshot.empty) {
            console.log("No business records found.");
        } else {
            console.log("Empresa data:", snapshot.docs[0].data());
        }
    } catch(e) {
        console.error("Error reading Firestore:", e);
    }
}
run();
