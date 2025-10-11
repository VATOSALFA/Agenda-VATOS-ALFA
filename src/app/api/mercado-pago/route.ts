
import { NextResponse, type NextRequest } from 'next/server';

// Esta función manejará las notificaciones de Mercado Pago
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Webhook de Mercado Pago recibido:', body);

    // Aquí procesarías la notificación.
    // Por ejemplo, si es una notificación de pago (body.type === 'payment')
    // podrías usar el body.data.id para obtener los detalles del pago
    // desde la API de Mercado Pago y actualizar el estado en tu base de datos.
    
    // Lógica futura:
    // 1. Validar la firma de Mercado Pago (por seguridad).
    // 2. Obtener el ID del intento de pago de 'body'.
    // 3. Consultar a la API de Mercado Pago por el estado de ese pago.
    // 4. Actualizar la venta correspondiente en Firestore a 'Pagado' o 'Fallido'.

    // Por ahora, solo responderemos que la recibimos correctamente.
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error al procesar webhook de Mercado Pago:', error);
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }
}

// Es buena práctica tener un método GET para verificar que el endpoint está vivo.
export async function GET(req: NextRequest) {
    return new NextResponse('Endpoint de Mercado Pago activo y escuchando para notificaciones POST.', { status: 200 });
}
