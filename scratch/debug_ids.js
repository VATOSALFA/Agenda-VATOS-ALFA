const { getDb } = require('../src/lib/firebase-server');
(async () => {
  try {
    const db = getDb();
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
