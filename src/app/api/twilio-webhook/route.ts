
// This file is no longer used and can be safely ignored or deleted.
// The webhook logic has been moved to a Cloud Function in `functions/src/index.ts`
// to ensure proper handling of environment variables and execution context.

import { NextResponse } from 'next/server';

export async function POST() {
  console.warn("The /api/twilio-webhook endpoint is deprecated. Use the 'twilioWebhook' Cloud Function instead.");
  return new NextResponse('This endpoint is deprecated.', { status: 410 });
}
