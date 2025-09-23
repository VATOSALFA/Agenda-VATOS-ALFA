
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-server';
import { collection, doc, serverTimestamp, increment, setDoc } from 'firebase/firestore';
import twilio from 'twilio';

// Helper function to download media from Twilio and upload to Firebase Storage
async function handleMedia(mediaUrl: string, mediaContentType: string, phoneNumber: string): Promise<{ storageUrl: string, mediaType: 'image' | 'audio' | 'document' | 'other' }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
        throw new Error("Twilio credentials not found on server.");
    }
    
    const response = await fetch(mediaUrl, {
        headers: {
            'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
        }
    });

    if (!response.ok || !response.body) {
        throw new Error(`Failed to download media from Twilio. Status: ${response.status}`);
    }
    
    const mediaBuffer = Buffer.from(await response.arrayBuffer());

    const fileExtension = mediaContentType.split('/')[1] || 'bin';
    const fileName = `whatsapp_media/${phoneNumber}/${Date.now()}.${fileExtension}`;
    const fileRef = adminStorage.bucket().file(fileName);

    await fileRef.save(mediaBuffer, {
        metadata: {
            contentType: mediaContentType,
        },
    });

    await fileRef.makePublic();
    
    const publicUrl = `https://storage.googleapis.com/${adminStorage.bucket().name}/${fileName}`;
    
    let mediaType: 'image' | 'audio' | 'document' | 'other' = 'other';
    if (mediaContentType.startsWith('image')) mediaType = 'image';
    else if (mediaContentType.startsWith('audio')) mediaType = 'audio';
    else if (mediaContentType === 'application/pdf') mediaType = 'document';
    
    return { storageUrl: publicUrl, mediaType };
}


export async function POST(req: NextRequest) {
    console.log("INCOMING TWILIO WEBHOOK");
    
    try {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!authToken) {
            throw new Error("TWILIO_AUTH_TOKEN is not configured.");
        }

        const twilioSignature = req.headers.get('x-twilio-signature');
        
        // Reconstruct the full URL for validation
        const protocol = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('host');
        const originalUrl = `${protocol}://${host}${req.nextUrl.pathname}`;
        
        const bodyText = await req.text();
        const params = new URLSearchParams(bodyText);
        const bodyObject: { [key: string]: any } = {};
        for(const [key, value] of params.entries()){
            bodyObject[key] = value;
        }

        if (twilio.validateRequest(authToken, twilioSignature!, originalUrl, bodyObject)) {
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
            return new NextResponse('Twilio signature validation failed.', { status: 403 });
        }

    } catch (error: any) {
        console.error('CRITICAL ERROR in Twilio webhook:', error.message, error.stack);
        return new NextResponse(`Webhook Error: ${error.message}`, { status: 500 });
    }
}
