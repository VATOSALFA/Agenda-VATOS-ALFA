'use client';

import React from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { CustomLoader } from '@/components/ui/custom-loader';
import { LegalPageShell, LegalTextFormatter } from '@/components/legal/legal-page-shell';

export default function PrivacidadPage() {
    const { data: empresaData, loading: loadingEmpresa } = useFirestoreQuery<any>('empresa');
    const { data: settingsData, loading: loadingSettings } = useFirestoreQuery<any>('settings');

    const isLoading = (loadingEmpresa || loadingSettings) && !empresaData;
    const companyName = empresaData?.[0]?.name || 'VATOS ALFA Barber Shop';
    const companyEmail = empresaData?.[0]?.email || 'vatosalfa.adm@gmail.com';
    const companyPhone = empresaData?.[0]?.phone || '442 405 4509';
    const companyAddress = empresaData?.[0]?.address || 'Av. Sombrerete 1001, Col. Cipreses, Querétaro, Qro.';
    const websiteSettings = settingsData?.find((d: any) => d.id === 'website') || {};
    const customPrivacyText = websiteSettings.privacyText?.trim();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070b14]">
                <CustomLoader size={36} />
            </div>
        );
    }

    return (
        <LegalPageShell
            activeTab="privacidad"
            title="Aviso de Privacidad Integral"
            subtitle="En cumplimiento con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y los lineamientos del INAI, garantizamos la máxima confidencialidad, seguridad y resguardo ético de tu información personal."
            badgeText="PROTECCIÓN DE DATOS PERSONALES • MÉXICO"
            lastUpdated="Octubre 2026"
            companyName={companyName}
            companyEmail={companyEmail}
            companyPhone={companyPhone}
            companyAddress={companyAddress}
        >
            {customPrivacyText ? (
                <LegalTextFormatter text={customPrivacyText} />
            ) : (
                <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
                    <section className="border-l-4 border-blue-500 pl-4 py-1 bg-blue-500/5 rounded-r-xl">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                            CAPÍTULO I. IDENTIDAD Y DOMICILIO DEL RESPONSABLE
                        </h2>
                        <p>
                            <strong>{companyName}</strong>, con domicilio en {companyAddress}, es el responsable del uso, tratamiento, confidencialidad y debida protección de sus datos personales.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-border pb-2">
                            CAPÍTULO II. DATOS RECABADOS Y FINALIDADES
                        </h3>
                        <p>
                            Para la prestación de nuestros servicios de barbería profesional, rituales masculinos y reservaciones en línea, recabamos los siguientes datos de contacto:
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                            <li>Nombre y apellidos</li>
                            <li>Número de teléfono móvil (para recordatorios de cita vía WhatsApp/SMS)</li>
                            <li>Dirección de correo electrónico</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-border pb-2">
                            CAPÍTULO III. TRANSFERENCIA Y SEGURIDAD DE DATOS
                        </h3>
                        <p>
                            Sus datos personales son tratados con absoluta reserva y únicamente son procesados con proveedores tecnológicos de alta seguridad para la gestión de su agenda y procesamiento seguro de anticipos. <strong>VATOS ALFA bajo ninguna circunstancia vende, transfiere ni comercializa sus datos a terceros con fines publicitarios.</strong>
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-border pb-2">
                            CAPÍTULO IV. DERECHOS ARCO
                        </h3>
                        <p>
                            Usted tiene derecho a conocer qué datos personales tenemos de usted, para qué los utilizamos y las condiciones del uso que les damos (Acceso). Asimismo, es su derecho solicitar la corrección de su información (Rectificación), su eliminación de nuestros registros (Cancelación), u oponerse al uso de los mismos para fines específicos (Oposición). Para ejercer cualquiera de sus derechos ARCO, puede enviar su solicitud a <strong>{companyEmail}</strong>.
                        </p>
                    </section>
                </div>
            )}
        </LegalPageShell>
    );
}
