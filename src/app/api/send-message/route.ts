
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, contentSid, contentVariables } = body;

    if (!to || !contentSid) {
      return NextResponse.json({ success: false, error: 'Missing `to` or `contentSid` parameters.' }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumberRaw = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumberRaw) {
      console.error('Twilio credentials are not configured on the server.');
      return NextResponse.json({ success: false, error: 'Twilio credentials are not configured on the server.' }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);

    const fromNumber = `whatsapp:${fromNumberRaw.startsWith('+') ? fromNumberRaw : `+${fromNumberRaw}`}`;
    // Add Mexico's required prefixes for mobile numbers
    const toNumber = `whatsapp:+521${to.replace(/\D/g, '')}`;

    const message = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      contentSid: contentSid,
      contentVariables: contentVariables ? JSON.stringify(contentVariables) : undefined,
    });

    return NextResponse.json({ success: true, sid: message.sid });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('Error sending Twilio message:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
