const admin = require('firebase-admin');
const fs = require('fs');

try {
    const serviceAccount = require('./serviceAccountKey.json');
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
} catch(e) {
    if (!admin.apps.length) {
        admin.initializeApp();
    }
}
const db = admin.firestore();

async function test() {
    const snap = await db.collection('jornadas_especiales').where('fecha', '==', '2026-03-30').get();
    snap.docs.forEach(doc => console.log(doc.id, doc.data()));
}
test();
