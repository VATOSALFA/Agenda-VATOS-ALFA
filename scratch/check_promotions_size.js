const admin = require('firebase-admin');
const https = require('https');

// Initialize Firebase Admin
try {
    const serviceAccount = require('../backend-credentials.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch(e) {
    admin.initializeApp();
}

const db = admin.firestore();

function getUrlSize(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(0);
        https.request(url, { method: 'HEAD' }, (res) => {
            const size = parseInt(res.headers['content-length'] || '0', 10);
            resolve(size);
        }).on('error', () => resolve(0)).end();
    });
}

async function run() {
    try {
        console.log("Checking promotions image sizes...");
        const snapshot = await db.collection('promociones').get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const sizeBytes = await getUrlSize(data.imageUrl);
            const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
            console.log(`Promo ID: ${doc.id}`);
            console.log(`  Name: ${data.name}`);
            console.log(`  Status: ${data.status}`);
            console.log(`  URL: ${data.imageUrl}`);
            console.log(`  Size: ${sizeBytes} bytes (${sizeMB} MB)`);
        }
        
        console.log("\nChecking services image sizes...");
        const servicesSnapshot = await db.collection('servicios').get();
        for (const doc of servicesSnapshot.docs) {
            const data = doc.data();
            if (data.images && data.images.length > 0) {
                const sizeBytes = await getUrlSize(data.images[0]);
                const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
                console.log(`Service ID: ${doc.id} - ${data.name}`);
                console.log(`  Size: ${sizeBytes} bytes (${sizeMB} MB)`);
            }
        }
        
        console.log("\nChecking professionals image sizes...");
        const prosSnapshot = await db.collection('profesionales').get();
        for (const doc of prosSnapshot.docs) {
            const data = doc.data();
            if (data.avatarUrl) {
                const sizeBytes = await getUrlSize(data.avatarUrl);
                const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
                console.log(`Pro ID: ${doc.id} - ${data.name}`);
                console.log(`  Size: ${sizeBytes} bytes (${sizeMB} MB)`);
            }
        }
    } catch(e) {
        console.error("Error reading Firestore:", e);
    }
}
run();
