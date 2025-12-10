/**
 * Importamos las funciones de la Versión 2 (Gen 2)
 */
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore"); // Para detectar nuevas citas
const { onSchedule } = require("firebase-functions/v2/scheduler");        // Para cron jobs (recordatorios, cumpleaños)
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");

const admin = require("firebase-admin");
const crypto = require("crypto");
const { Buffer } = require("buffer");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");
const { MercadoPagoConfig, Point } = require("mercadopago");

// --- DEFINICIÓN DE SECRETOS ---
const mpAccessToken = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const mpWebhookSecret = defineSecret("MERCADO_PAGO_WEBHOOK_SECRET");
const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
const twilioPhoneNumber = defineSecret("NEXT_PUBLIC_TWILIO_PHONE_NUMBER");

// Configuración global
setGlobalOptions({ region: "us-central1" });

console.log('Functions starting up (Gen 2 - Final V15 - Full Automation). Version: ' + new Date().toISOString());

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- CONFIGURACIÓN MERCADO PAGO ---
const getMercadoPagoConfig = () => {
  const accessToken = mpAccessToken.value();
  if (!accessToken) throw new HttpsError('internal', 'MP Access Token missing.');
  return { client: new MercadoPagoConfig({ accessToken }), accessToken };
};

/**
 * =================================================================
 * UTILIDADES TWILIO (Salida)
 * =================================================================
 */

// Helper para enviar WhatsApp con Plantilla (Content API) para evitar bloqueos de 24h
async function sendTwilioTemplate(to, contentSid, variables) {
    const accountSid = twilioAccountSid.value();
    const authToken = twilioAuthToken.value();
    const fromNumberRaw = twilioPhoneNumber.value();

    if (!accountSid || !authToken || !fromNumberRaw) {
        console.error("Faltan credenciales de Twilio.");
        return;
    }

    const client = require('twilio')(accountSid, authToken);
    const fromNumber = `whatsapp:${fromNumberRaw.startsWith('+') ? fromNumberRaw : `+${fromNumberRaw}`}`;
    
    // Aseguramos formato MX (+521 para móviles)
    const cleanPhone = to.replace(/\D/g, '').slice(-10);
    const toNumber = `whatsapp:+521${cleanPhone}`; 

    try {
        const message = await client.messages.create({
            from: fromNumber,
            to: toNumber,
            contentSid: contentSid,
            contentVariables: JSON.stringify(variables)
        });
        console.log(`[Twilio] Mensaje enviado (${contentSid}) a ${to}: ${message.sid}`);
        return message.sid;
    } catch (error) {
        console.error(`[Twilio] Error enviando a ${to}:`, error);
        return null;
    }
}

/**
 * =================================================================
 * AUTOMATIZACIÓN 1: NOTIFICACIÓN DE NUEVA CITA (Inmediata)
 * =================================================================
 */
exports.onReservationCreated = onDocumentCreated(
    {
        document: "reservas/{reservaId}",
        secrets: [twilioAccountSid, twilioAuthToken, twilioPhoneNumber]
    },
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;
        
        const cita = snapshot.data();
        const db = admin.firestore();

        // Verificar configuración
        const configSnap = await db.collection('configuracion').doc('recordatorios').get();
        const config = configSnap.exists ? configSnap.data() : {};
        if (config.notifications?.appointment_confirmation?.enabled === false) return;

        // Obtener datos del cliente
        const clienteSnap = await db.collection('clientes').doc(cita.cliente_id).get();
        if (!clienteSnap.exists) return;
        const cliente = clienteSnap.data();

        if (cliente.telefono) {
            // Plantilla: notificacion_citas
            await sendTwilioTemplate(
                cliente.telefono,
                "HX6162105c1002a6cf84fa345393869746", 
                {
                    "1": cliente.nombre,
                    "2": cita.fecha,
                    "3": cita.hora_inicio
                }
            );
        }
    }
);

