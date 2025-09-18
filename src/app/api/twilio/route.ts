
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { collection, doc, serverTimestamp, increment, setDoc } from 'firebase/firestore';
import twilio from 'twilio';
import * as fs from 'fs';

// Helper function to get Twilio credentials and throw a clear error if not set
function getTwilioCredentials() {
    let accountSid = process.env.TWILIO_ACCOUNT_SID;
    let authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid && fs.existsSync('/etc/secrets/TWILIO_ACCOUNT_SID')) {
        accountSid = fs.readFileSync('/etc/secrets/TWILIO_ACCOUNT_SID', 'utf8').trim();
    }
    if (!authToken && fs.existsSync('/etc/secrets/TWILIO_AUTH_TOKEN')) {
        authToken = fs.readFileSync('/etc/secrets/TWILIO_AUTH_TOKEN', 'utf8').trim();
    }

    if (!accountSid || !authToken || accountSid.startsWith('ACxxx')) {
        throw new Error("Las credenciales de Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) no están configuradas en el servidor.");
    }
    return { accountSid, authToken };
}


// Helper function to download media from Twilio and upload to Firebase Storage
async function handleMedia(mediaUrl: string, mediaContentType: string, phoneNumber: string): Promise<{ storageUrl: string, mediaType: 'image' | 'audio' | 'document' | 'other' }> {
    const { accountSid, authToken } = getTwilioCredentials();
    const client = twilio(accountSid, authToken);

    const mediaResponse = await client.httpClient.request({
        method: 'GET',
        uri: mediaUrl,
        username: accountSid,
        password: authToken,
    });
    
    if (mediaResponse.statusCode !== 200 || !mediaResponse.body) {
        throw new Error(`Failed to download media from Twilio. Status: ${mediaResponse?.statusCode}`);
    }
    
    const mediaBuffer = Buffer.from(mediaResponse.body, 'binary');

    const fileExtension = mediaContentType.split('/')[1] || 'bin';
    const fileName = `whatsapp_media/${phoneNumber}/${Date.now()}.${fileExtension}`;
    const fileRef = adminStorage.bucket().file(fileName);

    await fileRef.save(mediaBuffer, {
        metadata: {
            contentType: mediaContentType,
        },
    });

    await fileRef.makePublic();
    const publicUrl = fileRef.publicUrl();
    
    let mediaType: 'image' | 'audio' | 'document' | 'other' = 'other';
    if (mediaContentType.startsWith('image')) mediaType = 'image';
    else if (mediaContentType.startsWith('audio')) mediaType = 'audio';
    else if (mediaContentType === 'application/pdf') mediaType = 'document';
    
    return { storageUrl: publicUrl, mediaType };
}


export async function POST(req: NextRequest) {
    console.log("INCOMING TWILIO WEBHOOK");
    
    try {
        const { accountSid, authToken } = getTwilioCredentials();

        // Use twilio library to validate the request
        const twilioSignature = req.headers.get('x-twilio-signature');
        const requestUrl = req.url;
        const bodyText = await req.text();
        const params = new URLSearchParams(bodyText);
        const bodyObject: { [key: string]: any } = {};
        for(const [key, value] of params.entries()){
            bodyObject[key] = value;
        }

        if (twilio.validateRequest(authToken, twilioSignature!, requestUrl, bodyObject)) {
            const from = params.get('From');
            const messageBody = params.get('Body') || '';
            const messageSid = params.get('MessageSid');
            const numMedia = parseInt(params.get('NumMedia') || '0', 10);
            
            if (!from || !messageSid) {
                console.error('Webhook payload is missing "From" or "MessageSid"');
                return NextResponse.json({ error: 'Payload missing required fields.' }, { status: 400 });
            }
            
            const conversationId = from;
            const conversationRef = doc(adminDb, 'conversations', conversationId);
        
            let finalMessage = messageBody;
            let mediaUrl: string | undefined = undefined;
            let mediaType: 'image' | 'audio' | 'document' | 'other' | undefined = undefined;

            if (numMedia > 0) {
                const mediaUrlFromTwilio = params.get('MediaUrl0');
                const mediaContentType = params.get('MediaContentType0');
                
                if (mediaUrlFromTwilio && mediaContentType) {
                    try {
                        const result = await handleMedia(mediaUrlFromTwilio, mediaContentType, from.replace('whatsapp:', ''));
                        mediaUrl = result.storageUrl;
                        mediaType = result.mediaType;
                    } catch (mediaError: any) {
                        console.error("Error handling media:", mediaError);
                        finalMessage = `${finalMessage} [Media no pudo ser procesado: ${mediaError.message}]`;
                    }
                }
            }
            
            const newMessageRef = doc(collection(conversationRef, 'messages'));
            const messageData: any = {
                senderId: 'client',
                text: finalMessage,
                timestamp: serverTimestamp(),
                messageSid: messageSid,
                read: false,
            };

            if (mediaUrl && mediaType) {
                messageData.mediaUrl = mediaUrl;
                messageData.mediaType = mediaType;
            }
            
            await setDoc(newMessageRef, messageData);
            
            const lastMessageText = finalMessage || (mediaType ? `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]` : '[Mensaje vacío]');
            
            await setDoc(conversationRef, {
                lastMessageText: lastMessageText,
                lastMessageTimestamp: serverTimestamp(),
                unreadCount: increment(1)
            }, { merge: true });

            return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
        } else {
            console.error("Twilio request validation failed.");
            return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 });
        }

    } catch (error: any) {
        console.error('CRITICAL ERROR in Twilio webhook:', error.message);
        if (error.message.includes("Las credenciales de Twilio")) {
            return NextResponse.json({ error: 'Twilio credentials not configured on server.', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
