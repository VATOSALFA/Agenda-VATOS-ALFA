
// This endpoint is temporarily disabled.
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return NextResponse.json({ message: "Twilio webhook is disabled." }, { status: 200 });
}
