
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { collection, doc, serverTimestamp, runTransaction, increment, setDoc } from 'firebase/firestore';
import twilio from 'twilio';

// Helper function to download media from Twilio and upload to Firebase Storage
async function handleMedia(mediaUrl: string, mediaContentType: string, phoneNumber: string): Promise<string> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        throw new Error("Twilio credentials are not configured on the server.");
    }

    const twilioClient = twilio(accountSid, authToken);
    const mediaResponse = await twilioClient.httpClient.request({
        method: 'GET',
        uri: mediaUrl,
        username: accountSid,
        password: authToken,
    });
    
    const mediaBuffer = Buffer.from(mediaResponse.body, 'binary');

    const fileExtension = mediaContentType.split('/')[1] || 'bin';
    const fileName = `whatsapp_media/${phoneNumber}/${Date.now()}.${fileExtension}`;
    const fileRef = adminStorage.bucket().file(fileName);

    await fileRef.save(mediaBuffer, {
        metadata: {
            contentType: mediaContentType,
        },
    });

    const publicUrl = await getDownloadURL(fileRef);
    return publicUrl;
}

export async function POST(req: NextRequest) {
    const body = await req.formData();
    const from = body.get('From') as string; // e.g., whatsapp:+5214428133314
    const to = body.get('To') as string;
    const messageBody = (body.get('Body') as string) || '';
    const messageSid = body.get('MessageSid') as string;
    const numMedia = parseInt(body.get('NumMedia') as string || '0', 10);
    
    if (!from) {
        return NextResponse.json({ error: 'No "From" number in webhook payload' }, { status: 400 });
    }
    
    const conversationId = from; // Use client's number as document ID
    const conversationRef = doc(adminDb, 'conversations', conversationId);
    
    try {
        let finalMessage = messageBody;
        let mediaUrl: string | undefined = undefined;
        let mediaType: 'image' | 'audio' | 'document' | undefined = undefined;

        if (numMedia > 0) {
            const mediaUrlFromTwilio = body.get('MediaUrl0') as string;
            const mediaContentType = body.get('MediaContentType0') as string;
            
            if (mediaUrlFromTwilio && mediaContentType) {
                try {
                    const storageUrl = await handleMedia(mediaUrlFromTwilio, mediaContentType, from.replace('whatsapp:', ''));
                    mediaUrl = storageUrl;
                    if (mediaContentType.startsWith('image')) mediaType = 'image';
                    else if (mediaContentType.startsWith('audio')) mediaType = 'audio';
                    else if (mediaContentType === 'application/pdf') mediaType = 'document';
                } catch (mediaError) {
                    console.error("Error handling media:", mediaError);
                    finalMessage = `${finalMessage} [Media no pudo ser procesado]`;
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
        
        // 2. Update the parent conversation document
        const lastMessageText = finalMessage || (mediaType ? `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]` : '[Mensaje vacío]');
        
        await setDoc(conversationRef, {
            lastMessageText: lastMessageText,
            lastMessageTimestamp: serverTimestamp(),
            unreadCount: increment(1)
        }, { merge: true });


        // Respond to Twilio to acknowledge receipt
        return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });

    } catch (error) {
        console.error('Error processing Twilio webhook:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