/**
 * =================================================================
 * AUTOMATIZACIÓN 2: RECORDATORIO DE CITA (Programado - Cada Hora)
 * =================================================================
 */
exports.checkAppointmentReminders = onSchedule({
    schedule: "every 1 hours", 
    timeZone: "America/Mexico_City",
    secrets: [twilioAccountSid, twilioAuthToken, twilioPhoneNumber],
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();

    const configSnap = await db.collection('configuracion').doc('recordatorios').get();
    const config = configSnap.exists ? configSnap.data() : {};
    
    if (config.notifications?.appointment_reminder?.enabled === false) return;
    
    const hoursBefore = Number(config.notifications?.appointment_reminder?.hours_before || 24);
    
    // Calculamos fecha objetivo
    const targetDate = new Date(now.getTime() + (hoursBefore * 60 * 60 * 1000));
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    const snapshot = await db.collection('reservas')
        .where('fecha', '==', targetDateStr)
        .where('estado', '!=', 'Confirmado')
        .where('estado', '!=', 'Cancelado')
        .where('recordatorio_enviado', '!=', true)
        .get();

    if (snapshot.empty) return;

    const batch = db.batch();
    let updatesCount = 0;

    for (const doc of snapshot.docs) {
        const cita = doc.data();
        const clienteSnap = await db.collection('clientes').doc(cita.cliente_id).get();
        if (!clienteSnap.exists) continue;
        const cliente = clienteSnap.data();

        if (cliente.telefono) {
            // Plantilla: recordatorio_de_cita
            const sid = await sendTwilioTemplate(
                cliente.telefono,
                "HX259d67c1e5304a9db9b08a09d7db9e1c",
                {
                    "1": cliente.nombre,
                    "2": cita.hora_inicio
                }
            );
            
            if (sid) {
                batch.update(doc.ref, { recordatorio_enviado: true });
                updatesCount++;
            }
        }
    }
    
    if (updatesCount > 0) await batch.commit();
    console.log(`[Cron] Recordatorios enviados: ${updatesCount}`);
});

/**
 * =================================================================
 * AUTOMATIZACIÓN 3: CUMPLEAÑOS (Programado - Diario 9:00 AM)
 * =================================================================
 */
exports.sendBirthdayGreetings = onSchedule({
    schedule: "0 9 * * *", 
    timeZone: "America/Mexico_City",
    secrets: [twilioAccountSid, twilioAuthToken, twilioPhoneNumber],
}, async (event) => {
    const db = admin.firestore();
    const today = new Date();
    
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todaySuffix = `-${month}-${day}`; 

    const snapshot = await db.collection('clientes')
        .where('fecha_nacimiento', '>=', '') 
        .get();

    if (snapshot.empty) return;

    let sentCount = 0;

    for (const doc of snapshot.docs) {
        const cliente = doc.data();
        if (cliente.fecha_nacimiento && cliente.fecha_nacimiento.endsWith(todaySuffix)) {
             if (cliente.telefono) {
                // Plantilla: cumpleanos
                const sid = await sendTwilioTemplate(
                    cliente.telefono,
                    "HX61a03ed45a32f9ddf4a46ee5a10fe15b",
                    {
                        "1": cliente.nombre
                    }
                );
                if(sid) sentCount++;
             }
        }
    }
    console.log(`[Cron] Felicitaciones enviadas: ${sentCount}`);
});

/**
 * =================================================================
 * AUTOMATIZACIÓN 4: OPINIÓN GOOGLE (Programado - Diario 10:00 AM)
 * =================================================================
 */
