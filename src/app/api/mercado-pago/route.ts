
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';

// Esta función manejará las notificaciones de Mercado Pago (Webhooks)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // --- Lógica de Validación de Firma ---
    const signatureHeader = req.headers.get('x-signature');
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    if (!signatureHeader || !webhookSecret) {
        console.warn('MP Webhook: Falta la cabecera de firma o el secreto.');
        return new NextResponse('Signature missing or secret not configured', { status: 401 });
    }
    
    // Extraer ts y hash de la cabecera, ej: ts=1623945420,v1=...
    const parts = signatureHeader.split(',').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
    }, {} as Record<string, string>);

    const ts = parts['ts'];
    const signatureFromMP = parts['v1'];
    
    if(!ts || !signatureFromMP) {
         return new NextResponse('Invalid signature header', { status: 401 });
    }

    // Generar la firma localmente
    const manifest = `id:${body.data.id};request-id:${req.headers.get('x-request-id')};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(manifest);
    const localSignature = hmac.digest('hex');

    // Comparar las firmas
    if (localSignature !== signatureFromMP) {
        console.warn('MP Webhook: Firma inválida.');
        return new NextResponse('Invalid signature', { status: 403 });
    }
    // --- Fin de la Lógica de Validación ---

    console.log('Webhook de Mercado Pago verificado y recibido:', body);

    // Lógica futura para procesar la notificación:
    // 1. Extraer el ID del pago o intento de pago del cuerpo ('body.data.id').
    // 2. Usar el ID para consultar el estado actual del pago a la API de Mercado Pago.
    // 3. Con el estado confirmado, actualizar la venta correspondiente en Firestore a 'Pagado' o 'Fallido'.

    // Por ahora, solo confirmamos que la notificación se recibió y validó correctamente.
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error al procesar webhook de Mercado Pago:', error);
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }
}

// Es una buena práctica tener un método GET para verificar que el endpoint está activo.
export async function GET(req: NextRequest) {
    return new NextResponse('Endpoint de Mercado Pago activo y escuchando para notificaciones POST.', { status: 200 });
}
