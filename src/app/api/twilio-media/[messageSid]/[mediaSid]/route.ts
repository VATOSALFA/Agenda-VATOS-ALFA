
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

// This is a server-side route, so we can use the Twilio SDK and credentials safely.

export async function GET(
  request: NextRequest,
  { params }: { params: { messageSid: string; mediaSid: string } }
) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 });
  }

  const { messageSid, mediaSid } = params;

  if (!messageSid || !mediaSid) {
    return NextResponse.json({ error: 'Missing messageSid or mediaSid' }, { status: 400 });
  }

  try {
    const client = twilio(accountSid, authToken);
    
    // Construct the direct media URL using Twilio's API structure.
    // Note: The public URL from the webhook is temporary. This API call is more reliable.
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media/${mediaSid}`;
    
    // Use node-fetch to get the image data with authentication.
    // The twilio-node helper library doesn't have a direct method for fetching media content as a stream/buffer.
    const response = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`
      }
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Twilio API error for SID ${mediaSid}: ${response.status}`, errorBody);
        return NextResponse.json({ error: 'Failed to fetch media from Twilio' }, { status: response.status });
    }

    // Get the content type from Twilio's response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Stream the image back to the client
    const imageBuffer = await response.arrayBuffer();
    
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for a year
      },
    });

  } catch (error) {
    console.error('Error proxying Twilio media:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

