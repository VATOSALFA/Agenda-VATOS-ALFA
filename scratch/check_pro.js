const { adminDb } = require('../src/lib/firebase-admin');
(async () => {
  try {
    const snap = await adminDb.collection('profesionales').doc('v9lWZsteVkg0BlBDYPLM').get();
    console.log("DATA:", snap.data());
    const snap2 = await adminDb.collection('profesionales').where('userId', '==', 'uiXvNdT9tQa1XRERS2tdlF94eeG3').get();
    console.log("WHERE DATA:", snap2.docs.map(d => d.data()));
  } catch (e) {
    console.error(e);
  }
})();
