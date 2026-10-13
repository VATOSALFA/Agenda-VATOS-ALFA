const admin = require('firebase-admin');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const creds = JSON.parse(fs.readFileSync('backend-credentials.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(creds),
    storageBucket: 'agenda-1ae08.firebasestorage.app'
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function optimizeAndUpload(sourceUrl, destinationPrefix, baseName, maxDimension = 800, quality = 85) {
  console.log(`\n⏳ Descargando: ${baseName} (${sourceUrl.substring(0, 75)}...)...`);
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${sourceUrl}`);
  const inputBuffer = Buffer.from(await res.arrayBuffer());
  const initialSize = inputBuffer.length;

  console.log(`   Procesando con Sharp (máx ${maxDimension}px, WebP cal ${quality})...`);
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  let resizeOptions = {};
  if (metadata.width > maxDimension || metadata.height > maxDimension) {
    if (metadata.width >= metadata.height) {
      resizeOptions = { width: maxDimension };
    } else {
      resizeOptions = { height: maxDimension };
    }
  }

  const webpBuffer = await sharp(inputBuffer)
    .resize(resizeOptions.width, resizeOptions.height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

  const newSize = webpBuffer.length;
  const savingsPct = Math.round((1 - newSize / initialSize) * 100);

  const token = crypto.randomUUID();
  const safeFilename = `${Date.now()}-${baseName.replace(/[^a-zA-Z0-9_-]/g, '_')}.webp`;
  const destination = `${destinationPrefix}/${safeFilename}`;

  console.log(`   Subiendo a Storage: ${destination} (${(initialSize / 1024).toFixed(1)} KB -> ${(newSize / 1024).toFixed(1)} KB, -${savingsPct}%)...`);

  const file = bucket.file(destination);
  await file.save(webpBuffer, {
    metadata: {
      contentType: 'image/webp',
      metadata: {
        firebaseStorageDownloadTokens: token,
      }
    }
  });

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
  return {
    downloadUrl,
    initialSize,
    newSize,
    savingsPct,
  };
}

async function run() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO MIGRACIÓN Y OPTIMIZACIÓN MASIVA DE IMÁGENES');
  console.log('===============================================================');

  const stats = [];

  // 1. INSPIRACIÓN ALFA (LOOKBOOK APP MÓVIL)
  console.log('\n--- 1. OPTIMIZANDO LOOKBOOK (INSPIRACIÓN ALFA EN APP MÓVIL) ---');
  const appMovilRef = db.collection('configuracion').doc('app_movil');
  const inspAlfaRef = db.collection('configuracion').doc('inspiracion_alfa');

  const appMovilDoc = await appMovilRef.get();
  if (appMovilDoc.exists) {
    const data = appMovilDoc.data();
    const items = data.inspiracion_alfa || [];
    const newItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.imagenUrl && (item.imagenUrl.includes('.png') || !item.imagenUrl.includes('.webp'))) {
        const title = item.titulo || `corte_lookbook_${i + 1}`;
        const res = await optimizeAndUpload(item.imagenUrl, 'inspiracion_alfa', `lookbook_${i + 1}`, 800, 85);
        newItems.push({
          ...item,
          imagenUrl: res.downloadUrl,
        });
        stats.push({
          section: 'Lookbook App Móvil',
          name: title || `Corte #${i + 1}`,
          beforeKb: (res.initialSize / 1024).toFixed(1),
          afterKb: (res.newSize / 1024).toFixed(1),
          savingsPct: res.savingsPct
        });
      } else {
        newItems.push(item);
      }
    }

    console.log('   Actualizando configuracion/app_movil en Firestore...');
    await appMovilRef.update({ inspiracion_alfa: newItems });

    console.log('   Actualizando configuracion/inspiracion_alfa en Firestore...');
    await inspAlfaRef.set({ items: newItems, actualizado_el: new Date().toISOString() }, { merge: true });
  }

  // 2. PROMOCIONES
  console.log('\n--- 2. OPTIMIZANDO PROMOCIONES PESADAS ---');
  const promo1Ref = db.collection('promociones').doc('5Y5Vd9gxvP0IIudvWY39');
  const promo1Doc = await promo1Ref.get();
  if (promo1Doc.exists) {
    const data = promo1Doc.data();
    const url = data.imageUrl || data.imagenUrl;
    if (url && url.includes('.png')) {
      const res = await optimizeAndUpload(url, 'promotions', 'promo_playera_mexico', 1280, 84);
      await promo1Ref.update({
        imageUrl: res.downloadUrl,
        imagenUrl: res.downloadUrl,
      });
      stats.push({
        section: 'Promociones',
        name: data.name || '20% playera México',
        beforeKb: (res.initialSize / 1024).toFixed(1),
        afterKb: (res.newSize / 1024).toFixed(1),
        savingsPct: res.savingsPct
      });
    }
  }

  const promo2Ref = db.collection('promociones').doc('D1ZcxWU24ZZR78WSG2HF');
  const promo2Doc = await promo2Ref.get();
  if (promo2Doc.exists) {
    const data = promo2Doc.data();
    const url = data.imageUrl || data.imagenUrl;
    if (url && url.includes('.png')) {
      const res = await optimizeAndUpload(url, 'promotions', 'promo_productos_vatos_alfa', 1280, 84);
      await promo2Ref.update({
        imageUrl: res.downloadUrl,
        imagenUrl: res.downloadUrl,
      });
      stats.push({
        section: 'Promociones',
        name: data.name || '15% desc productos',
        beforeKb: (res.initialSize / 1024).toFixed(1),
        afterKb: (res.newSize / 1024).toFixed(1),
        savingsPct: res.savingsPct
      });
    }
  }

  // 3. SERVICIOS
  console.log('\n--- 3. OPTIMIZANDO SERVICIOS (DEPILACIÓN DE CEJA) ---');
  const servRef = db.collection('servicios').doc('wnov1a9D5Wqdqmyy7a8L');
  const servDoc = await servRef.get();
  if (servDoc.exists) {
    const data = servDoc.data();
    const images = data.images || [];
    if (images.length > 0 && images[0].includes('.png')) {
      const res = await optimizeAndUpload(images[0], 'servicios', 'depilacion_ceja_cera', 800, 85);
      await servRef.update({
        images: [res.downloadUrl, ...images.slice(1)],
      });
      stats.push({
        section: 'Servicios',
        name: data.name || 'Depilación de ceja con cera caliente',
        beforeKb: (res.initialSize / 1024).toFixed(1),
        afterKb: (res.newSize / 1024).toFixed(1),
        savingsPct: res.savingsPct
      });
    }
  }

  // 4. PROFESIONALES (CESAR & LIMPIEZA LEGACY)
  console.log('\n--- 4. OPTIMIZANDO PROFESIONALES RESTANTES (CESAR Y LIMPIEZA) ---');
  const cesarRef = db.collection('profesionales').doc('nqPXb671LWwAxWVpi7SJ');
  const cesarDoc = await cesarRef.get();
  if (cesarDoc.exists) {
    const data = cesarDoc.data();
    if (data.avatarUrl && !data.avatarUrl.includes('.webp')) {
      const res = await optimizeAndUpload(data.avatarUrl, 'profesionales', 'Cesar', 600, 86);
      await cesarRef.update({
        avatarUrl: res.downloadUrl,
      });
      stats.push({
        section: 'Profesionales',
        name: 'Cesar',
        beforeKb: (res.initialSize / 1024).toFixed(1),
        afterKb: (res.newSize / 1024).toFixed(1),
        savingsPct: res.savingsPct
      });
    }
  }

  // Limpiar campo legacy avatar de Beatriz
  const betyRef = db.collection('profesionales').doc('v9lWZsteVkg0BlBDYPLM');
  const betyDoc = await betyRef.get();
  if (betyDoc.exists && betyDoc.data().avatarUrl) {
    await betyRef.update({
      avatar: betyDoc.data().avatarUrl,
    });
  }

  console.log('\n===============================================================');
  console.log('🎉 RESUMEN DE LA MIGRACIÓN MASIVA DE OPTIMIZACIÓN');
  console.log('===============================================================');
  let totalBefore = 0;
  let totalAfter = 0;

  stats.forEach(s => {
    totalBefore += parseFloat(s.beforeKb);
    totalAfter += parseFloat(s.afterKb);
    console.log(`✅ [${s.section}] ${s.name}: ${s.beforeKb} KB -> ${s.afterKb} KB (-${s.savingsPct}%)`);
  });

  const totalSavedMb = ((totalBefore - totalAfter) / 1024).toFixed(2);
  const globalSavingsPct = Math.round((1 - totalAfter / totalBefore) * 100);

  console.log('---------------------------------------------------------------');
  console.log(`📦 Peso Total Antes: ${(totalBefore / 1024).toFixed(2)} MB`);
  console.log(`⚡ Peso Total Ahora:  ${(totalAfter / 1024).toFixed(2)} MB`);
  console.log(`💰 Ahorro Total de Red: ${totalSavedMb} MB (${globalSavingsPct}% de reducción masiva)`);
  console.log('===============================================================');
}

run().then(() => process.exit(0)).catch(err => {
  console.error('Error durante la optimización masiva:', err);
  process.exit(1);
});
