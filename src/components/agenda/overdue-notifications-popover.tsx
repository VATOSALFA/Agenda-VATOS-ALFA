'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Clock,
  User,
  XCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import type { Reservation, Profesional, Client } from '@/lib/types';
import { formatClientName } from './agenda-utils';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_AVISOS_AGENDA_RULES,
  ReglasReservasConfig,
  isShortNoticeAppointment,
} from '@/lib/booking-rules';

// Icono limpio de WhatsApp sin contenedor de fondo
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
  </svg>
);

interface OverdueNotificationsPopoverProps {
  reservations: Reservation[];
  professionals: Profesional[];
  clients: Client[];
  onUpdateStatus: (reservationId: string, status: string) => void;
  onSelectReservation: (reservation: any) => void;
}

export function OverdueNotificationsPopover({
  reservations,
  professionals,
  clients,
  onUpdateStatus,
  onSelectReservation,
}: OverdueNotificationsPopoverProps) {
  const { user } = useAuth();
  const isStaff = Boolean(
    user?.role &&
      (user.role.toLowerCase().includes('staff') || user.role.toLowerCase().includes('barbero'))
  );

  const [nowMinutes, setNowMinutes] = useState<number>(0);
  const [todayStr, setTodayStr] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'whatsapp' | 'overdue'>('all');

  // Reglas de reserva cargadas en tiempo real desde Firestore
  const [rules, setRules] = useState<ReglasReservasConfig>(DEFAULT_BOOKING_RULES);
  const [whatsappTemplate, setWhatsappTemplate] = useState<string>(
    '¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_'
  );

  // Escuchar configuración de reglas de reserva y plantilla WhatsApp
  useEffect(() => {
    if (!db || isStaff) return;

    const unsubRules = onSnapshot(
      doc(db, 'configuracion', 'reglas_reservas'),
      (snap) => {
        if (snap.exists()) {
          setRules({
            ...DEFAULT_BOOKING_RULES,
            ...snap.data(),
          });
        }
      },
      (err) => {
        console.error('Error escuchando reglas_reservas:', err);
      }
    );

    const unsubWhatsapp = onSnapshot(
      doc(db, 'configuracion', 'whatsapp'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (d.whatsappReminderTemplate) {
            setWhatsappTemplate(d.whatsappReminderTemplate);
          }
        }
      },
      (err) => {
        console.error('Error escuchando configuracion whatsapp:', err);
      }
    );

    return () => {
      unsubRules();
      unsubWhatsapp();
    };
  }, [isStaff]);

  // Actualizar hora en tiempo real con zona horaria de México
  useEffect(() => {
    if (isStaff) return;

    const updateCurrentTime = () => {
      const timeZone = 'America/Mexico_City';
      const nowRaw = new Date();

      const mxDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(nowRaw);

      const mxTimeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(nowRaw);

      const h = parseInt(mxTimeParts.find((p) => p.type === 'hour')?.value || '0', 10);
      const m = parseInt(mxTimeParts.find((p) => p.type === 'minute')?.value || '0', 10);

      setTodayStr(mxDateStr);
      setNowMinutes(h * 60 + m);
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 20000); // Chequeo cada 20s
    return () => clearInterval(interval);
  }, [isStaff]);

  // Desglosar reglas aplicables
  const avisosList =
    rules.reglas_avisos_agenda && rules.reglas_avisos_agenda.length > 0
      ? rules.reglas_avisos_agenda
      : DEFAULT_AVISOS_AGENDA_RULES;

  const whatsappRule = avisosList.find(
    (r) => r.tipo === 'recordatorio_whatsapp' || r.id === 'aviso_recordatorio_whatsapp'
  );
  const atrasadaRule = avisosList.find(
    (r) => r.tipo === 'cita_atrasada_asistencia' || r.id === 'aviso_cita_atrasada'
  );

  const isWhatsappActive = whatsappRule ? whatsappRule.activa !== false : true;
  const anticipacionMinutos = Number(whatsappRule?.tiempo_anticipacion_minutos) || 120;
  const urgenteMinutos = Number(whatsappRule?.tiempo_urgente_minutos) || 60;
  const omitirCreacionMinutos = Number(whatsappRule?.omitir_si_creada_en_minutos) || 45;

  const isAtrasadaActive = atrasadaRule ? atrasadaRule.activa !== false : true;
  const toleranciaAtrasadaMinutos = Number(atrasadaRule?.tolerancia_retraso_minutos) || 10;

  // 1. Citas que requieren Recordatorio Preventivo por WhatsApp (2h / 1h antes)
  const whatsappReminderReservations = useMemo(() => {
    if (isStaff || !todayStr || !reservations || reservations.length === 0 || !isWhatsappActive) {
      return [];
    }

    return reservations.filter((res) => {
      // Debe ser cita de hoy
      if (res.fecha !== todayStr) return false;

      // No recordar si ya se envió el recordatorio
      if (res.whatsappReminderSent) return false;

      // No recordar si la cita está cancelada o no asistió
      if (
        res.estado === 'Cancelado' ||
        res.estado === 'No asiste' ||
        res.estado === 'Completado' ||
        res.estado === 'Venta completada'
      ) {
        return false;
      }

      // Omitir si se agendó con poca anticipación (ej. <= 45 min)
      if (isShortNoticeAppointment(res, omitirCreacionMinutos)) return false;

      // Calcular hora de inicio en minutos
      if (!res.hora_inicio || typeof res.hora_inicio !== 'string') return false;
      const parts = res.hora_inicio.split(':');
      if (parts.length < 2) return false;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return false;

      const startMin = h * 60 + m;
      const minsUntilStart = startMin - nowMinutes;

      // Debe faltar <= anticipacionMinutos (ej. 120 min) y que no haya pasado de la hora de inicio hace más de 10 min
      return minsUntilStart <= anticipacionMinutos && minsUntilStart >= -10;
    });
  }, [
    isStaff,
    todayStr,
    reservations,
    isWhatsappActive,
    anticipacionMinutos,
    omitirCreacionMinutos,
    nowMinutes,
  ]);

  // 2. Citas atrasadas sin registrar asistencia (> 10 min de cortesía)
  const overdueReservations = useMemo(() => {
    if (isStaff || !todayStr || !reservations || reservations.length === 0 || !isAtrasadaActive) {
      return [];
    }

    const taggedStatuses = [
      'Confirmado',
      'Asiste',
      'En espera',
      'Completado',
      'Venta completada',
      'No asiste',
      'Cancelado',
    ];

    return reservations.filter((res) => {
      if (res.fecha !== todayStr) return false;
      if (res.estado && taggedStatuses.includes(res.estado)) return false;

      if (!res.hora_inicio || typeof res.hora_inicio !== 'string') return false;
      const parts = res.hora_inicio.split(':');
      if (parts.length < 2) return false;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return false;

      const startMin = h * 60 + m;
      return nowMinutes >= startMin + toleranciaAtrasadaMinutos;
    });
  }, [isStaff, reservations, todayStr, nowMinutes, isAtrasadaActive, toleranciaAtrasadaMinutos]);

  const totalCount = whatsappReminderReservations.length + overdueReservations.length;

  // Autoexpandir si llega un nuevo aviso mientras está minimizado
  const prevCountRef = useRef(totalCount);
  useEffect(() => {
    if (isStaff) return;
    if (totalCount > prevCountRef.current && totalCount > 0) {
      setIsMinimized(false);
    }
    prevCountRef.current = totalCount;
  }, [totalCount, isStaff]);

  // Acción directa: Enviar recordatorio por WhatsApp y marcar como enviado
  const handleSendReminderWhatsApp = async (res: Reservation, e: React.MouseEvent) => {
    e.stopPropagation();
    const client = clients.find((c) => c.id === res.cliente_id) || res.customer;
    const phoneRaw = client?.telefono || (res as any).telefono || '';
    const phone = phoneRaw.replace(/\D/g, '');
    const formattedPhone = phone.length === 10 ? '52' + phone : phone;

    const prof = professionals.find(
      (p) => p.id === res.barbero_id || res.items?.some((i) => i.barbero_id === p.id)
    );
    const profName = prof ? prof.publicName || prof.name : 'tu barbero';

    let servicesText = '';
    if (res.items && res.items.length > 0) {
      servicesText = res.items.map((i) => i.nombre || i.servicio).join(', ');
    } else {
      servicesText = (res as any).servicio || 'Servicio';
    }

    const clientName = formatClientName(client?.nombre, client?.apellido);
    const locationStr = 'Suc. Sombrerete';

    const message = whatsappTemplate
      .replace(/{nombre}/g, clientName)
      .replace(/{servicios}/g, servicesText)
      .replace(/{fecha}/g, res.fecha)
      .replace(/{hora}/g, res.hora_inicio || '')
      .replace(/{profesional}/g, profName)
      .replace(/{ubicacion}/g, locationStr);

    if (formattedPhone) {
      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }

    try {
      if (db) {
        await updateDoc(doc(db, 'reservas', res.id), {
          whatsappReminderSent: true,
        });
      }
    } catch (err) {
      console.error('Error al actualizar whatsappReminderSent:', err);
    }
  };

  if (isStaff) {
    return null;
  }

  // Filtrado según la pestaña seleccionada
  const filteredReminders =
    activeTab === 'all' || activeTab === 'whatsapp' ? whatsappReminderReservations : [];
  const filteredOverdues =
    activeTab === 'all' || activeTab === 'overdue' ? overdueReservations : [];

  return (
    <>
      {/* 1. Botón de Campanita en la Barra Superior */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Avisos operativos de agenda"
          >
            <Bell className={cn('h-4 w-4', totalCount > 0 && 'text-blue-500')} />

            {totalCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[9px] font-bold rounded-full h-3.5 min-w-[14px] px-0.5 flex items-center justify-center shadow-xs animate-pulse">
                {totalCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-84 sm:w-96 p-0 shadow-2xl border-2 border-blue-500 rounded-xl bg-background overflow-hidden"
          align="end"
        >
          {/* Cabecera Oficial */}
          <div className="p-3.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-400" />
              <h4 className="font-bold text-sm text-white">Avisos de Agenda ({totalCount})</h4>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-bold',
                totalCount > 0
                  ? 'bg-blue-500/20 text-blue-300 border-blue-400/40'
                  : 'bg-white/10 text-slate-300 border-white/20'
              )}
            >
              {totalCount > 0 ? 'Acción Requerida' : 'Al día'}
            </Badge>
          </div>

          {/* Selector de Pestañas si hay diferentes avisos */}
          {totalCount > 0 && (
            <div className="flex items-center border-b border-border/60 bg-muted/20 px-2 py-1.5 gap-1 text-xs">
              <button
                onClick={() => setActiveTab('all')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-semibold transition-colors',
                  activeTab === 'all'
                    ? 'bg-[#202A49] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Todos ({totalCount})
              </button>

              {whatsappReminderReservations.length > 0 && (
                <button
                  onClick={() => setActiveTab('whatsapp')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1',
                    activeTab === 'whatsapp'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <WhatsAppIcon className="w-3 h-3" />
                  Recordatorios ({whatsappReminderReservations.length})
                </button>
              )}

              {overdueReservations.length > 0 && (
                <button
                  onClick={() => setActiveTab('overdue')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1',
                    activeTab === 'overdue'
                      ? 'bg-red-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <AlertCircle className="w-3 h-3" />
                  Por Etiquetar ({overdueReservations.length})
                </button>
              )}
            </div>
          )}

          {/* Lista de Avisos */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60">
            {totalCount === 0 ? (
              <div className="p-6 text-center text-muted-foreground space-y-2">
                <CheckCircle2 className="h-8 w-8 text-blue-500 mx-auto opacity-80" />
                <p className="text-xs font-semibold text-foreground">¡Todo al día en la agenda!</p>
                <p className="text-[11px] text-muted-foreground">
                  No hay recordatorios pendientes ni citas retrasadas sin registrar.
                </p>
              </div>
            ) : (
              <>
                {/* 1. SECCIÓN RECORDATORIOS WHATSAPP */}
                {filteredReminders.map((res) => {
                  const [h, m] = res.hora_inicio.split(':').map(Number);
                  const startMin = h * 60 + m;
                  const minsUntil = startMin - nowMinutes;
                  const isUrgent = minsUntil <= urgenteMinutos;

                  const prof = professionals.find(
                    (p) => p.id === res.barbero_id || res.items?.some((i) => i.barbero_id === p.id)
                  );
                  const client = clients.find((c) => c.id === res.cliente_id) || res.customer;

                  return (
                    <div
                      key={`rem_${res.id}`}
                      className="p-3 hover:bg-muted/40 transition-colors flex flex-col gap-2 group cursor-pointer"
                      onClick={() => {
                        onSelectReservation(res);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5 truncate">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">
                              {formatClientName(client?.nombre, client?.apellido)}
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-foreground">
                              {res.hora_inicio} - {res.hora_fin}
                            </span>
                            {prof && (
                              <span className="ml-1 text-[10px] text-muted-foreground truncate">
                                ({prof.publicName || prof.name})
                              </span>
                            )}
                          </p>
                        </div>

                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-bold shrink-0',
                            isUrgent
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          )}
                        >
                          {isUrgent
                            ? `URGENTE • en ${Math.max(0, minsUntil)}m`
                            : `Recordatorio • en ${minsUntil}m`}
                        </Badge>
                      </div>

                      {/* Botón de Acción Directa WhatsApp */}
                      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-300 border-blue-300/50 font-bold gap-1 rounded-lg"
                          onClick={(e) => handleSendReminderWhatsApp(res, e)}
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 text-blue-600" />
                          Enviar WhatsApp
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {/* 2. SECCIÓN CITAS ATRASADAS POR ETIQUETAR */}
                {filteredOverdues.map((res) => {
                  const [h, m] = res.hora_inicio.split(':').map(Number);
                  const startMin = h * 60 + m;
                  const overdueMins = Math.max(0, nowMinutes - startMin);

                  const prof = professionals.find(
                    (p) => p.id === res.barbero_id || res.items?.some((i) => i.barbero_id === p.id)
                  );
                  const client = clients.find((c) => c.id === res.cliente_id) || res.customer;

                  return (
                    <div
                      key={`over_${res.id}`}
                      className="p-3 hover:bg-muted/40 transition-colors flex flex-col gap-2 group cursor-pointer"
                      onClick={() => {
                        onSelectReservation(res);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5 truncate">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">
                              {formatClientName(client?.nombre, client?.apellido)}
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-foreground">
                              {res.hora_inicio} - {res.hora_fin}
                            </span>
                            {prof && (
                              <span className="ml-1 text-[10px] text-muted-foreground truncate">
                                ({prof.publicName || prof.name})
                              </span>
                            )}
                          </p>
                        </div>

                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] font-bold shrink-0"
                        >
                          +{overdueMins} min tarde
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-border/60 font-semibold rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateStatus(res.id, 'No asiste');
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1 text-slate-500" />
                          No Asistió
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30 font-semibold rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateStatus(res.id, 'Confirmado');
                          }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-blue-500" />
                          Confirmar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 2. Ventanita Flotante Persistente en la Esquina Inferior Derecha */}
      {totalCount > 0 &&
        (isMinimized ? (
          /* Estado Minimizado */
          <div
            onClick={() => setIsMinimized(false)}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-[#10172b] hover:bg-[#1a233a] text-white rounded-full shadow-[0_12px_35px_rgba(16,23,43,0.5)] border-2 border-blue-500 cursor-pointer transition-all animate-in slide-in-from-bottom-5 duration-300 group hover:scale-[1.03] active:scale-[0.98]"
            title="Click para ver avisos operativos de agenda"
          >
            <div className="relative flex items-center justify-center">
              <Bell className="w-4 h-4 text-blue-400 animate-bounce" />
              <span className="absolute -top-2 -right-2.5 bg-red-600 text-white text-[10px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow-md animate-pulse">
                {totalCount}
              </span>
            </div>
            <span className="text-xs font-bold tracking-wide">
              {totalCount === 1 ? '1 aviso pendiente' : `${totalCount} avisos pendientes`}
            </span>
            <ChevronUp className="w-4 h-4 text-blue-300 group-hover:-translate-y-0.5 transition-transform ml-1" />
          </div>
        ) : (
          /* Estado Expandido */
          <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-background/95 dark:bg-slate-900/95 rounded-2xl shadow-[0_18px_50px_rgba(16,23,43,0.45)] border-2 border-blue-500 backdrop-blur-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
            {/* Cabecera Oficial */}
            <div className="p-3 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-blue-500/30">
              <div className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-blue-400 animate-bounce" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-xs sm:text-sm text-white tracking-wide">
                      Avisos de Agenda
                    </h4>
                    <span className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-sm animate-pulse">
                      {totalCount}
                    </span>
                  </div>
                  <p className="text-[10px] text-blue-200/80 font-medium">
                    {whatsappReminderReservations.length > 0 && overdueReservations.length > 0
                      ? `${whatsappReminderReservations.length} WhatsApp • ${overdueReservations.length} Por etiquetar`
                      : whatsappReminderReservations.length > 0
                      ? 'Recordatorios de WhatsApp pendientes'
                      : 'Citas por etiquetar'}
                  </p>
                </div>
              </div>

              {/* Botón Minimizar */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(true)}
                className="h-7 px-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors gap-1 text-[11px] font-semibold"
                title="Minimizar ventanita de aviso"
              >
                <ChevronDown className="w-4 h-4" />
                <span>Minimizar</span>
              </Button>
            </div>

            {/* Contenido de la Ventanita Flotante */}
            <div className="max-h-[300px] overflow-y-auto divide-y divide-border/60 p-2.5 space-y-2">
              {/* Recordatorios WhatsApp */}
              {whatsappReminderReservations.map((res) => {
                const [h, m] = res.hora_inicio.split(':').map(Number);
                const startMin = h * 60 + m;
                const minsUntil = startMin - nowMinutes;
                const isUrgent = minsUntil <= urgenteMinutos;

                const prof = professionals.find(
                  (p) => p.id === res.barbero_id || res.items?.some((i) => i.barbero_id === p.id)
                );
                const client = clients.find((c) => c.id === res.cliente_id) || res.customer;

                return (
                  <div
                    key={`float_rem_${res.id}`}
                    className="p-3 bg-card dark:bg-slate-950/60 rounded-xl border border-border/80 hover:border-blue-500/50 shadow-xs flex flex-col gap-2 transition-all cursor-pointer group"
                    onClick={() => onSelectReservation(res)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs sm:text-sm text-foreground group-hover:text-blue-500 transition-colors flex items-center gap-1.5 truncate">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {formatClientName(client?.nombre, client?.apellido)}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-foreground">
                            {res.hora_inicio} - {res.hora_fin}
                          </span>
                          {prof && (
                            <span className="ml-1 text-[10px] text-muted-foreground truncate">
                              ({prof.publicName || prof.name})
                            </span>
                          )}
                        </p>
                      </div>

                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-bold shrink-0',
                          isUrgent
                            ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                        )}
                      >
                        {isUrgent
                          ? `URGENTE • en ${Math.max(0, minsUntil)}m`
                          : `Recordatorio • en ${minsUntil}m`}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-300 border-blue-300/50 font-bold gap-1 rounded-lg"
                        onClick={(e) => handleSendReminderWhatsApp(res, e)}
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 text-blue-600" />
                        Enviar WhatsApp
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Citas Atrasadas */}
              {overdueReservations.map((res) => {
                const [h, m] = res.hora_inicio.split(':').map(Number);
                const startMin = h * 60 + m;
                const overdueMins = Math.max(0, nowMinutes - startMin);

                const prof = professionals.find(
                  (p) => p.id === res.barbero_id || res.items?.some((i) => i.barbero_id === p.id)
                );
                const client = clients.find((c) => c.id === res.cliente_id) || res.customer;

                return (
                  <div
                    key={`float_over_${res.id}`}
                    className="p-3 bg-card dark:bg-slate-950/60 rounded-xl border border-border/80 hover:border-blue-500/50 shadow-xs flex flex-col gap-2 transition-all cursor-pointer group"
                    onClick={() => onSelectReservation(res)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs sm:text-sm text-foreground group-hover:text-blue-500 transition-colors flex items-center gap-1.5 truncate">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {formatClientName(client?.nombre, client?.apellido)}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-foreground">
                            {res.hora_inicio} - {res.hora_fin}
                          </span>
                          {prof && (
                            <span className="ml-1 text-[10px] text-muted-foreground truncate">
                              ({prof.publicName || prof.name})
                            </span>
                          )}
                        </p>
                      </div>

                      <Badge
                        variant="outline"
                        className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] font-bold shrink-0"
                      >
                        +{overdueMins} min tarde
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-border/60 font-semibold rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'No asiste');
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1 text-slate-500" />
                        No Asistió
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30 font-semibold rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'Confirmado');
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-blue-500" />
                        Confirmar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pie informativo */}
            <div className="px-3 py-2 bg-muted/40 border-t border-border/60 text-[10px] text-muted-foreground flex items-center justify-between">
              <span>💡 Resuelve los avisos enviando recordatorio o etiquetando</span>
              <span className="font-bold text-foreground">
                {totalCount} {totalCount === 1 ? 'pendiente' : 'pendientes'}
              </span>
            </div>
          </div>
        ))}
    </>
  );
}
