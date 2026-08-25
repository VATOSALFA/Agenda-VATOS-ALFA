'use client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { CustomLoader } from '@/components/ui/custom-loader';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function TerminosPage() {
    const { data: empresaData, loading } = useFirestoreQuery<any>('empresa');

    const isLoading = loading && !empresaData;
    const companyName = empresaData?.[0]?.name || 'VATOS ALFA Barber Shop';

    return (
        <div className="container mx-auto py-12 px-4 max-w-3xl">
            <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
                <Link href="/">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Volver al Inicio
                </Link>
            </Button>
            <h1 className="text-3xl font-bold mb-2 text-primary flex items-center gap-3">
                Términos y Condiciones de Servicio
                {isLoading && <CustomLoader size={20} />}
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
                Última actualización: Agosto 2026 &bull; {companyName}
            </p>

            <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

                <section className="bg-slate-50/80 p-5 rounded-xl border border-slate-200/80 space-y-2">
                    <h3 className="text-lg font-bold text-slate-900 m-0">1. ACEPTACIÓN Y ALCANCE</h3>
                    <p className="text-sm m-0">
                        La programación de una cita, la contratación o recepción de servicios, así como la compra de productos en <strong>{companyName}</strong> (ya sea a través de nuestra plataforma web, de manera presencial, telefónica o por mensajería instantánea), constituye la aceptación expresa, plena e incondicional de los presentes Términos y Condiciones.
                    </p>
                </section>

                <section className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">2. POLÍTICA DE CITAS, PUNTUALIDAD Y TOLERANCIA</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>
                            <strong>Tolerancia máxima estricta de 10 minutos:</strong> Con el fin de garantizar el tiempo y calidad del servicio de todos los clientes y la agenda del profesional, se otorga una tolerancia máxima de 10 minutos a partir de la hora agendada.
                        </li>
                        <li>
                            <strong>Inasistencia por retraso (&ldquo;No Show&rdquo;):</strong> Transcurridos los 10 minutos de tolerancia sin presencia ni aviso previo del cliente, la cita se considerará automáticamente cancelada por inasistencia y el profesional quedará en libertad de disponer del horario para atender a otros clientes.
                        </li>
                        <li>
                            <strong>Llegada anticipada recomendada:</strong> Se sugiere presentarse en la sucursal de 5 a 10 minutos antes de la hora reservada.
                        </li>
                    </ul>
                </section>

                <section className="space-y-3 bg-blue-50/60 p-5 rounded-xl border border-blue-200/70">
                    <h3 className="text-lg font-bold text-blue-950 m-0">3. POLÍTICA DE ANTICIPOS (DEPÓSITOS DE GARANTÍA)</h3>
                    <div className="text-sm text-slate-700 space-y-2.5">
                        <p>
                            <strong>3.1 Naturaleza del anticipo:</strong> El anticipo constituye una garantía de apartado y bloqueo exclusivo del tiempo y agenda del profesional seleccionado, así como de la preparación de insumos y recursos operativos necesarios para su atención.
                        </p>
                        <p>
                            <strong>3.2 Criterios de requerimiento:</strong> El sistema o el personal de <strong>{companyName}</strong> podrá solicitar el pago de un anticipo para confirmar y asegurar la reserva en los siguientes casos:
                        </p>
                        <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
                            <li>Paquetes o servicios individuales que por su duración y valor requieran apartado previo.</li>
                            <li>Reservas en las que el monto acumulado de los servicios seleccionados alcance o supere el importe mínimo establecido por el establecimiento.</li>
                            <li>Fechas de alta demanda o clientes con antecedentes de inasistencia previa sin aviso.</li>
                        </ul>
                        <p>
                            <strong>3.3 Métodos de pago aceptados:</strong> Los anticipos podrán liquidarse en línea de manera segura mediante la pasarela de pago oficial (Mercado Pago, tarjetas de débito/crédito) o vía transferencia electrónica debidamente confirmada.
                        </p>
                        <p>
                            <strong>3.4 Aplicación del anticipo:</strong> El importe pagado en concepto de anticipo será acreditado y descontado automáticamente del total a pagar al momento de liquidar la cuenta final en la caja del establecimiento al término de su servicio.
                        </p>
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">4. CANCELACIONES, REAGENDACIONES Y REEMBOLSOS</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>
                            <strong>Aviso con al menos 2 horas de anticipación:</strong> Si el cliente no puede asistir pero notifica su cancelación o solicita reagendar con un mínimo de <strong>2 horas de anticipación</strong> a la hora pactada, el 100% de su anticipo se conservará como saldo a favor en su cuenta para ser utilizado en una nueva cita dentro de los siguientes 30 días naturales.
                        </li>
                        <li>
                            <strong>Cancelaciones tardías (menos de 2 horas):</strong> Al no permitir la reasignación oportuna del turno a otro cliente, las cancelaciones solicitadas con menos de 2 horas de anticipación causarán la pérdida del 100% del anticipo como compensación por costos operativos y tiempo reservado.
                        </li>
                        <li>
                            <strong>Inasistencia (&ldquo;No Show&rdquo;) o llegada tardía:</strong> Si el cliente no se presenta o llega después de los 10 minutos de tolerancia, el anticipo <strong>no será reembolsable ni transferible</strong>, aplicándose como penalización por el bloqueo del horario del profesional.
                        </li>
                        <li>
                            <strong>Cancelación por parte del establecimiento:</strong> En caso fortuito o de fuerza mayor donde el establecimiento deba cancelar o modificar una cita confirmada, el cliente tendrá derecho a reagendación prioritaria inmediata o al reembolso íntegro del 100% del anticipo pagado.
                        </li>
                    </ul>
                </section>

                <section className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">5. PRECIOS, FORMAS DE PAGO Y FACTURACIÓN</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                        <li>
                            <strong>Precios e IVA:</strong> Todos los precios están expresados en Pesos Mexicanos (MXN) e incluyen el Impuesto al Valor Agregado (IVA). Los precios vigentes se respetarán en todas las citas confirmadas con anterioridad a cualquier modificación de tarifa.
                        </li>
                        <li>
                            <strong>Formas de pago en sucursal:</strong> Se acepta efectivo, tarjetas de débito y crédito, transferencias bancarias y pagos digitales autorizados.
                        </li>
                        <li>
                            <strong>Facturación electrónica (CFDI):</strong> Si requiere factura fiscal, deberá solicitarla dentro del mismo mes calendario en que se realizó el pago del servicio o producto, proporcionando su Constancia de Situación Fiscal actualizada y uso de CFDI.
                        </li>
                    </ul>
                </section>

                <section className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">6. DERECHO DE ADMISIÓN, HIGIENE Y CONDUCTA</h3>
                    <p className="text-sm">
                        <strong>{companyName}</strong> mantiene un compromiso absoluto con la seguridad, respeto e higiene de todos sus clientes y colaboradores. Nos reservamos el derecho de admisión y permanencia, así como de suspender o negar el servicio ante:
                    </p>
                    <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
                        <li>Personas bajo el influjo notable de alcohol o sustancias estupefacientes.</li>
                        <li>Conductas agresivas, discriminatorias, acoso o faltas de respeto hacia el personal o hacia otros clientes.</li>
                        <li>Condiciones de salud o higiene evidentes que comprometan la seguridad sanitaria del establecimiento y sus herramientas.</li>
                    </ul>
                </section>

                <section className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">7. RESPONSABILIDAD SOBRE OBJETOS PERSONALES</h3>
                    <p className="text-sm">
                        El cuidado de pertenencias personales es responsabilidad exclusiva de cada cliente. <strong>{companyName}</strong> y su personal no se hacen responsables por extravío, daño u olvido de objetos dentro o fuera de las instalaciones, aun cuando el personal procurará colaborar en su resguardo en caso de ser localizados.
                    </p>
                </section>

                <section className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">8. PROTECCIÓN DE DATOS PERSONALES</h3>
                    <p className="text-sm">
                        Los datos de contacto, facturación e historial recabados durante su proceso de reserva o visita son tratados con estricta confidencialidad de conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares y nuestro <Link href="/privacidad" className="text-primary underline">Aviso de Privacidad</Link>.
                    </p>
                </section>

                <section className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">9. JURISDICCIÓN Y LEGISLACIÓN APLICABLE</h3>
                    <p className="text-sm">
                        Para la interpretación, validez y cumplimiento de estos términos y condiciones, las partes se someten expresamente a las leyes federales de los Estados Unidos Mexicanos y a la jurisdicción de los tribunales competentes de la ciudad de <strong>Santiago de Querétaro, Qro.</strong>, renunciando a cualquier otro fuero presente o futuro.
                    </p>
                </section>

                <p className="text-xs text-muted-foreground mt-10 pt-4 border-t text-center">
                    <strong>{companyName}</strong> &bull; Términos y Condiciones de Servicio &bull; Todos los derechos reservados.
                </p>
            </div>
        </div>
    );
}
