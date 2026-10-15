'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  CreditCard,
  UserX,
  FileText,
  Calendar,
  Sparkles,
  RefreshCw,
  X,
  BookOpen,
  Bell,
} from 'lucide-react';
import { db } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_BOOKING_RULES, DEFAULT_AVISOS_AGENDA_RULES, ReglasReservasConfig } from '@/lib/booking-rules';

interface BookingRulesCheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookingRulesCheatSheetModal({ isOpen, onClose }: BookingRulesCheatSheetModalProps) {
  const [rules, setRules] = useState<ReglasReservasConfig>(DEFAULT_BOOKING_RULES);

  useEffect(() => {
    if (!db || !isOpen) return;

    getDoc(doc(db, 'configuracion', 'reglas_reservas'))
      .then((snap) => {
        if (snap.exists()) {
          setRules({
            ...DEFAULT_BOOKING_RULES,
            ...snap.data(),
          });
        }
      })
      .catch((err) => {
        console.error('Error cargando reglas de reserva para guía:', err);
      });
  }, [isOpen]);

  const avisosList = rules.reglas_avisos_agenda && rules.reglas_avisos_agenda.length > 0
    ? rules.reglas_avisos_agenda
    : DEFAULT_AVISOS_AGENDA_RULES;

  const whatsappRule = avisosList.find(r => r.tipo === 'recordatorio_whatsapp' || r.id === 'aviso_recordatorio_whatsapp');
  const atrasadaRule = avisosList.find(r => r.tipo === 'cita_atrasada_asistencia' || r.id === 'aviso_cita_atrasada');
  const otrasReglasAvisos = avisosList.filter(
    r => r.id !== 'aviso_recordatorio_whatsapp' &&
         r.id !== 'aviso_cita_atrasada' &&
         r.tipo !== 'recordatorio_whatsapp' &&
         r.tipo !== 'cita_atrasada_asistencia'
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideCloseButton={true}
        className="max-w-2xl bg-background p-0 rounded-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden border-2 border-blue-500"
      >
        {/* Cabecera sobria VATOS ALFA */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-[#2d3a60]/60 relative overflow-hidden">
          {/* Haz de luz animado sutil */}
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Reglas de Reserva • Guía Rápida
                  </DialogTitle>
                  <Badge variant="outline" className="bg-white/10 text-slate-200 border-white/20 text-[10px] py-0 px-2 font-mono">
                    Recepción
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-slate-300 font-normal mt-0.5">
                  Criterios oficiales vigentes para resolver dudas con clientes en caja o teléfono.
                </DialogDescription>
              </div>
            </div>

            {/* Botón Cerrar (X) minimalista */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white transition-colors"
              title="Cerrar guía"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Contenido con Scroll */}
        <ScrollArea className="flex-1 p-5 overflow-y-auto max-h-[calc(88vh-130px)]">
          <div className="space-y-4 text-xs">
            {/* 1. Puntualidad y Tolerancia */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-500" />
                  1. Tolerancia y Puntualidad
                </span>
                <Badge variant="secondary" className="font-bold text-[11px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                  {rules.tolerancia_puntualidad_minutos || 10} min máx.
                </Badge>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Tolerancia máxima estricta:</strong> Se otorgan {rules.tolerancia_puntualidad_minutos || 10} minutos de cortesía a partir de la hora de la cita.
                </li>
                <li>
                  <strong className="text-foreground">Llegada con retraso (5 a 10 min):</strong> El barbero evalúa si puede dar el servicio completo o adaptarlo al tiempo restante para no retrasar la siguiente cita. Se cobra la tarifa completa.
                </li>
                <li>
                  <strong className="text-foreground">Más de {rules.tolerancia_puntualidad_minutos || 10} minutos sin aviso:</strong> Se considera inasistencia (<em>No-Show</em>). La cita se cancela en agenda y el barbero queda libre para atender a otro cliente.
                </li>
              </ul>
            </div>

            {/* 2. Anticipos Obligatorios */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  2. Política de Anticipos (Depósitos en Garantía)
                </span>
                <Badge variant="secondary" className="font-bold text-[11px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                  {rules.anticipo_porcentaje_defecto || 50}% a partir de ${rules.anticipo_monto_minimo || 190} MXN
                </Badge>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Horario de apertura ({rules.anticipo_horario_apertura_hora || '10:00'} AM):</strong> Todas las citas agendadas a las <span className="font-bold text-foreground">{rules.anticipo_horario_apertura_hora || '10:00'} AM</span> (primer turno del día) requieren obligatoriamente el <span className="font-bold text-foreground">{rules.anticipo_horario_apertura_porcentaje || 50}% de anticipo</span> sin importar el servicio o canal (Página Web, App Móvil o Agenda).
                </li>
                <li>
                  <strong className="text-foreground">Umbral de cobro:</strong> Si la suma de servicios reservados es igual o mayor a <span className="font-bold text-foreground">${rules.anticipo_monto_minimo || 190} MXN</span>, o son servicios especiales de 60+ min, se exige el {rules.anticipo_porcentaje_defecto || 50}% de anticipo para confirmar.
                </li>
                <li>
                  <strong className="text-foreground">Acreditación en caja:</strong> Todo anticipo se descuenta de forma automática al momento de liquidar la cuenta final al terminar el servicio.
                </li>
                <li>
                  <strong className="text-foreground">Seguridad bancaria:</strong> Los anticipos en línea se cobran vía Mercado Pago bajo protocolo de cifrado seguro.
                </li>
              </ul>
            </div>

            {/* 3. Escudo Antifraude por Inasistencias */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <UserX className="w-4 h-4 text-red-500" />
                  3. Escudo Antifraude (Clientes Reincidentes)
                </span>
                <Badge variant="secondary" className="font-bold text-[11px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                  {rules.max_inasistencias_permitidas || 2} faltas = Anticipo Obligatorio
                </Badge>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Si un cliente acumula <strong className="text-foreground">{rules.max_inasistencias_permitidas || 2} o más inasistencias (No-Shows)</strong> o cancelaciones no notificadas, el sistema le exigirá automáticamente un <strong className="text-foreground">anticipo obligatorio del {rules.penalizacion_anticipo_porcentaje || 50}%</strong> para cualquier cita futura, sin importar el monto o servicio solicitado, protegiendo las ganancias del barbero.
              </p>
            </div>

            {/* 4. Cancelaciones y Reagendaciones */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-blue-500" />
                  4. Cancelaciones, Reagendaciones y Saldo a Favor
                </span>
                <Badge variant="secondary" className="font-bold text-[11px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                  Mínimo {rules.cancelacion_tiempo_minimo_horas || 2}h antes
                </Badge>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Con más de {rules.cancelacion_tiempo_minimo_horas || 2} horas de anticipación:</strong> El 100% del anticipo pagado se resguarda como <strong className="text-foreground">saldo a favor</strong> para ser usado en una nueva cita dentro de los siguientes <strong className="text-foreground">{rules.cancelacion_saldo_favor_vigencia_dias || 30} días naturales</strong>.
                </li>
                <li>
                  <strong className="text-foreground">Con menos de {rules.cancelacion_tiempo_minimo_horas || 2} horas o inasistencia:</strong> Se retiene el 100% del anticipo como compensación por costos operativos y bloqueo de agenda del profesional.
                </li>
                <li>
                  <strong className="text-foreground">Cero reembolsos en efectivo:</strong> Los anticipos cancelados oportunamente se acreditan únicamente como saldo a favor en sucursal, no procediendo devoluciones en efectivo ni transferencias.
                </li>
              </ul>
            </div>

            {/* 5. Reglas de Avisos de Recepción y Recordatorios */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-blue-400" />
                  5. Reglas de Avisos de Agenda (Campana de Recepción)
                </span>
                <Badge variant="secondary" className="font-bold text-[11px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                  Sistema de Alertas
                </Badge>
              </div>
              <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Citas agendadas en línea (Web / App):</strong> Cada vez que un cliente reserva desde el sitio web público o la aplicación móvil, el sistema notifica de inmediato al centro de la pantalla para que recepción envíe la confirmación oficial por WhatsApp y verifique su cita con un clic.
                </li>
                <li>
                  <strong className="text-foreground">Recordatorios de WhatsApp:</strong> La campana de avisos notifica cuando faltan <span className="font-semibold text-foreground">{Math.round((whatsappRule?.tiempo_anticipacion_minutos || 120) / 60)} horas</span> antes de la cita para enviar el recordatorio preventivo al cliente con un clic. A los <span className="font-semibold text-foreground">{whatsappRule?.tiempo_urgente_minutos || 60} minutos</span> antes, la alerta se resalta como prioritaria.
                </li>
                <li>
                  <strong className="text-foreground">Citas de último momento (sin recordatorio):</strong> Si una cita se crea con <span className="font-semibold text-foreground">{whatsappRule?.omitir_si_creada_en_minutos || 45} minutos o menos</span> de anticipación (ej. reservó por llamada telefónica para venir de inmediato), el sistema <span className="font-semibold text-foreground">omite el recordatorio automáticamente</span> para no duplicar la confirmación verbal.
                </li>
                <li>
                  <strong className="text-foreground">Citas atrasadas sin asistencia registrada:</strong> Si una cita inició hace más de <span className="font-semibold text-foreground">{atrasadaRule?.tolerancia_retraso_minutos || rules.tolerancia_puntualidad_minutos || 10} minutos</span> de cortesía y aún no se ha marcado si el cliente asistió o faltó, aparece en la campana en color rojo para que recepción la resuelva y mantenga la agenda al día.
                </li>
                {otrasReglasAvisos.map(aviso => (
                  <li key={aviso.id}>
                    <strong className="text-foreground">{aviso.nombre}:</strong> {aviso.descripcion || 'Regla activa en la campana de avisos.'}
                  </li>
                ))}
              </ul>
            </div>

            {/* 6. Ventanas de Tiempo y Agendamiento en Línea */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  6. Ventanas de Agendamiento en Línea
                </span>
                <Badge variant="secondary" className="font-bold text-[11px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                  Web / App
                </Badge>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed">
                <li>
                  <strong className="text-foreground">Anticipación mínima para reservar online:</strong> {rules.tiempo_minimo_anticipacion_minutos || 30} minutos antes del horario disponible.
                </li>
                <li>
                  <strong className="text-foreground">Ventana máxima a futuro:</strong> Los clientes pueden agendar hasta con {rules.dias_maximos_futuro || 14} días naturales de anticipación.
                </li>
                <li>
                  <strong className="text-foreground">Intervalos de cita:</strong> Bloques de agenda sincronizados cada {rules.intervalo_horarios_minutos || 30} minutos.
                </li>
              </ul>
            </div>

            {/* Reglas Personalizadas si existen */}
            {rules.reglas_personalizadas && rules.reglas_personalizadas.length > 0 && (
              <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5">
                <span className="font-bold text-sm text-primary flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Reglas Especiales Adicionales Activas ({rules.reglas_personalizadas.length})
                </span>
                <div className="space-y-2">
                  {rules.reglas_personalizadas.map((r) => (
                    <div key={r.id} className="text-xs bg-background/80 p-2.5 rounded-lg border border-border">
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span>{r.nombre}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.consecuencia?.tipo === 'exigir_anticipo'
                            ? `Anticipo ${r.consecuencia.valor_anticipo}${r.consecuencia.tipo_anticipo === 'porcentaje' ? '%' : '$'}`
                            : r.consecuencia?.tipo === 'bloquear_online'
                            ? 'Bloqueo Online'
                            : 'Aviso'}
                        </Badge>
                      </div>
                      {r.descripcion && <p className="text-muted-foreground mt-0.5">{r.descripcion}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer solo con botón Cerrar Guía */}
        <div className="p-3.5 bg-muted/30 border-t border-border flex items-center justify-end text-xs">
          <Button
            type="button"
            variant="alfa"
            onClick={onClose}
            className="rounded-xl px-5 text-xs h-9"
          >
            Cerrar Guía
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
