'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { CustomLoader } from '@/components/ui/custom-loader';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function TerminosPage() {
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
            <h1 className="text-3xl font-bold mb-8 text-primary">Términos y Condiciones de Servicio</h1>
            <div className="prose prose-slate max-w-none space-y-8">

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">1. ACEPTACIÓN</h3>
                    <p>
                        Al reservar una cita en <strong>{companyName}</strong>, usted acepta estos términos. Nos reservamos el derecho de admitir o negar el servicio si se violan normas de conducta.
                    </p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">2. POLÍTICA DE CITAS Y TOLERANCIA</h3>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>
                            <strong>Tolerancia máxima:</strong> 10 minutos. Después de este tiempo, la cita se considera "No Show" y el barbero podrá atender a otro cliente.
                        </li>
                        <li>
                            <strong>Cancelaciones:</strong> Deben realizarse con al menos 2 horas de anticipación a través de la plataforma o WhatsApp.
                        </li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">3. PAGOS Y PRECIOS</h3>
                    <p>
                        Los precios están en Pesos Mexicanos (MXN) e incluyen IVA. Nos reservamos el derecho de modificar precios sin previo aviso (respetando citas ya confirmadas).
                    </p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">4. RESPONSABILIDAD</h3>
                    <p>
                        <strong>{companyName}</strong> no se hace responsable por objetos olvidados en el establecimiento, aunque haremos lo posible por resguardarlos.
                    </p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mb-3 text-slate-800">5. JURISDICCIÓN</h3>
                    <p>
                        Para la interpretación y cumplimiento de estos términos, ambas partes se someten a las leyes y tribunales competentes de la ciudad de <strong>Santiago de Querétaro</strong>, renunciando a cualquier otro fuero que pudiera corresponderles.
                    </p>
                </section>

                <p className="text-sm text-muted-foreground mt-8 pt-4 border-t">
                    <strong>{companyName}</strong> se reserva el derecho de modificar estos términos en cualquier momento.
                </p>
            </div>
        </div>
    );
}
