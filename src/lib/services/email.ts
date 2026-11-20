
import 'server-only';
import { Resend } from 'resend';
import { getDb } from '@/lib/firebase-server';

const resendApiKey = process.env.RESEND_API_KEY || '';

if (!resendApiKey) {
    console.warn('Resend API Key is not configured.');
}

// Safe initialization
const getResendClient = () => {
    if (!resendApiKey) {
        // Return a mock or throw ONLY when used, not on boot
        return null;
    }
    return new Resend(resendApiKey);
};

// Default sender email - fallback if Firebase config is not available
const DEFAULT_SENDER = 'Agenda VATOS ALFA <contacto@vatosalfa.com>';
let cachedSender: { value: string; expiresAt: number } | null = null;

// Get the primary sender email from Firebase Admin configuration (cached 5 min)
export const getPrimarySenderEmail = async (): Promise<string> => {
    if (cachedSender && Date.now() < cachedSender.expiresAt) {
        return cachedSender.value;
    }
    try {
        const db = getDb();
        const emailConfigDoc = await db.collection('configuracion').doc('emails').get();

        if (emailConfigDoc.exists) {
            const data = emailConfigDoc.data() || {};
            const senders = data.senders || [];

            // Find the primary sender
            const primarySender = senders.find((s: any) => s.isPrimary && s.confirmed);

            if (primarySender) {
                const formatted = `Agenda VATOS ALFA <${primarySender.email}>`;
                cachedSender = { value: formatted, expiresAt: Date.now() + 5 * 60 * 1000 };
                return formatted;
            }

            // Fallback: use first confirmed sender if no primary is set
            const confirmedSender = senders.find((s: any) => s.confirmed);
            if (confirmedSender) {
                const formatted = `Agenda VATOS ALFA <${confirmedSender.email}>`;
                cachedSender = { value: formatted, expiresAt: Date.now() + 5 * 60 * 1000 };
                return formatted;
            }
        }

        cachedSender = { value: DEFAULT_SENDER, expiresAt: Date.now() + 5 * 60 * 1000 };
        return DEFAULT_SENDER;
    } catch (error) {
        console.error('Error fetching primary sender:', error);
        return DEFAULT_SENDER;
    }
};

export interface EmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
    react?: React.ReactElement;
    text?: string;
}

export const sendEmail = async ({ to, subject, html, from, react, text }: EmailOptions) => {
    if (!resendApiKey) {
        throw new Error('Resend API Key is not configured.');
    }

    // Use provided 'from', or fetch from Firebase, or use default
    const fromEmail = from || await getPrimarySenderEmail();

    const resend = getResendClient();
    if (!resend) {
        console.error('Resend API Key missing. Skipping email.');
        return { success: false, error: 'Configuration Error: No Email Key' };
    }

    try {
        const data = await resend.emails.send({
            from: fromEmail,
            to,
            subject,
            html,
            react,
            text,
        });

        console.log(`Email sent successfully to ${to} from ${fromEmail}`);
        return { success: true, data };
    } catch (error) {
        console.error('Error sending email with Resend:', error);
        return { success: false, error };
    }
};
