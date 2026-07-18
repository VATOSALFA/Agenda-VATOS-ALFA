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
    console.log("=== BÚSQUEDA AVANZADA DE LA VENTA ===");
    
    // 1. Intentar buscar por ID exacto (case-sensitive) en colección 'ventas'
    console.log("1. Buscando ID exacto 'eNEWacsJ' en 'ventas'...");
    const saleDoc = await db.collection('ventas').doc('eNEWacsJ').get();
    if (saleDoc.exists) {
      console.log("¡Encontrado por ID exacto!");
      console.log(JSON.stringify(saleDoc.data(), null, 2));
    } else {
      console.log("No encontrado por ID exacto 'eNEWacsJ'.");
    }

    // 2. Buscar en todas las ventas del 16 de julio de 2026 entre las 12:50 y las 13:10 (hora local -06:00)
    console.log("\n2. Buscando ventas entre 12:50 y 13:10 del 16 de julio de 2026...");
    const start = new Date('2026-07-16T12:50:00-06:00');
    const end = new Date('2026-07-16T13:10:00-06:00');
    const timeSnap = await db.collection('ventas')
      .where('fecha_hora_venta', '>=', start)
      .where('fecha_hora_venta', '<=', end)
      .get();
    
    console.log(`Ventas encontradas en ese rango de tiempo: ${timeSnap.size}`);
    timeSnap.forEach(doc => {
      console.log(`Document ID: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });

    // 3. Buscar clientes que se llamen "Luis Manuel" para obtener su ID y luego buscar sus ventas
    console.log("\n3. Buscando cliente 'Luis Manuel'...");
    const clientSnap = await db.collection('clientes').get();
    let clientIds = [];
    clientSnap.forEach(doc => {
      const data = doc.data();
      const nombreCompleto = `${data.nombre || ''} ${data.apellido || ''} ${data.nombre_completo || ''}`.toLowerCase();
      if (nombreCompleto.includes('luis manuel') || nombreCompleto.includes('manuel')) {
        console.log(`Cliente encontrado: ID=${doc.id}, Nombre=${data.nombre || data.nombre_completo}, Telefono=${data.telefono}`);
        clientIds.push(doc.id);
      }
    });

    if (clientIds.length > 0) {
      console.log(`\n4. Buscando ventas del 16 de julio para los clientes encontrados...`);
      for (const clientId of clientIds) {
        const salesSnap = await db.collection('ventas')
          .where('cliente_id', '==', clientId)
          .get();
        salesSnap.forEach(doc => {
          const data = doc.data();
          const date = data.fecha_hora_venta ? (data.fecha_hora_venta.toDate ? data.fecha_hora_venta.toDate() : new Date(data.fecha_hora_venta)) : null;
          // Filtrar por fecha 16 de julio de 2026
          if (date && date.getFullYear() === 2026 && date.getMonth() === 6 && date.getDate() === 16) {
            console.log(`Venta encontrada para cliente ${clientId} el 16 de Julio (Doc ID: ${doc.id}):`);
            console.log(JSON.stringify(data, null, 2));
          }
        });
      }
    }

  } catch (e) {
    console.error("Error durante la búsqueda:", e);
  }
})();
