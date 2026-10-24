'use client';

import React from 'react';
import { LegalPageShell } from '@/components/legal/legal-page-shell';

export default function EliminarCuentaPage() {
  const companyName = 'VATOS ALFA Barber Shop';
  const companyEmail = 'contacto@vatosalfa.com';
  const companyPhone = '442 872 7279';
  const companyAddress = 'Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro, Qro.';

  return (
    <LegalPageShell
      activeTab="privacidad"
      title="Eliminación de Cuenta y Datos Personales"
      subtitle="Cumplimiento con las políticas de privacidad y eliminación de datos de Google Play Store, Apple App Store y la Ley Federal de Protección de Datos Personales (LFPDPPP)."
      badgeText="GESTIÓN DE CUENTA Y PRIVACIDAD • VATOS ALFA"
      lastUpdated="Octubre 2026"
      companyName={companyName}
      companyEmail={companyEmail}
      companyPhone={companyPhone}
      companyAddress={companyAddress}
    >
      <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
        <section className="border-l-4 border-blue-500 pl-4 py-1 bg-blue-500/5 rounded-r-xl">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
            1. Cómo eliminar tu cuenta directamente desde la App Móvil (Inmediato)
          </h2>
          <p className="mb-2">
            Puedes eliminar tu cuenta de <strong>VATOS ALFA</strong> y tus datos asociados en cualquier momento directamente desde la aplicación móvil (iOS y Android) siguiendo estos pasos:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm">
            <li>Abre la aplicación <strong>VATOS ALFA Barber Shop</strong> e inicia sesión en tu cuenta.</li>
            <li>Dirígete a la pestaña <strong>Perfil</strong> en la barra inferior de navegación.</li>
            <li>Desliza hasta el final de la pantalla y selecciona la opción <strong>Eliminar mi cuenta y datos</strong>.</li>
            <li>Confirma tu solicitud de baja definitiva. Tu sesión y credenciales de acceso serán revocadas de forma inmediata.</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-border pb-2">
            2. Cómo solicitar la eliminación de tu cuenta desde la Web (Sin abrir la App)
          </h3>
          <p>
            Si ya desinstalaste la aplicación o deseas solicitar la baja de tu cuenta y datos personales por vía web, envía un correo electrónico a <strong>{companyEmail}</strong> o un mensaje de WhatsApp al <strong>{companyPhone}</strong> indicando:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            <li>Asunto: <strong>Solicitud de Eliminación de Cuenta - VATOS ALFA</strong></li>
            <li>Nombre completo registrado y correo electrónico o número telefónico de 10 dígitos vinculado a tu cuenta.</li>
          </ul>
          <p className="text-xs sm:text-sm">
            Nuestro equipo de privacidad procesará tu baja definitiva en un plazo máximo de 72 horas hábiles y te enviará la confirmación por correo electrónico.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-border pb-2">
            3. Qué datos se eliminan y periodo de retención legal
          </h3>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            <li>
              <strong>Datos eliminados de forma inmediata:</strong> Credenciales de acceso (Firebase Authentication), fotografía de perfil, tokens de notificaciones push, vinculación con Google/Apple y acceso al programa de lealtad Pase Alfa y Alfa Coins.
            </li>
            <li>
              <strong>Datos sujetos a retención temporal preventiva (180 días):</strong> Folios de reservaciones pasadas y comprobantes de cobro o anticipos electrónicos se archivan de forma disociada durante un periodo de 6 meses (180 días) exclusivamente para efectos contables, fiscales y aclaraciones bancarias, tras lo cual son depurados definitivamente.
            </li>
          </ul>
        </section>
      </div>
    </LegalPageShell>
  );
}
