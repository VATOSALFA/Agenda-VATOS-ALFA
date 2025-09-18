
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { collection, doc, serverTimestamp, increment, setDoc } from 'firebase/firestore';
import twilio from 'twilio';

// Helper function to download media from Twilio and upload to Firebase Storage
async function handleMedia(mediaUrl: string, mediaContentType: string, phoneNumber: string): Promise<{ storageUrl: string, mediaType: 'image' | 'audio' | 'document' | 'other' }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken || accountSid.startsWith('ACxxx')) {
        throw new Error("Twilio credentials are not configured on the server.");
    }
    
    // Twilio's Node.js helper library is the most reliable way to make authenticated requests
    const twilioClient = twilio(accountSid, authToken);

    const mediaResponse = await twilioClient.httpClient.request({
        method: 'GET',
        uri: mediaUrl,
        username: accountSid,
        password: authToken,
    });
    
    if (!mediaResponse || mediaResponse.statusCode !== 200) {
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

    // Use getSignedUrl for server-side URL generation, valid for a long time
    const [publicUrl] = await fileRef.getSignedUrl({
        action: 'read',
        expires: '03-09-2491', // A very distant future date
    });
    
    let mediaType: 'image' | 'audio' | 'document' | 'other' = 'other';
    if (mediaContentType.startsWith('image')) mediaType = 'image';
    else if (mediaContentType.startsWith('audio')) mediaType = 'audio';
    else if (mediaContentType === 'application/pdf') mediaType = 'document';
    
    return { storageUrl: publicUrl, mediaType };
}


export async function POST(req: NextRequest) {
    console.log("INCOMING TWILIO WEBHOOK");
    
    // Twilio webhooks come as x-www-form-urlencoded, so we need to parse the text body
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    
    const from = params.get('From');
    const messageBody = params.get('Body') || '';
    const messageSid = params.get('MessageSid');
    const numMedia = parseInt(params.get('NumMedia') || '0', 10);
    
    if (!from || !messageSid) {
        console.error('Webhook payload is missing "From" or "MessageSid"');
        return NextResponse.json({ error: 'Payload missing required fields.' }, { status: 400 });
    }
    
    const conversationId = from; // Use client's number as document ID
    const conversationRef = doc(adminDb, 'conversations', conversationId);
    
    try {
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
        
        // 1. Save the new message to the subcollection
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
        
        // 2. Update the parent conversation document (last message preview, unread count)
        const lastMessageText = finalMessage || (mediaType ? `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]` : '[Mensaje vacío]');
        
        await setDoc(conversationRef, {
            lastMessageText: lastMessageText,
            lastMessageTimestamp: serverTimestamp(),
            unreadCount: increment(1)
        }, { merge: true });


        // Respond to Twilio to acknowledge receipt
        return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });

    } catch (error: any) {
        console.error('Error processing Twilio webhook:', error);
        // Return a 500 error to Twilio so it knows something went wrong on our end
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
