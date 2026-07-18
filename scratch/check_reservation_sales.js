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
    const reservationId = 'SWVgBgNOZ1ohZhzGWCj7';
    console.log(`Buscando todas las ventas con reservationId: ${reservationId}...`);
    
    const snap = await db.collection('ventas')
      .where('reservationId', '==', reservationId)
      .get();
      
    console.log(`Se encontraron ${snap.size} ventas.`);
    snap.forEach(doc => {
      console.log(`--- VENTA ID: ${doc.id} ---`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  } catch (e) {
    console.error("Error:", e);
  }
})();
