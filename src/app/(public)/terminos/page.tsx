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
            subtitle="Lineamientos claros sobre nuestra política de puntualidad, anticipos para apartado de agenda, cancelaciones y garantías de calidad en todas nuestras citas."
            badgeText="TÉRMINOS Y CONDICIONES • VIGENCIA 2026"
            lastUpdated="Octubre 2026"
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
                </div>
            )}
        </LegalPageShell>
    );
}
