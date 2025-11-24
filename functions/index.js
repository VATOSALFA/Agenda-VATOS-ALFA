
const { https, HttpsError } = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { Buffer } = require("buffer");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");
const { MercadoPagoConfig, Point } = require("mercadopago");

console.log('Functions starting up (Gen 1). Version: ' + new Date().toISOString());

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const getMercadoPagoConfig = async () => {
  const db = admin.firestore();
  const settingsDoc = await db.collection('configuracion').doc('pagos').get();

  if (!settingsDoc.exists) {
    throw new HttpsError('internal', 'La configuración de Mercado Pago no ha sido establecida en Firestore.');
  }

  const settings = settingsDoc.data();
  const accessToken = settings?.mercadoPagoAccessToken;

  if (!accessToken) {
    throw new HttpsError('internal', 'El Access Token de Mercado Pago no está configurado en Firestore.');
  }

  return { client: new MercadoPagoConfig({ accessToken }), accessToken };
};

async function transferMediaToStorage(mediaUrl, from, mediaType) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured as environment variables.");
  }

  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${twilioAuth}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media from Twilio: ${response.status} ${response.statusText}`);
  }

  const imageBuffer = await response.buffer();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error("Firebase Storage bucket not configured. Check NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var.");
  }
  const bucket = admin.storage().bucket(bucketName);
  const extension = mediaType.split("/")[1] || "jpeg";
  const fileName = `whatsapp_media/${from.replace(/\D/g, "")}-${uuidv4()}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(imageBuffer, {
    metadata: { contentType: mediaType, cacheControl: "public, max-age=31536000" },
  });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}

async function handleAutomatedReply(db, from, body) {
    const normalizedBody = body.toLowerCase().trim();
    const isConfirmation = normalizedBody.includes("confirmado");
    const isCancellation = normalizedBody.includes("cancelar");

    if (!isConfirmation && !isCancellation) return false;

    const phoneOnly = from.replace(/\D/g, "").slice(-10);
    const clientQuery = await db.collection("clientes").where("telefono", "==", phoneOnly).limit(1).get();

    if (clientQuery.empty) return false;

    const clientId = clientQuery.docs[0].id;
    const todayStr = new Date().toISOString().split('T')[0];

    const reservationQuery = await db.collection("reservas")
        .where("cliente_id", "==", clientId)
        .where("fecha", ">=", todayStr)
        .orderBy("fecha").orderBy("hora_inicio").limit(1).get();

    if (reservationQuery.empty) return false;

    const reservationDoc = reservationQuery.docs[0];
    if (["Asiste", "Cancelado", "No asiste"].includes(reservationDoc.data().estado)) return false;

    if (isConfirmation) {
        await reservationDoc.ref.update({ estado: "Confirmado" });
    } else if (isCancellation) {
        await db.runTransaction(async (t) => {
            const clientRef = db.collection("clientes").doc(clientId);
            t.update(reservationDoc.ref, { estado: "Cancelado" });
            t.update(clientRef, { citas_canceladas: admin.firestore.FieldValue.increment(1) });
        });
    }
    return true;
}

async function saveMessage(from, body, mediaUrl, mediaType) {
  const db = admin.firestore();
  if (body && await handleAutomatedReply(db, from, body)) return;

  const conversationRef = db.collection("conversations").doc(from);
  const messageData = { senderId: "client", timestamp: admin.firestore.FieldValue.serverTimestamp(), read: false };

  if (body) messageData.text = body;
  if (mediaUrl && mediaType) {
    try {
      messageData.mediaUrl = await transferMediaToStorage(mediaUrl, from, mediaType);
      messageData.mediaType = mediaType.startsWith("image/") ? "image" : (mediaType.startsWith("audio/") ? "audio" : "document");
    } catch (mediaError) {
      messageData.text = (body || "") + `\n\n[Error al procesar archivo adjunto]`;
    }
  }

  await db.runTransaction(async (t) => {
    const convDoc = await t.get(conversationRef);
    const lastMessageText = body || `[${messageData.mediaType || "Archivo"}]`;

    if (convDoc.exists) {
      t.update(conversationRef, { lastMessageText, lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(), unreadCount: admin.firestore.FieldValue.increment(1) });
    } else {
      let clientName = from;
      const phoneOnly = from.replace(/\D/g, "").slice(-10);
      const clientQuery = await db.collection("clientes").where("telefono", "==", phoneOnly).limit(1).get();
      if (!clientQuery.empty) clientName = `${clientQuery.docs[0].data().nombre} ${clientQuery.docs[0].data().apellido}`;
      t.set(conversationRef, { clientName, lastMessageText, lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(), unreadCount: 1 });
    }
    t.set(conversationRef.collection("messages").doc(), messageData);
  });
}

