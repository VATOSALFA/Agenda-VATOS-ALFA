
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

export default function BookingSuccessPage() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card>
        <CardHeader className="items-center text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-3xl">¡Reserva Confirmada!</CardTitle>
            <CardDescription>Tu cita ha sido agendada con éxito.</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
                Hemos enviado un correo electrónico con los detalles de tu reserva. 
                Recibirás un recordatorio por WhatsApp un día antes de tu cita.
            </p>
            <p className="font-semibold">¡Te esperamos!</p>
            <Button asChild>
                <Link href="/">Volver al Inicio</Link>
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}
