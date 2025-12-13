
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumberRaw = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken) {
    console.warn('Twilio credentials are not fully configured.');
}

const client = twilio(accountSid, authToken);

export const sendWhatsAppMessage = async ({
    to,
    contentSid,
    contentVariables,
}: {
    to: string;
    contentSid: string;
    contentVariables?: Record<string, string>;
}) => {
    if (!fromNumberRaw) {
        throw new Error('Twilio Phone Number is not configured.');
    }

    const fromNumber = `whatsapp:${fromNumberRaw.startsWith('+') ? fromNumberRaw : `+${fromNumberRaw}`}`;
    // Ensure the number is formatted correctly for Mexico (adding +521 if missing, stripping non-digits)
    // Note: This specific formatting logic might need to be more generic depending on the use case,
    // but preserving the existing logic for now.
    const cleanTo = to.replace(/\D/g, '');
    const toNumber = `whatsapp:+521${cleanTo}`;

    try {
        const message = await client.messages.create({
            from: fromNumber,
            to: toNumber,
            contentSid,
            contentVariables: contentVariables ? JSON.stringify(contentVariables) : undefined,
        });
        return message;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        throw error;
    }
};

export const sendSMS = async ({ to, body }: { to: string; body: string }) => {
    if (!fromNumberRaw) {
        throw new Error('Twilio Phone Number is not configured.');
    }

    const fromNumber = fromNumberRaw.startsWith('+') ? fromNumberRaw : `+${fromNumberRaw}`;
    const cleanTo = to.replace(/\D/g, '');
    // Defaulting to Mexico country code +52 if not present? 
    // For now, let's assume the input 'to' should be handled carefully or add +52 if not present.
    // The previous code forced +521 for WhatsApp. For SMS usually +52 is enough or +52 + 10 digits.
    const toNumber = `+52${cleanTo}`;

    try {
        const message = await client.messages.create({
            from: fromNumber,
            to: toNumber,
            body,
        });
        return message;
    } catch (error) {
        console.error('Error sending SMS:', error);
        throw error;
    }
};
