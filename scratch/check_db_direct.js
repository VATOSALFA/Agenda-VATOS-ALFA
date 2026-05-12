const admin = require('firebase-admin');
const serviceAccount = require('../backend-credentials.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

(async () => {
  try {
    const snap = await db.collection('profesionales').get();
    console.log("--- LISTA DE PROFESIONALES ---");
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`DocumentID: ${doc.id}`);
      console.log(`userId: "${data.userId}"`);
      console.log(`name: ${data.name}`);
      console.log(`publicName: ${data.publicName}`);
      console.log("----------------------------");
    });
  } catch (e) {
    console.error(e);
  }
})();
