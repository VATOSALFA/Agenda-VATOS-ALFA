'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { CustomLoader } from '@/components/ui/custom-loader';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function PrivacidadPage() {
    const { data: empresaData, loading } = useFirestoreQuery<any>('empresa');

    if (loading) return <div className="h-screen flex items-center justify-center"><CustomLoader size={50} /></div>;

    const companyName = empresaData?.[0]?.name || 'Vatos Alfa Barber Shop';

    return (
        <div className="container mx-auto py-12 px-4 max-w-3xl">
            <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
                <Link href="/">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Volver al Inicio
                </Link>
            </Button>
            <h1 className="text-3xl font-bold mb-8 text-primary">Aviso de Privacidad Integral</h1>
            <div className="prose prose-slate max-w-none space-y-8">

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">IDENTIDAD Y DOMICILIO</h3>
                    <p>
                        <strong>{companyName}</strong>, ubicado en Querétaro, México, es el responsable del uso y protección de sus datos personales.
                    </p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">DATOS RECABADOS</h3>
                    <p>
                        Para la prestación de nuestros servicios, recabamos:
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Nombre completo</li>
                        <li>Número de teléfono (móvil/WhatsApp)</li>
                        <li>Correo electrónico</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">FINALIDADES</h3>
                    <div className="space-y-3">
                        <p><strong className="text-slate-700">Primarias:</strong> Gestión de citas, identificación del cliente y prestación del servicio de barbería.</p>
                        <p><strong className="text-slate-700">Secundarias:</strong> Envío de recordatorios de citas vía WhatsApp/SMS (usando proveedores tecnológicos) y encuestas de calidad.</p>
                    </div>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">TRANSFERENCIA DE DATOS</h3>
                    <p>
                        Sus datos pueden ser compartidos con proveedores tecnológicos (como Google Cloud o servicios de mensajería) únicamente para la operación del sistema de reservas. <strong>No vendemos sus datos a terceros.</strong>
                    </p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">DERECHOS ARCO</h3>
                    <p>
                        Usted puede acceder, rectificar, cancelar u oponerse al tratamiento de sus datos enviando un correo electrónico a <strong>contacto@vatosalfa.com</strong>.
                    </p>
                </section>

                <p className="text-sm text-muted-foreground mt-8 pt-4 border-t">
                    Última actualización: {new Date().toLocaleDateString()}
                </p>
            </div>
        </div>
    );
}
