import * as functions from 'firebase-functions';
import { Request, Response } from 'express';
import twilio from 'twilio';
import * as admin from 'firebase-admin';
import { parseISO, format } from 'date-fns';

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();


// =================================================================================
// 1. MERCADO PAGO WEBHOOK (Ya funciona y cumple con la tipificación)
// =================================================================================

export const mercadoPagoWebhookTest = functions.https.onRequest(
    (request: Request, response: Response): void => {
        
        try {
            if (request.method !== 'POST') {
                functions.logger.warn('Método no permitido. Solo POST.', { method: request.method });
                response.status(405).send('Método no permitido. Solo POST.');
                return; 
            }

            functions.logger.info('Notificación de Mercado Pago recibida (TEST):', { body: request.body });

            // Lógica de validación, consulta a API y actualización de Firestore iría aquí.

            response.status(200).send('OK');
            return; 

        } catch (error) {
            functions.logger.error('Error procesando el Webhook de Mercado Pago', error);
            response.status(500).send('Error interno del servidor');
            return; 
        }
    }
);


// =================================================================================
// Función de lógica de Citas (handleClientResponse)
// =================================================================================

async function handleClientResponse(from: string, messageBody: string): Promise<{ handled: boolean, clientId: string | null }> {
    const normalizedMessage = messageBody.trim().toLowerCase();
    
    const confirmationKeywords = ['confirmado', 'confirmo', 'confirmar', 'si', 'yes', 'confirm'];
    const rescheduleKeywords = ['reagendar'];
    const cancellationKeywords = ['cancelar la cita', 'cancelar'];

    let action: 'confirm' | 'reschedule' | 'cancel' | null = null;

    if (confirmationKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'confirm';
    } else if (rescheduleKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'reschedule';
    } else if (cancellationKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'cancel';
    }

    if (!action) {
        return { handled: false, clientId: null };
    }
    
    // Updated phone number normalization for Mexico
    let clientPhone = from.replace(/\D/g, '');
    if (clientPhone.startsWith('521')) {
      clientPhone = clientPhone.substring(3);
    } else if (clientPhone.startsWith('52')) {
      clientPhone = clientPhone.substring(2);
    }

    const clientsQuery = db.collection('clientes').where('telefono', '==', clientPhone).limit(1);
    const clientsSnapshot = await clientsQuery.get();

    if (clientsSnapshot.empty) {
        functions.logger.log(`Client not found with phone: ${clientPhone}`);
        return { handled: false, clientId: null };
    }

    const clientDoc = clientsSnapshot.docs[0];
    const clientId = clientDoc.id;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const reservationsQuery = db.collection('reservas')
        .where('cliente_id', '==', clientId)
        .where('fecha', '>=', today);
    
    const reservationsSnapshot = await reservationsQuery.get();
    
    if (reservationsSnapshot.empty) {
        functions.logger.log(`No pending reservations found for client: ${clientId}`);
        return { handled: true, clientId: clientId };
    }
    
    const upcomingReservations = reservationsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(r => r.estado !== 'Cancelado');

    if (upcomingReservations.length === 0) {
      functions.logger.log(`No non-cancelled upcoming reservations found for client: ${clientId}`);
      return { handled: true, clientId: clientId };
    }

    upcomingReservations.sort((a: any, b: any) => {
        const dateA = parseISO(`${a.fecha}T${a.hora_inicio}`);
        const dateB = parseISO(`${b.fecha}T${b.hora_inicio}`);
        return dateA.getTime() - dateB.getTime();
    });
    
    const reservationToUpdate = upcomingReservations[0];
    const reservationDocRef = db.collection('reservas').doc(reservationToUpdate.id);

    switch(action) {
        case 'confirm':
            await reservationDocRef.update({ estado: 'Confirmado' });
            functions.logger.log(`Reservation ${reservationToUpdate.id} updated to "Confirmado" for client ${clientId}.`);
            break;
        case 'reschedule':
            await reservationDocRef.update({ estado: 'Pendiente' });
            functions.logger.log(`Reservation ${reservationToUpdate.id} updated to "Pendiente" for client ${clientId}.`);
            break;
        case 'cancel':
            await db.runTransaction(async (transaction) => {
                transaction.update(reservationDocRef, { estado: 'Cancelado' });
                transaction.update(clientDoc.ref, { 
                    citas_canceladas: admin.firestore.FieldValue.increment(1)
                });
            });
            functions.logger.log(`Reservation ${reservationToUpdate.id} updated to "Cancelado" for client ${clientId}.`);
            break;
    }

    return { handled: true, clientId: clientId };
}

// =================================================================================
// 2. TWILIO WEBHOOK (CON CORRECCIONES DE USO DE VARIABLES)
// =================================================================================

