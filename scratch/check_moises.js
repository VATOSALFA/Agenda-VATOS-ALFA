
const { getDb } = require('./src/lib/firebase-server');

async function checkClient() {
    try {
        const db = getDb();
        console.log("Searching for Moisés...");
        const snap = await db.collection('clientes').get();
        let found = false;
        snap.forEach(doc => {
            const data = doc.data();
            if (data.nombre && data.nombre.toLowerCase().includes('moisés')) {
                console.log("ID:", doc.id);
                console.log("Data:", JSON.stringify(data, null, 2));
                found = true;
            }
        });
        if (!found) console.log("No client found with name including 'Moisés'");
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit();
}

checkClient();
