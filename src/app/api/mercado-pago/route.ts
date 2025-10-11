
import { NextResponse, type NextRequest } from 'next/server';

// Esta función manejará las notificaciones de Mercado Pago (Webhooks)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Webhook de Mercado Pago recibido:', body);

    // Lógica futura para procesar la notificación:
    // 1. Validar la autenticidad de la notificación (usando la firma de MP).
    // 2. Extraer el ID del pago o intento de pago del cuerpo ('body').
    // 3. Usar el ID para consultar el estado actual del pago a la API de Mercado Pago.
    // 4. Con el estado confirmado, actualizar la venta correspondiente en Firestore a 'Pagado' o 'Fallido'.

    // Por ahora, solo confirmamos que la notificación se recibió correctamente.
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