exports.sendReviewRequests = onSchedule({
    schedule: "0 10 * * *", 
    timeZone: "America/Mexico_City",
    secrets: [twilioAccountSid, twilioAuthToken, twilioPhoneNumber],
}, async (event) => {
    const db = admin.firestore();
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const snapshot = await db.collection('reservas')
        .where('fecha', '==', yesterdayStr)
        .where('pago_estado', '==', 'Pagado')
        .where('review_solicitada', '!=', true)
        .get();

    if (snapshot.empty) return;

    const batch = db.batch();
    let sentCount = 0;

    for (const doc of snapshot.docs) {
        const cita = doc.data();
        const clienteSnap = await db.collection('clientes').doc(cita.cliente_id).get();
        if (!clienteSnap.exists) continue;
        const cliente = clienteSnap.data();

        if (cliente.telefono) {
            // Plantilla: opinion_de_google_maps
            const sid = await sendTwilioTemplate(
                cliente.telefono,
                "HXe0e696ca1a1178edc8284bab555e1c",
                {
                    "1": cliente.nombre
                }
            );
            
            if (sid) {
                batch.update(doc.ref, { review_solicitada: true });
                sentCount++;
            }
        }
    }
    
    if (sentCount > 0) await batch.commit();
    console.log(`[Cron] Solicitudes de reseña enviadas: ${sentCount}`);
});


/**
 * =================================================================
 * TWILIO INBOUND (Entrada de Mensajes)
 * =================================================================
 */

async function transferMediaToStorage(mediaUrl, from, mediaType) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("Twilio credentials missing.");
  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(mediaUrl, { headers: { Authorization: `Basic ${twilioAuth}` }, });
  if (!response.ok) throw new Error(`Twilio download failed: ${response.status}`);
  const imageBuffer = await response.buffer();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("Bucket not configured.");
  const bucket = admin.storage().bucket(bucketName);
  const extension = mediaType.split("/")[1] || "jpeg";
  const fileName = `whatsapp_media/${from.replace(/\D/g,"")}-${uuidv4()}.${extension}`;
  const file = bucket.file(fileName);
  await file.save(imageBuffer, { metadata: { contentType: mediaType, cacheControl: "public, max-age=31536000" }, });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}

async function handleAutomatedReply(db, from, body) {
  const normalizedBody = body.toLowerCase().trim();
  const isConfirmation = normalizedBody.includes("confirmado");
  const isCancellation = normalizedBody.includes("cancelar");
  if (!isConfirmation && !isCancellation) return false;
  const phoneOnly = from.replace(/\D/g, "").slice(-10);
  const clientsRef = db.collection("clientes");
  const clientQuery = await clientsRef.where("telefono", "==", phoneOnly).limit(1).get();
  if (clientQuery.empty) return false;
  const clientId = clientQuery.docs[0].id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const reservationsRef = db.collection("reservas");
  const reservationQuery = await reservationsRef.where("cliente_id", "==", clientId).where("fecha", ">=", todayStr).orderBy("fecha").orderBy("hora_inicio").limit(1).get();
  if (reservationQuery.empty) return false;
  const reservationDoc = reservationQuery.docs[0];
  const reservation = reservationDoc.data();
  if (["Asiste", "Cancelado", "No asiste"].includes(reservation.estado)) return false;
  if (isConfirmation) {
      await reservationDoc.ref.update({ estado: "Confirmado" });
  } else if (isCancellation) {
      await db.runTransaction(async (transaction) => {
          const clientRef = db.collection("clientes").doc(clientId);
          transaction.update(reservationDoc.ref, { estado: "Cancelado" });
          transaction.update(clientRef, { citas_canceladas: admin.firestore.FieldValue.increment(1) });
      });
  }
  return true;
}

