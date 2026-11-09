'use client';

import React from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { CustomLoader } from '@/components/ui/custom-loader';
import { LegalPageShell, LegalTextFormatter } from '@/components/legal/legal-page-shell';

export default function TerminosPage() {
    const { data: empresaData, loading: loadingEmpresa } = useFirestoreQuery<any>('empresa');
    const { data: settingsData, loading: loadingSettings } = useFirestoreQuery<any>('settings');

    const isLoading = (loadingEmpresa || loadingSettings) && !empresaData;
    const companyName = empresaData?.[0]?.name || 'VATOS ALFA Barber Shop';
    const companyEmail = empresaData?.[0]?.email || 'contacto@vatosalfa.com';
    const companyPhone = empresaData?.[0]?.phone || '442 405 4509';
    const companyAddress = empresaData?.[0]?.address || 'Av. Sombrerete 1001, Col. Cipreses, Querétaro, Qro.';
    const websiteSettings = settingsData?.find((d: any) => d.id === 'website') || {};
    const customTermsText = websiteSettings.termsText?.trim();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070b14]">
                <CustomLoader size={36} />
            </div>
        );
    }

    return (
        <LegalPageShell
            activeTab="terminos"
            title="Términos y Condiciones de Servicio"
            subtitle="Lineamientos claros sobre nuestra política de puntualidad, anticipos para apartado de agenda, cancelaciones, programa de lealtad Pase Alfa y garantías de calidad."
            badgeText="TÉRMINOS Y CONDICIONES • VIGENCIA 2026"
            lastUpdated="Noviembre 2026"
            companyName={companyName}
            companyEmail={companyEmail}
            companyPhone={companyPhone}
            companyAddress={companyAddress}
        >
            {customTermsText ? (
                <LegalTextFormatter text={customTermsText} />
            ) : (
                <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
                    <section className="border-l-4 border-blue-500 pl-4 py-1 bg-blue-500/5 rounded-r-xl">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                            1. ACEPTACIÓN Y ALCANCE
                        </h2>
                        <p>
                            La programación de una cita, la contratación o recepción de servicios, así como la compra de productos en <strong>{companyName}</strong> (a través de nuestro sitio web, presencialmente o por mensajería), constituye la aceptación expresa de los presentes Términos y Condiciones.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-border pb-2">
                            2. POLÍTICA DE CITAS, PUNTUALIDAD Y TOLERANCIA
                        </h3>
                        <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                            <li>
                                <strong>Tolerancia máxima de 10 minutos:</strong> Con el fin de salvaguardar el tiempo de todos los clientes y la agenda del profesional, se otorga una tolerancia máxima de 10 minutos.
                            </li>
                            <li>
                                <strong>Inasistencia por retraso (No Show):</strong> Transcurridos los 10 minutos de tolerancia sin previo aviso, la cita se considerará cancelada por inasistencia.
                            </li>
                            <li>
                                <strong>Llegada anticipada:</strong> Se sugiere presentarse en la sucursal de 5 a 10 minutos antes de la hora reservada.
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-3 p-5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-800/40">
                        <h3 className="text-base font-bold text-blue-950 dark:text-blue-300">
                            3. POLÍTICA DE ANTICIPOS (DEPÓSITOS DE GARANTÍA)
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            El anticipo constituye una garantía de apartado y bloqueo exclusivo de la agenda del barbero seleccionado. El importe pagado en concepto de anticipo será acreditado y descontado automáticamente del total a pagar en caja al momento de su visita.
                        </p>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            <strong>Tolerancia de 30 minutos para confirmación de pago:</strong> Al generar una cita sujeta a anticipo, el cliente dispone de una ventana de tolerancia de <strong>treinta (30) minutos naturales</strong> para realizar y acreditar el pago a través de la pasarela autorizada. De no completarse en dicho periodo, la cita preliminar se cancelará automáticamente y el horario se liberará para otros clientes.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-border pb-2">
                            4. CANCELACIONES, REAGENDACIONES Y REEMBOLSOS
                        </h3>
                        <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                            <li>
                                <strong>Aviso con al menos 2 horas de anticipación:</strong> Notificando con un mínimo de 2 horas previas a la cita, el 100% de su anticipo se conservará como saldo a favor en su cuenta para una nueva cita.
                            </li>
                            <li>
                                <strong>Cancelaciones tardías o No Show:</strong> Las cancelaciones solicitadas con menos de 2 horas o la inasistencia causarán la pérdida del anticipo como compensación por el tiempo reservado del profesional.
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-3 p-5 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-border">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            5. PROGRAMA DE LEALTAD &ldquo;PASE ALFA CLUB&rdquo; Y REGLAS DE SELLOS
                        </h3>
                        <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                            <li>
                                <strong>Exclusivo en App Móvil Oficial:</strong> La acumulación de sellos de visita (&ldquo;La Décima va por la Casa&rdquo;) y AlfaCoins es exclusiva para clientes con cuenta activa e instalada en la aplicación móvil oficial de {companyName}. El portal web es informativo y de agendamiento.
                            </li>
                            <li>
                                <strong>Acreditación Automática al Liquidar en Caja:</strong> Los sellos y AlfaCoins no se registran por escaneo previo ni de forma manual; se acreditan únicamente de manera automática por el sistema en el instante en que recepción confirma el pago efectivo del servicio en Caja.
                            </li>
                            <li>
                                <strong>Tarifa Mínima Dinámica por Servicio Individual:</strong> Para generar un (1) sello válido, el cliente deberá liquidar con dinero real un servicio individual de barbería cuyo importe neto sea igual o superior a la tarifa regular vigente del servicio de <em>Corte de cabello</em> al momento de la visita. Servicios menores (ej. arreglo de ceja), sumas de servicios menores que individualmente no alcancen dicha tarifa, o la compra de productos de tienda no generan sellos de visita.
                            </li>
                            <li>
                                <strong>Visitas con Hijos o Acompañantes (Máximo 2 Sellos por Ticket):</strong> Cuando el titular acuda con su hijo o acompañante en la misma visita y liquide en un mismo ticket dos (2) o más servicios individuales que cumplan cada uno con la tarifa mínima vigente de corte de cabello, el sistema acreditará hasta un máximo de dos (2) sellos en esa operación. Si solo uno de los servicios cumple la tarifa mínima (ej. corte de cabello + arreglo de ceja), se acreditará únicamente un (1) sello; si ninguno la alcanza individualmente, no se generarán sellos.
                            </li>
                            <li>
                                <strong>Una Acreditación por Día Hábil Operativo:</strong> Cada cuenta podrá recibir una (1) sola acreditación de sellos por jornada hábil operativa de la barbería (de apertura a cierre del establecimiento). Nuevas acreditaciones de sellos estarán disponibles a partir del siguiente día hábil operativo.
                            </li>
                            <li>
                                <strong>Regalo de Cumpleaños (Antigüedad Mínima de 5 Visitas Válidas):</strong> Para desbloquear y canjear el beneficio de Regalo de Cumpleaños durante el mes calendario de nacimiento registrado en su perfil, el titular deberá contar con al menos cinco (5) visitas válidas previas pagadas cuyo consumo individual en servicio haya sido igual o superior a la tarifa regular vigente del <em>Corte de cabello</em> al momento de cada visita (excluyendo servicios menores como arreglo de ceja o compras de puros productos). Se otorga un máximo de un (1) regalo por cliente por año calendario mediante escaneo de código QR oficial en recepción, no siendo retroactivo para clientes recién registrados ni transferible a meses posteriores.
                            </li>
                        </ul>
                    </section>
                </div>
            )}
        </LegalPageShell>
    );
}
