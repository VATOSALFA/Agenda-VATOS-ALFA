
import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/services/twilio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, contentSid, contentVariables } = body;

    if (!to || !contentSid) {
      return NextResponse.json({ success: false, error: 'Missing `to` or `contentSid` parameters.' }, { status: 400 });
    }

    const message = await sendWhatsAppMessage({ to, contentSid, contentVariables });

    return NextResponse.json({ success: true, sid: message.sid });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('Error sending Twilio message:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