async function saveMessage(from, body, mediaUrl, mediaType) {
  const db = admin.firestore();
  if (body) {
    const wasHandled = await handleAutomatedReply(db, from, body);
    if (wasHandled) return; 
  }
  const conversationId = from;
  const conversationRef = db.collection("conversations").doc(conversationId);
  const messageData = { senderId: "client", timestamp: admin.firestore.FieldValue.serverTimestamp(), read: false, };
  if (body) messageData.text = body;
  let finalMediaUrl = null;
  if (mediaUrl && mediaType) {
    try {
      finalMediaUrl = await transferMediaToStorage(mediaUrl, from, mediaType);
      messageData.mediaUrl = finalMediaUrl;
      if (mediaType.startsWith("image/")) messageData.mediaType = "image";
      else if (mediaType.startsWith("audio/")) messageData.mediaType = "audio";
      else if (mediaType === "application/pdf") messageData.mediaType = "document";
    } catch (mediaError) {
      messageData.text = (body || "") + `\n\n[Error al procesar archivo adjunto]`;
    }
  }
  await db.runTransaction(async (transaction) => {
    const convDoc = await transaction.get(conversationRef);
    const lastMessageText = body || `[${messageData.mediaType || "Archivo"}]`;
    if (convDoc.exists) {
      transaction.update(conversationRef, { lastMessageText, lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(), unreadCount: admin.firestore.FieldValue.increment(1), });
    } else {
      let clientName = from;
      try {
        const phoneOnly = from.replace(/\D/g, "").slice(-10);
        const clientsRef = db.collection("clientes");
        const querySnapshot = await clientsRef.where("telefono", "==", phoneOnly).limit(1).get();
        if (!querySnapshot.empty) {
          const clientData = querySnapshot.docs[0].data();
          clientName = `${clientData.nombre} ${clientData.apellido}`;
        }
      } catch (e) {}
      transaction.set(conversationRef, { clientName: clientName, lastMessageText, lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(), unreadCount: 1, });
    }
    const newMessageRef = conversationRef.collection("messages").doc();
    transaction.set(newMessageRef, messageData);
  });
}

exports.twilioWebhook = onRequest({cors: true}, async (request, response) => {
    try {
      const {From, Body, MediaUrl0, MediaContentType0} = request.body;
      if (!From) { response.status(200).send("<Response/>"); return; }
      await saveMessage(From, Body, MediaUrl0, MediaContentType0);
      response.set("Content-Type", "text/xml"); response.status(200).send("<Response/>");
    } catch (error) {
      response.set("Content-Type", "text/xml"); response.status(200).send("<Response/>");
    }
});

/**
 * =================================================================
 * MERCADO PAGO FUNCTIONS (Cobros & Terminales)
 * =================================================================
 */

exports.getPointTerminals = onCall({ cors: true, secrets: [mpAccessToken], invoker: 'public' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    try {
        const { client } = getMercadoPagoConfig();
        const point = new Point(client); 
        const devices = await point.getDevices({}); 
        return { success: true, devices: devices.devices || [] };
    } catch(error) { throw new HttpsError('internal', error.message || "No se pudo comunicar con Mercado Pago."); }
});

exports.setTerminalPDVMode = onCall({ cors: true, secrets: [mpAccessToken], invoker: 'public' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    const { terminalId } = request.data;
    if (!terminalId) throw new HttpsError('invalid-argument', 'Falta terminalId.');
    try {
      const { client } = getMercadoPagoConfig();
      const point = new Point(client);
      const result = await point.changeDeviceOperatingMode({ device_id: terminalId, operating_mode: "PDV" });
      return { success: true, data: result };
    } catch (error) { throw new HttpsError('internal', error.message || `No se pudo activar el modo PDV.`); }
});

exports.createPointPayment = onCall({ cors: true, secrets: [mpAccessToken], invoker: 'public' }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    const { amount, terminalId, referenceId } = request.data;
    if (!amount || !terminalId || !referenceId) throw new HttpsError('invalid-argument', 'Faltan datos requeridos.');
    try {
        const { accessToken } = getMercadoPagoConfig();
        const url = `https://api.mercadopago.com/point/integration-api/devices/${terminalId}/payment-intents`;
        const paymentIntent = {
            amount: Math.round(amount * 100),
            notification_url: "https://us-central1-agenda-1ae08.cloudfunctions.net/mercadoPagoWebhook",
            additional_info: { external_reference: referenceId, print_on_terminal: true }
        };
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'X-Idempotency-Key': uuidv4() },
          body: JSON.stringify(paymentIntent),
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) throw new HttpsError('aborted', 'La terminal está ocupada. Cancela la operación en el dispositivo.');
          throw new HttpsError('internal', result.message || 'Error al enviar la orden.');
        }
        return { success: true, data: { id: result.id } };
    } catch(error) { throw new HttpsError('internal', error.message || "No se pudo crear el pago."); }
});