// La función twilioWebhook es async porque usa 'await' internamente.
export const twilioWebhook = functions.https.onRequest(
    async (request: Request, response: Response) => {
        // Inicialización de TwiML fuera del try para que esté disponible en el catch.
        const twiml = new twilio.twiml.MessagingResponse(); 
        
        try {
            const twilioSignature = request.headers['x-twilio-signature'] as string;
            // Acceso al token configurado previamente.
            const authToken = process.env.TWILIO_AUTH_TOKEN || functions.config().twilio.auth_token || ''; 
            
            // Usamos la URL real estática que configuraste en Twilio para la validación.
            const fullUrl = `https://twiliowebhook-rhesymzm2aa-uc.a.run.app`; 

            const params = request.body;
            
            if (!Object.keys(params).length) {
                functions.logger.warn('Cuerpo de solicitud Twilio vacío. Ignorando.');
                response.status(400).send('Cuerpo vacío.');
                return;
            }

            // **Validación de Seguridad**
            const requestIsValid = twilio.validateRequest(
                authToken,
                twilioSignature,
                fullUrl, 
                params
            );

            if (!requestIsValid) {
                functions.logger.warn('Invalid Twilio signature received.', { signature: twilioSignature, url: fullUrl });
                response.status(403).send('Invalid Twilio Signature');
                return;
            }

            // --- LÓGICA PRINCIPAL ---
            const from = params.From as string;
            const to = params.To as string;
            const messageBody = (params.Body as string) || '';
            const numMedia = parseInt((params.NumMedia as string) || '0', 10); // TS6133 en esta línea

            functions.logger.info(`Mensaje de Twilio recibido de ${from} a ${to}:`, { body: messageBody });

            // Manejar confirmación/cancelación de citas
            // clientId se usa para obtener el nombre, resolviendo la advertencia TS6133
            const { clientId } = await handleClientResponse(from, messageBody); 
            
            // Guardar el mensaje en Firestore (Lógica existente)
            const conversationId = from.replace('whatsapp:', ''); 
            const conversationRef = db.collection('conversations').doc(conversationId);
            
            // La colección se usa abajo, resolviendo la advertencia TS6133
            const messagesCollectionRef = conversationRef.collection('messages'); 

            // =====================================================================
            // Lógica de Media (Usa numMedia y messagesCollectionRef para resolver TS6133)
            // =====================================================================

            const messageData: { [key: string]: any } = {
                senderId: 'client',
                text: messageBody,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
            };

            if (numMedia > 0) {
                const mediaUrl = params.MediaUrl0 as string;
                const mediaContentType = params.MediaContentType0 as string;
                
                if(mediaUrl) {
                    messageData.mediaUrl = mediaUrl;
                    if (mediaContentType?.startsWith('image/')) {
                        messageData.mediaType = 'image';
                    } else if (mediaContentType?.startsWith('audio/')) {
                        messageData.mediaType = 'audio';
                    } else if (mediaContentType === 'application/pdf') {
                        messageData.mediaType = 'document';
                    }
                }
            }

            // **Uso de messagesCollectionRef para guardar el mensaje**
            await messagesCollectionRef.add(messageData); 
            
            // =====================================================================
            // Lógica de actualización de conversación
            // =====================================================================

            const lastMessagePreview = messageBody || (messageData.mediaType ? `[${messageData.mediaType.charAt(0).toUpperCase() + messageData.mediaType.slice(1)}]` : '[Mensaje vacío]');
            
            const conversationDoc = await conversationRef.get();

            if (!conversationDoc.exists) {
                let clientName = from;
                if (clientId) {
                    const clientRecord = await db.collection('clientes').doc(clientId).get();
                    if (clientRecord.exists) {
                        const clientData = clientRecord.data();
                        clientName = `${clientData?.nombre} ${clientData?.apellido}`;
                    }
                }
                
                await conversationRef.set({
                    lastMessageText: lastMessagePreview,
                    lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                    unreadCount: admin.firestore.FieldValue.increment(1),
                    clientName: clientName,
                });
            } else {
                await conversationRef.update({
                    lastMessageText: lastMessagePreview,
                    lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                    unreadCount: admin.firestore.FieldValue.increment(1),
                });
            }

            // **CORRECCIÓN FINAL DE RESPUESTA:** Aseguramos el TwiML y cerramos la conexión.
            response.writeHead(200, { 'Content-Type': 'text/xml' });
            response.end(twiml.toString());
            
        } catch (error) {
            functions.logger.error('Error processing Twilio webhook', error);
            // Aseguramos una respuesta para Twilio incluso si falla internamente
            response.status(500).send('<Response><Message>Error interno en la agenda.</Message></Response>');
        }
    }
);

