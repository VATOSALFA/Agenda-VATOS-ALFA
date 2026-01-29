
import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

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

    const fromEmail = from || process.env.RESEND_FROM_EMAIL || 'Agenda VATOS ALFA <contacto@vatosalfa.com>';

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

        return { success: true, data };
    } catch (error) {
        console.error('Error sending email with Resend:', error);
        return { success: false, error };
    }
};