// 4. MERCADO PAGO WEBHOOK (V14 - SOLUCIÓN TOTAL)
exports.mercadoPagoWebhook = onRequest({ cors: true, invoker: 'public', secrets: [mpWebhookSecret, mpAccessToken] }, async (request, response) => {
    console.log("========== [v15] MERCADO PAGO WEBHOOK RECEIVED ==========");
    const secret = mpWebhookSecret.value();
    if (!secret) { response.status(500).send("Secret missing."); return; }
    try {
      let body = request.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
      const { query } = request;
      const dataId = query['data.id'] || query.id || body?.data?.id || body?.id;
      if (dataId == "123456" || dataId == 123456) { response.status(200).send("OK"); return; }
      if (!dataId) { response.status(200).send("OK"); return; }

      let signatureValid = false;
      const xSignature = request.headers['x-signature'];
      const xRequestId = request.headers['x-request-id'];
      if (xSignature && xRequestId) {
          const parts = xSignature.split(',');
          const ts = parts.find(p => p.startsWith('ts='))?.split('=')[1];
          const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];
          if (ts && v1) {
              const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
              const hmac = crypto.createHmac('sha256', secret);
              hmac.update(manifest);
              if (hmac.digest('hex') === v1) signatureValid = true;
          }
      }
      if (!signatureValid) console.warn(`[v15] Signature validation failed for ID: ${dataId}. Checking API directly.`);

      const { accessToken } = getMercadoPagoConfig();
      let paymentInfo = null;
      let paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });

      if (!paymentResponse.ok) {
           const orderResponse = await fetch(`https://api.mercadopago.com/merchant_orders/${dataId}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
           if (orderResponse.ok) {
               const orderInfo = await orderResponse.json();
               const approvedPayment = orderInfo.payments?.find(p => p.status === 'approved');
               if (approvedPayment) {
                   paymentInfo = { id: approvedPayment.id, external_reference: orderInfo.external_reference, status: 'approved', transaction_amount: approvedPayment.transaction_amount };
                   paymentResponse = { ok: true }; 
               }
           }
      } else {
          paymentInfo = await paymentResponse.json();
      }

      if (!paymentInfo || paymentInfo.status !== 'approved' || !paymentInfo.external_reference) {
          if (!signatureValid) { response.status(403).send("Forbidden"); return; }
          response.status(200).send("OK_IGNORED"); return;
      }

      const { external_reference, status, transaction_amount } = paymentInfo;
      const ventaRef = admin.firestore().collection('ventas').doc(external_reference);
      await admin.firestore().runTransaction(async (t) => {
          const ventaDoc = await t.get(ventaRef);
          if (!ventaDoc.exists || ventaDoc.data().pago_estado === 'Pagado') return;
          const ventaData = ventaDoc.data();
          const montoOriginal = Number(ventaData.total || 0);
          const montoPagado = Number(transaction_amount || 0);
          let propina = 0;
          if (montoPagado > montoOriginal) propina = parseFloat((montoPagado - montoOriginal).toFixed(2));

          t.update(ventaRef, { pago_estado: 'Pagado', mercado_pago_status: 'approved', mercado_pago_id: String(paymentInfo.id), monto_pagado_real: montoPagado, propina: propina, fecha_pago: new Date() });
          if (ventaData.reservationId) {
              const reservaRef = admin.firestore().collection('reservas').doc(ventaData.reservationId);
              const reservaDoc = await t.get(reservaRef);
              if (reservaDoc.exists) t.update(reservaRef, { pago_estado: 'Pagado' });
          }
      });
      console.log(`[v15] SUCCESS: Venta ${external_reference} processed.`);
    } catch (error) { response.status(200).send('OK_WITH_ERROR'); return; }
    response.status(200).send('OK');
});