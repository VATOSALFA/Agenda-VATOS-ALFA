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
  Globe,
  Calendar,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import type { Reservation, Profesional, Client } from '@/lib/types';
import { formatClientName } from './agenda-utils';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_AVISOS_AGENDA_RULES,
  ReglasReservasConfig,
  isShortNoticeAppointment,
} from '@/lib/booking-rules';
import { playStrongNotificationAlert } from '@/lib/notification-sound';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

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
  selectedLocalId?: string | null;
  onUpdateStatus: (reservationId: string, status: string) => void;
  onSelectReservation: (reservation: any) => void;
  onOpenBookingRules?: () => void;
}

export function OverdueNotificationsPopover({
  reservations,
  professionals,
  clients,
  selectedLocalId,
  onUpdateStatus,
  onSelectReservation,
  onOpenBookingRules,
}: OverdueNotificationsPopoverProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isStaff = Boolean(
    user?.role &&
      (user.role.toLowerCase().includes('staff') || user.role.toLowerCase().includes('barbero'))
  );

  const [nowMinutes, setNowMinutes] = useState<number>(0);
  const [todayStr, setTodayStr] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'online' | 'whatsapp' | 'overdue'>('all');

  // Reglas de reserva cargadas en tiempo real desde Firestore
  const [rules, setRules] = useState<ReglasReservasConfig>(DEFAULT_BOOKING_RULES);
  const [whatsappTemplate, setWhatsappTemplate] = useState<string>(
    '¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_'
  );
  const [whatsappConfirmationTemplate, setWhatsappConfirmationTemplate] = useState<string>(
    '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 2 horas antes. Favor de llegar 5 minutos antes de tu cita._'
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
          if (d.whatsappConfirmationTemplate || d.whatsappTemplate) {
            setWhatsappConfirmationTemplate(d.whatsappConfirmationTemplate || d.whatsappTemplate);
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

  // Escuchar en tiempo real reservas online (web_publica, app_movil, chatbot) desde hoy en adelante
  const [onlineReservationsFromDb, setOnlineReservationsFromDb] = useState<Reservation[]>([]);

  useEffect(() => {
    if (!db || isStaff || !todayStr) return;

    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const qOnline = query(
      collection(db, 'reservas'),
      where('fecha', '>=', todayStr)
    );

    const unsub = onSnapshot(
      qOnline,
      (snap) => {
        const list: Reservation[] = [];
        snap.forEach((d) => {
          const res = { id: d.id, ...d.data() } as unknown as Reservation;
          if (
            selectedLocalId &&
            selectedLocalId !== 'todos' &&
            res.local_id &&
            res.local_id !== selectedLocalId
          ) {
            return;
          }

          const canal = (res.canal_reserva || res.origen || '').toLowerCase();
          const isOnline =
            canal.startsWith('web') ||
            canal.startsWith('app') ||
            canal.startsWith('mobile') ||
            canal.startsWith('chat') ||
            canal.startsWith('janet');

          if (!isOnline) return;

          // Excluir canceladas, completadas o no asiste
          if (
            res.estado === 'Cancelado' ||
            res.estado === 'No asiste' ||
            res.estado === 'Completado' ||
            res.estado === 'Venta completada'
          ) {
            return;
          }

          // Citas pendientes de confirmación por recepción
          if (!res.whatsappConfirmationSent && res.estado !== 'Confirmado') {
            list.push(res);
          }
        });

        setOnlineReservationsFromDb(list);
      },
      (err) => {
        console.error('Error escuchando citas online en tiempo real:', err);
      }
    );

    let unsubSandbox: (() => void) | undefined;
    if (isLocalhost) {
      try {
        const qSandbox = query(
          collection(db, 'reservas_sandbox'),
          where('fecha', '>=', todayStr)
        );
        unsubSandbox = onSnapshot(qSandbox, (snap) => {
          const sandboxList: Reservation[] = [];
          snap.forEach((d) => {
            const res = { id: d.id, ...d.data(), isSandbox: true } as unknown as Reservation;
            const canal = (res.canal_reserva || res.origen || '').toLowerCase();
            const isOnline =
              canal.startsWith('web') ||
              canal.startsWith('app') ||
              canal.startsWith('mobile') ||
              canal.startsWith('chat') ||
              canal.startsWith('janet');
            if (
              isOnline &&
              !res.whatsappConfirmationSent &&
              res.estado !== 'Confirmado' &&
              res.estado !== 'Cancelado' &&
              res.estado !== 'No asiste' &&
              res.estado !== 'Completado'
            ) {
              sandboxList.push(res);
            }
          });
          if (sandboxList.length > 0) {
            setOnlineReservationsFromDb((prev) => {
              const combined = [...prev, ...sandboxList];
              return Array.from(new Map(combined.map((r) => [r.id, r])).values());
            });
          }
        });
      } catch (e) {
        console.warn('Sandbox listener omitido:', e);
      }
    }

    return () => {
      unsub();
      if (unsubSandbox) unsubSandbox();
    };
  }, [isStaff, todayStr, selectedLocalId]);

  // Consolidar citas en línea pendientes de confirmación
  const allOnlineReservations = useMemo(() => {
    if (isStaff) return [];

    const map = new Map<string, Reservation>();
    onlineReservationsFromDb.forEach((r) => map.set(r.id, r));

    (reservations || []).forEach((r) => {
      const canal = (r.canal_reserva || r.origen || '').toLowerCase();
      const isOnline =
        canal.startsWith('web') ||
        canal.startsWith('app') ||
        canal.startsWith('mobile') ||
        canal.startsWith('chat') ||
        canal.startsWith('janet');

      if (
        isOnline &&
        !r.whatsappConfirmationSent &&
        r.estado !== 'Confirmado' &&
        r.estado !== 'Cancelado' &&
        r.estado !== 'No asiste' &&
        r.estado !== 'Completado' &&
        r.estado !== 'Venta completada'
      ) {
        map.set(r.id, r);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return (a.hora_inicio || '').localeCompare(b.hora_inicio || '');
    });
  }, [isStaff, onlineReservationsFromDb, reservations]);

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
      if (res.fecha !== todayStr) return false;
      if (res.whatsappReminderSent) return false;

      if (
        res.estado === 'Cancelado' ||
        res.estado === 'No asiste' ||
        res.estado === 'Completado' ||
        res.estado === 'Venta completada'
      ) {
        return false;
      }

      if (isShortNoticeAppointment(res, omitirCreacionMinutos)) return false;

      if (!res.hora_inicio || typeof res.hora_inicio !== 'string') return false;
      const parts = res.hora_inicio.split(':');
      if (parts.length < 2) return false;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return false;

      const startMin = h * 60 + m;
      const minsUntilStart = startMin - nowMinutes;

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

  const totalCount =
    allOnlineReservations.length +
    whatsappReminderReservations.length +
    overdueReservations.length;

  // Autoexpandir al centro y reproducir alerta sonora de alta penetración al recibir un nuevo aviso
  const prevCountRef = useRef(totalCount);
  useEffect(() => {
    if (isStaff) return;
    if (totalCount > prevCountRef.current && totalCount > 0) {
      setIsMinimized(false);
      playStrongNotificationAlert();
    }
    prevCountRef.current = totalCount;
  }, [totalCount, isStaff]);

  // Acción: Enviar confirmación por WhatsApp a cita en línea
  const handleSendOnlineConfirmation = async (res: Reservation, e: React.MouseEvent) => {
    e.stopPropagation();
    const client = clients.find((c) => c.id === res.cliente_id) || res.customer;
    const phoneRaw =
      client?.telefono ||
      (res as any).cliente_telefono ||
      (res as any).telefono ||
      '';
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

    let datePretty = res.fecha;
    try {
      datePretty = format(parseISO(res.fecha), "EEEE, dd 'de' MMMM", { locale: es });
      datePretty = datePretty.charAt(0).toUpperCase() + datePretty.slice(1);
    } catch (_) {}

    const message = whatsappConfirmationTemplate
      .replace(/{nombre}/g, clientName)
      .replace(/{servicios}/g, servicesText)
      .replace(/{fecha}/g, datePretty)
      .replace(/{hora}/g, res.hora_inicio || '')
      .replace(/{profesional}/g, profName)
      .replace(/{ubicacion}/g, locationStr);

    if (formattedPhone) {
      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }

    try {
      if (db) {
        const targetCol = (res as any).isSandbox ? 'reservas_sandbox' : 'reservas';
        await updateDoc(doc(db, targetCol, res.id), {
          whatsappConfirmationSent: true,
          estado: 'Confirmado',
        });
      }
      onUpdateStatus(res.id, 'Confirmado');
      toast({
        title: 'Confirmación Enviada',
        description: `WhatsApp abierto para ${clientName}. La cita se marcó como confirmada.`,
      });
    } catch (err) {
      console.error('Error al confirmar cita online:', err);
    }
  };

  // Acción directa: Confirmar cita en línea sin abrir WhatsApp
  const handleConfirmDirectly = async (res: Reservation, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (db) {
        const targetCol = (res as any).isSandbox ? 'reservas_sandbox' : 'reservas';
        await updateDoc(doc(db, targetCol, res.id), {
          whatsappConfirmationSent: true,
          estado: 'Confirmado',
        });
      }
      onUpdateStatus(res.id, 'Confirmado');
      toast({
        title: 'Cita Confirmada',
        description: 'La cita fue marcada como confirmada en la agenda.',
      });
    } catch (err) {
      console.error('Error al confirmar directamente:', err);
    }
  };

  // Acción directa: Enviar recordatorio por WhatsApp y marcar como enviado
  const handleSendReminderWhatsApp = async (res: Reservation, e: React.MouseEvent) => {
    e.stopPropagation();
    const client = clients.find((c) => c.id === res.cliente_id) || res.customer;
    const phoneRaw =
      client?.telefono ||
      (res as any).cliente_telefono ||
      (res as any).telefono ||
      '';
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
        const targetCol = (res as any).isSandbox ? 'reservas_sandbox' : 'reservas';
        await updateDoc(doc(db, targetCol, res.id), {
          whatsappReminderSent: true,
        });
      }
      toast({
        title: 'Recordatorio Enviado',
        description: `Se abrió WhatsApp para recordar la cita de ${clientName}.`,
      });
    } catch (err) {
      console.error('Error al actualizar whatsappReminderSent:', err);
    }
  };

  const formatReservationDay = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr === todayStr) return 'Hoy';
    try {
      const d = parseISO(dateStr);
      const formatted = format(d, "EEE dd 'de' MMM", { locale: es });
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch (_) {
      return dateStr;
    }
  };

  if (isStaff) {
    return null;
  }

  // Filtrado según la pestaña seleccionada
  const filteredOnline =
    activeTab === 'all' || activeTab === 'online' ? allOnlineReservations : [];
  const filteredReminders =
    activeTab === 'all' || activeTab === 'whatsapp' ? whatsappReminderReservations : [];
  const filteredOverdues =
    activeTab === 'all' || activeTab === 'overdue' ? overdueReservations : [];

  return (
    <>
      {/* 1. Botón de Campanita en la Barra Superior de la Agenda */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (totalCount > 0) {
                setIsMinimized(false);
              }
            }}
            className="relative h-8 w-8 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 transition-colors"
            title={`Avisos de Agenda ${totalCount > 0 ? `(${totalCount} pendientes)` : ''}`}
          >
            <Bell className={cn('h-4 w-4', totalCount > 0 && 'text-blue-500')} />

            {totalCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[9px] font-bold rounded-full h-3.5 min-w-[14px] px-0.5 flex items-center justify-center shadow-xs animate-pulse">
                {totalCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        {/* Solo abrir Popover cuando totalCount === 0 (para informar que todo está al día) */}
        {totalCount === 0 && (
          <PopoverContent
            className="w-80 p-0 shadow-2xl border-2 border-blue-500 rounded-xl bg-background overflow-hidden"
            align="end"
          >
            <div className="p-3.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-400" />
                <h4 className="font-bold text-sm text-white">Avisos de Agenda</h4>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] font-bold bg-white/10 text-slate-300 border-white/20"
              >
                Al día
              </Badge>
            </div>

            <div className="p-5 text-center text-muted-foreground space-y-2">
              <CheckCircle2 className="h-8 w-8 text-blue-500 mx-auto opacity-80" />
              <p className="text-xs font-semibold text-foreground">¡Todo al día en la agenda!</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                No hay reservas en línea por confirmar, recordatorios pendientes ni citas retrasadas.
              </p>
            </div>

            {onOpenBookingRules && (
              <div className="p-2.5 bg-muted/30 border-t border-border/60 flex items-center justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenBookingRules();
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 gap-1.5 h-8 font-semibold"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Consultar Reglas de Agendamiento</span>
                </Button>
              </div>
            )}
          </PopoverContent>
        )}
      </Popover>

      {/* 2. MODAL DE AVISOS CENTRADO EN PANTALLA CON FONDO DIFUMINADO (BACKDROP BLUR) */}
      {totalCount > 0 && !isMinimized && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsMinimized(true);
            }
          }}
        >
          <div
            className="relative w-full max-w-lg bg-background rounded-2xl shadow-2xl border-2 border-blue-500 overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera Oficial VATOS ALFA con Franja Azul y Haz de Luz Oblicuo */}
            <div className="p-3.5 sm:p-4 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-blue-500/30 relative overflow-hidden">
              <div className="header-light-beam" aria-hidden="true" />
              <div className="relative z-10 flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-blue-400 animate-bounce" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-white tracking-wide">
                      Avisos de Recepción y Agenda
                    </h3>
                    <Badge
                      variant="outline"
                      className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px] font-bold px-1.5 py-0.5 animate-pulse"
                    >
                      {totalCount} {totalCount === 1 ? 'pendiente' : 'pendientes'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-blue-200/80 font-normal mt-0.5">
                    Acción requerida para mantener la agenda sincronizada
                  </p>
                </div>
              </div>

              {/* Acciones de la Cabecera */}
              <div className="relative z-10 flex items-center gap-1.5">
                {onOpenBookingRules && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onOpenBookingRules}
                    className="h-8 px-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors gap-1.5 text-xs font-semibold"
                    title="Consultar Reglas de Agendamiento"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-300" />
                    <span className="hidden sm:inline">Reglas</span>
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMinimized(true)}
                  className="h-8 px-2.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors gap-1 text-xs font-semibold"
                  title="Minimizar modal de avisos"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Minimizar</span>
                </Button>
              </div>
            </div>

            {/* Selector de Pestañas */}
            <div className="flex items-center border-b border-border/60 bg-muted/20 px-3 py-2 gap-1.5 text-xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-semibold transition-colors shrink-0',
                  activeTab === 'all'
                    ? 'bg-[#202A49] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Todos ({totalCount})
              </button>

              {allOnlineReservations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('online')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 shrink-0',
                    activeTab === 'online'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Globe className="w-3 h-3 text-blue-400" />
                  En Línea ({allOnlineReservations.length})
                </button>
              )}

              {whatsappReminderReservations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('whatsapp')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 shrink-0',
                    activeTab === 'whatsapp'
                      ? 'bg-blue-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <WhatsAppIcon className="w-3 h-3 text-blue-400" />
                  Recordatorios ({whatsappReminderReservations.length})
                </button>
              )}

              {overdueReservations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('overdue')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 shrink-0',
                    activeTab === 'overdue'
                      ? 'bg-red-600 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <AlertCircle className="w-3 h-3 text-red-300" />
                  Por Etiquetar ({overdueReservations.length})
                </button>
              )}
            </div>

            {/* Listado con Barra de Desplazamiento Estilizada */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 max-h-[58vh]">
              {/* 1. SECCIÓN: CITAS AGENDADAS EN LÍNEA PENDIENTES DE CONFIRMACIÓN */}
              {filteredOnline.map((res) => {
                const client = clients.find((c) => c.id === res.cliente_id) || res.customer;
                const prof = professionals.find(
                  (p) => p.id === res.barbero_id || res.items?.some((i) => i.barbero_id === p.id)
                );
                const canal = (res.canal_reserva || res.origen || 'web_publica').toLowerCase();
                const canalLabel = canal.includes('app')
                  ? 'App Móvil'
                  : canal.includes('chat') || canal.includes('janet')
                  ? 'Janet'
                  : 'Web';

                const isDepositPaid =
                  res.pago_estado === 'deposit_paid' ||
                  res.pago_estado === 'anticipo_pagado' ||
                  Number((res as any).anticipo_pagado || 0) > 0;

                const dayLabel = formatReservationDay(res.fecha);

                let servicesText = '';
                if (res.items && res.items.length > 0) {
                  servicesText = res.items.map((i) => i.nombre || i.servicio).join(', ');
                } else {
                  servicesText = (res as any).servicio || 'Servicio';
                }

                return (
                  <div
                    key={`online_${res.id}`}
                    className="p-3.5 bg-card rounded-xl border border-blue-500/40 hover:border-blue-500 shadow-xs flex flex-col gap-2.5 transition-all group"
                  >
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer"
                      onClick={() => {
                        onSelectReservation(res);
                        setIsMinimized(true);
                      }}
                      title="Ver detalles completos de la reserva"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-foreground group-hover:text-blue-400 transition-colors flex items-center gap-1.5 truncate">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {formatClientName(client?.nombre, client?.apellido)}
                            </span>
                          </span>

                          <Badge
                            variant="outline"
                            className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] font-semibold py-0 px-1.5 flex items-center gap-1"
                          >
                            <Globe className="w-3 h-3" />
                            {canalLabel}
                          </Badge>

                          {isDepositPaid && (
                            <Badge
                              variant="outline"
                              className="bg-blue-500/15 text-blue-300 border-blue-400/40 text-[10px] font-bold py-0 px-1.5"
                            >
                              Anticipo Pagado
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="flex items-center gap-1 font-semibold text-foreground">
                            <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                            {dayLabel}
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-foreground">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            {res.hora_inicio} - {res.hora_fin}
                          </span>
                          {prof && (
                            <span className="text-slate-400 text-[11px] truncate">
                              Barbero: <strong className="text-foreground">{prof.publicName || prof.name}</strong>
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {servicesText} • <strong className="text-foreground">${Number(res.total || 0).toFixed(2)} MXN</strong>
                        </p>
                      </div>
                    </div>

                    {/* Botones de acción directa */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleSendOnlineConfirmation(res, e)}
                        className="flex-1 h-8 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30 font-bold rounded-lg transition-colors gap-1.5"
                        title="Enviar confirmación oficial por WhatsApp y marcar como confirmada"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>Mandar Confirmación</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleConfirmDirectly(res, e)}
                        className="h-8 px-3 text-xs text-slate-300 hover:text-white hover:bg-white/10 border border-border/60 rounded-lg transition-colors gap-1 font-semibold"
                        title="Marcar confirmada sin abrir WhatsApp"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                        <span>Confirmar</span>
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* 2. SECCIÓN: RECORDATORIOS WHATSAPP */}
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
                    className="p-3.5 bg-card rounded-xl border border-border/80 hover:border-blue-500/50 shadow-xs flex flex-col gap-2.5 transition-all group"
                  >
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer"
                      onClick={() => {
                        onSelectReservation(res);
                        setIsMinimized(true);
                      }}
                      title="Ver detalles de la cita"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-foreground group-hover:text-blue-400 transition-colors flex items-center gap-1.5 truncate">
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {formatClientName(client?.nombre, client?.apellido)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="font-semibold text-foreground">
                            {res.hora_inicio} - {res.hora_fin}
                          </span>
                          {prof && (
                            <span className="ml-1 text-[11px] text-slate-400 truncate">
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
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        )}
                      >
                        {isUrgent
                          ? `URGENTE • en ${Math.max(0, minsUntil)}m`
                          : `Recordatorio • en ${minsUntil}m`}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30 font-bold gap-1.5 rounded-lg transition-colors"
                        onClick={(e) => handleSendReminderWhatsApp(res, e)}
                        title="Abrir WhatsApp para enviar recordatorio preventivo"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>Enviar Recordatorio</span>
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* 3. SECCIÓN: CITAS ATRASADAS SIN REGISTRAR ASISTENCIA */}
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
                    className="p-3.5 bg-card rounded-xl border border-red-500/30 hover:border-red-500/60 shadow-xs flex flex-col gap-2.5 transition-all group"
                  >
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer"
                      onClick={() => {
                        onSelectReservation(res);
                        setIsMinimized(true);
                      }}
                      title="Ver detalles de la cita"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-foreground group-hover:text-red-400 transition-colors flex items-center gap-1.5 truncate">
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {formatClientName(client?.nombre, client?.apellido)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="font-semibold text-foreground">
                            {res.hora_inicio} - {res.hora_fin}
                          </span>
                          {prof && (
                            <span className="ml-1 text-[11px] text-slate-400 truncate">
                              ({prof.publicName || prof.name})
                            </span>
                          )}
                        </p>
                      </div>

                      <Badge
                        variant="outline"
                        className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px] font-bold shrink-0"
                      >
                        +{overdueMins} min tarde
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-border/60 font-semibold rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'No asiste');
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        No Asistió
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30 font-semibold rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(res.id, 'Confirmado');
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-blue-400" />
                        Confirmar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pie Informativo */}
            <div className="p-3 bg-muted/30 border-t border-border/60 text-xs text-muted-foreground flex items-center justify-between">
              <span className="text-[11px]">
                💡 Envía confirmación o etiqueta el estado de la cita
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMinimized(true)}
                className="h-7 text-xs px-3 rounded-lg border-border/60 font-semibold"
              >
                Minimizar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. DOCK FLOTANTE MINIMIZADO EN LA ESQUINA INFERIOR DERECHA */}
      {totalCount > 0 && isMinimized && (
        <div
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2.5 px-3.5 py-2.5 bg-[#10172b] hover:bg-[#1a233a] text-white rounded-xl shadow-[0_10px_30px_rgba(16,23,43,0.5)] border-2 border-blue-500 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 group animate-in slide-in-from-bottom-5"
          title="Click para abrir avisos de agenda"
        >
          <div className="relative flex items-center justify-center">
            <Bell className="w-4 h-4 text-blue-400 animate-bounce" />
            <span className="absolute -top-2 -right-2.5 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow-md animate-pulse">
              {totalCount}
            </span>
          </div>
          <span className="text-xs font-bold tracking-wide">
            {totalCount === 1 ? '1 aviso pendiente' : `${totalCount} avisos pendientes`}
          </span>
          <ChevronUp className="w-4 h-4 text-blue-300 group-hover:-translate-y-0.5 transition-transform ml-1" />
        </div>
      )}
    </>
  );
}
