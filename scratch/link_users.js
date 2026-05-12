const admin = require('firebase-admin');
const serviceAccount = require('../backend-credentials.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const auth = admin.auth();

(async () => {
  try {
    // 1. Get Ivon's UID
    const ivonUser = await auth.getUserByEmail('hgloriaivon@gmail.com');
    const ivonUid = ivonUser.uid;
    console.log(`UID de Ivon: ${ivonUid}`);

    const beatrizUid = 'uiXvNdT9tQa1XRERS2tdIF94eeG3';
    
    // 2. Update Beatriz's professional document
    const beatrizProId = 'v9lWZsteVkg0BlBDYPLM';
    await db.collection('profesionales').doc(beatrizProId).update({
      userId: beatrizUid
    });
    console.log(`Documento de Beatriz actualizado con userId: ${beatrizUid}`);

    // 3. Update Ivon's professional document
    const ivonProId = 'EqLgZe3ZWAn87xhojknt';
    await db.collection('profesionales').doc(ivonProId).update({
      userId: ivonUid
    });
    console.log(`Documento de Ivon actualizado con userId: ${ivonUid}`);

    console.log("¡Actualización exitosa!");
  } catch (e) {
    console.error("Error:", e);
  }
})();