exports.twilioWebhook = https.onRequest(async (request, response) => {
  try {
    const { From, Body, MediaUrl0, MediaContentType0 } = request.body;
    if (From) await saveMessage(From, Body, MediaUrl0, MediaContentType0);
    response.set("Content-Type", "text/xml").status(200).send("<Response/>");
  } catch (error) {
    console.error("[FATAL] Unhandled error in twilioWebhook:", error);
    response.set("Content-Type", "text/xml").status(200).send("<Response/>");
  }
});

exports.getPointTerminals = https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
  try {
    const { client } = await getMercadoPagoConfig();
    const point = new Point(client);
    const devices = await point.getDevices({});
    return { success: true, devices: devices.devices || [] };
  } catch (error) {
    console.error("Error fetching Mercado Pago terminals:", error);
    throw new HttpsError('internal', error.message || "No se pudo comunicar con Mercado Pago.");
  }
});

exports.setTerminalPDVMode = https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
  const { terminalId } = data;
  if (!terminalId) throw new HttpsError('invalid-argument', 'The function must be called with a "terminalId" argument.');
  try {
    const { client } = await getMercadoPagoConfig();
    const point = new Point(client);
    const result = await point.changeDeviceOperatingMode({ device_id: terminalId, operating_mode: "PDV" });
    return { success: true, data: result };
  } catch (error) {
    console.error(`Error setting PDV mode for ${terminalId}:`, error);
    throw new HttpsError('internal', error.message || `No se pudo activar el modo PDV para la terminal.`);
  }
});

exports.createPointPayment = https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
  const { amount, terminalId, referenceId, payer, items } = data;
  if (!amount || !terminalId || !referenceId) throw new HttpsError('invalid-argument', 'Missing required arguments.');
  try {
    const { accessToken } = await getMercadoPagoConfig();
    const orderData = {
      type: "point", external_reference: referenceId, expiration_time: "PT15M", payer, items,
      transactions: { payments: [{ amount: amount.toFixed(2).toString() }] },
      config: { point: { terminal_id: terminalId, print_on_terminal: "no_ticket" }, payment_method: { default_type: "credit_card" } },
      description: `Venta en VATOS ALFA`,
    };
    const response = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'X-Idempotency-Key': uuidv4() },
      body: JSON.stringify(orderData),
    });
    const result = await response.json();
    if (!response.ok) throw new HttpsError('internal', result.message || 'Error al crear la orden de pago en Mercado Pago.');
    return { success: true, data: result };
  } catch (error) {
    console.error("Error creating payment order:", error);
    throw new HttpsError('internal', error.message || "No se pudo crear la intención de pago.");
  }
});

exports.mercadoPagoWebhook = https.onRequest(async (request, response) => {
    console.log("========== [v4] MERCADO PAGO WEBHOOK RECEIVED (GEN 1) ==========");
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    if (!secret) {
        console.error("FATAL: MERCADO_PAGO_WEBHOOK_SECRET is not configured.");
        response.status(500).send("Webhook secret not configured.");
        return;
    }

    try {
        const xSignature = request.headers['x-signature'];
        const xRequestId = request.headers['x-request-id'];
        const dataIdFromQuery = request.query['data.id'];

        if (!xSignature || !dataIdFromQuery) {
            response.status(400).send("Missing required headers or query params for validation.");
            return;
        }

        const parts = xSignature.split(',');
        const tsPart = parts.find(p => p.startsWith('ts='));
        const v1Part = parts.find(p => p.startsWith('v1='));

        if (!tsPart || !v1Part) {
            response.status(400).send("Invalid signature format.");
            return;
        }

        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        const manifest = `id:${dataIdFromQuery};request-id:${xRequestId};ts:${ts};`;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(manifest);
        const sha = hmac.digest('hex');

        if (sha !== v1) {
            console.warn("[v4] SIGNATURE VALIDATION FAILED. Expected:", sha, "Got:", v1);
            response.status(403).send("Invalid signature.");
            return;
        }

        console.log("[v4] Signature validation SUCCESSFUL.");
        const { body } = request;
        let notificationData = body.data;
        if (typeof notificationData === 'string') notificationData = JSON.parse(notificationData);

        if (body.type === 'order' && body.action === 'order.processed') {
            const externalReference = notificationData?.external_reference;
            if (externalReference) {
                const ventaRef = admin.firestore().collection('ventas').doc(externalReference);
                if ((await ventaRef.get()).exists) {
                    await ventaRef.update({
                        pago_estado: 'Pagado',
                        mercado_pago_status: 'processed',
                        mercado_pago_id: notificationData?.id,
                    });
                    console.log(`[v4] Updated sale ${externalReference} to 'Pagado'.`);
                }
            }
        }
    } catch (error) {
        console.error("[v4] FATAL Error processing Mercado Pago webhook:", error);
        response.status(200).send("OK_WITH_ERROR");
        return;
    }

    console.log("===================================================");
    response.status(200).send("OK");
});

    