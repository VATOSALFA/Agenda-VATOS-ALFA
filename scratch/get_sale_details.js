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
    console.log("Consultando ventas del 16 de julio de 2026...");
    
    // Rango de fechas para el 16 de julio de 2026 (local/UTC)
    const start = new Date('2026-07-16T00:00:00-06:00'); // timezone local -06:00
    const end = new Date('2026-07-16T23:59:59-06:00');

    const snap = await db.collection('ventas')
      .where('fecha_hora_venta', '>=', start)
      .where('fecha_hora_venta', '<=', end)
      .get();

    console.log(`Se encontraron ${snap.size} ventas.`);
    snap.forEach(doc => {
      const data = doc.data();
      const date = data.fecha_hora_venta ? (data.fecha_hora_venta.toDate ? data.fecha_hora_venta.toDate() : new Date(data.fecha_hora_venta)) : 'Sin fecha';
      
      console.log(`Document ID: ${doc.id}`);
      console.log(`Fecha: ${date.toLocaleString()}`);
      console.log(`Cliente ID: ${data.cliente_id}`);
      console.log(`Método pago: ${data.metodo_pago}`);
      console.log(`Total: ${data.total}`);
      console.log(`Monto pagado real: ${data.monto_pagado_real}`);
      console.log(`Detalle pago combinado:`, JSON.stringify(data.detalle_pago_combinado));
      console.log(`Items:`, JSON.stringify(data.items));
      console.log(`Estado: ${data.estado || data.pago_estado}`);
      console.log(`Cajero/Creador: ${data.creado_por || data.cajero}`);
      console.log("----------------------------");
    });
  } catch (e) {
    console.error("Error:", e);
  }
})();
