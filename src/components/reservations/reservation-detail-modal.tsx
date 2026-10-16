'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  User,
  Phone,
  Mail,
  Cake,
  MessageSquare,
  CreditCard,
  Bell,
  Pencil,
  Scissors,
  Calendar as CalendarIcon,
  Tag,
  Clock,
  Circle,
  Save,
  Trash2,
  Eye,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  DollarSign,
  Send,
  Bot,
  Globe,
  Smartphone,
  Laptop,
  ShieldAlert,
  Sparkles,
  X,
  AlertTriangle,
  MapPin,
  HelpCircle,
  UserCheck,
  Link2,
} from 'lucide-react';
import { RegisterDepositModal } from './register-deposit-modal';
import { SendConfirmationModal } from './send-confirmation-modal';
import type { Reservation, Sale, Local, Profesional, Client } from '@/lib/types';
import { format, parse, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, deleteDoc, updateDoc, collection, query, where, getDocs, runTransaction, increment } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Loader2 } from 'lucide-react';
import { CancelReservationModal } from './cancel-reservation-modal';
import { SaleDetailModal } from '../sales/sale-detail-modal';
import { functions, httpsCallable } from '@/lib/firebase-client';

import { useFirestoreQuery } from '@/hooks/use-firestore';
import { logAuditAction } from '@/lib/audit-logger';
import { formatClientName } from '../agenda/agenda-utils';
import { sendBookingCancellationAction } from '@/lib/actions/booking';
import { isShortNoticeAppointment, isOpeningHourTime, DEFAULT_BOOKING_RULES, ReglasReservasConfig } from '@/lib/booking-rules';

const addMinutesToTimeStr = (timeStr?: string, mins: number = 60): string => {
  if (!timeStr || !timeStr.includes(':')) return '';
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
};

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className={className}>
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157.1zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
  </svg>
);

interface ReservationDetailModalProps {
  reservation: Reservation;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPay: () => void;
  onUpdateStatus: (reservationId: string, status: string) => void;
  onEdit?: () => void;
  onClientClick?: (clientId: string) => void;
  onRegisterDeposit?: (depositAmount: number, paymentMethod: string, computedTotal?: number) => Promise<string | undefined>;
}

const statusOptions = [
  { status: 'Reservado', color: 'bg-blue-500', hex: '#3b82f6', label: 'Reservado' },
  { status: 'Confirmado', color: 'bg-yellow-400', hex: '#facc15', label: 'Confirmado' },
  { status: 'En espera', color: 'bg-emerald-500', hex: '#22c55e', label: 'En Espera' },
  { status: 'Asiste', color: 'bg-pink-400', hex: '#ec4899', label: 'Asiste' },
  { status: 'No asiste', color: 'bg-orange-400', hex: '#f97316', label: 'No Asistió' },
  { status: 'Pendiente', color: 'bg-red-500', hex: '#ef4444', label: 'Pendiente de Pago' },
  { status: 'Cancelado', color: 'bg-slate-400', hex: '#94a3b8', label: 'Cancelado' },
];

export function ReservationDetailModal({
  reservation,
  isOpen,
  onOpenChange,
  onPay,
  onUpdateStatus,
  onEdit,
  onClientClick,
  onRegisterDeposit,
}: ReservationDetailModalProps) {
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isDepositLinkModalOpen, setIsDepositLinkModalOpen] = useState(false);
  const [isSaleDetailModalOpen, setIsSaleDetailModalOpen] = useState(false);
  const [saleForReservation, setSaleForReservation] = useState<Sale | null>(null);
  const [isLoadingSale, setIsLoadingSale] = useState(false);
  const [activeHintId, setActiveHintId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  const [whatsappTemplate, setWhatsappTemplate] = useState<string>('¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 3 horas antes. Favor de llegar 5 minutos antes de tu cita._');
  const [whatsappReminderTemplate, setWhatsappReminderTemplate] = useState<string>('¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_');

  const { toast } = useToast();
  const { db, user } = useAuth();
  const isStaff = user?.role === 'Staff';
  const canViewPhone = useMemo(() => {
    if (isStaff) return false;
    if (user?.role === 'Administrador general' || user?.role === 'Administrador local' || user?.role === 'Recepcionista') return true;
    return Boolean(user?.permissions?.includes('ver_numero_telefono'));
  }, [user, isStaff]);

  const { data: locales } = useFirestoreQuery<Local>('locales');
  const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');
  const { data: allClients } = useFirestoreQuery<Client>('clientes');
  const { data: allUsers } = useFirestoreQuery<any>('usuarios');
  const { data: bookingRulesData } = useFirestoreQuery<ReglasReservasConfig>('configuracion', undefined, where('__name__', '==', 'reglas_reservas'));

  const bookingRules = bookingRulesData?.[0] || DEFAULT_BOOKING_RULES;
  const maxInasistenciasPermitidas = bookingRules.max_inasistencias_permitidas ?? 2;
  const isPenalizacionActive = bookingRules.penalizacion_inasistencias_activa ?? true;
  const penalizacionPorcentaje = bookingRules.penalizacion_anticipo_porcentaje ?? 50;

  useEffect(() => {
    if (isOpen && db) {
      getDoc(doc(db, 'configuracion', 'whatsapp')).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.whatsappMessageTemplate) setWhatsappTemplate(data.whatsappMessageTemplate);
          if (data.whatsappReminderTemplate) setWhatsappReminderTemplate(data.whatsappReminderTemplate);
        }
      }).catch(console.error);
    }
  }, [isOpen, db]);

  const isShortNotice = useMemo(() => {
    return isShortNoticeAppointment(reservation);
  }, [reservation]);

  const isReminderDoneOrNotNeeded = Boolean(reservation.whatsappReminderSent || isShortNotice);

  const allProfessionalNames = useMemo(() => {
    if (!reservation.items || !professionals) return reservation.professionalNames || 'N/A';

    const profIds = new Set(reservation.items.map(i => i.barbero_id).filter(Boolean));
    if (profIds.size === 0) return reservation.professionalNames || 'N/A';

    const names = Array.from(profIds)
      .map(id => professionals.find(p => p.id === id)?.name)
      .filter(Boolean);

    return names.length > 0 ? names.join(', ') : (reservation.professionalNames || 'N/A');
  }, [reservation.items, reservation.professionalNames, professionals]);

  // Cliente completo (desde BD o reservation.customer)
  const clientData: Client | null = useMemo(() => {
    if (reservation.cliente_id && allClients) {
      const found = allClients.find(c => c.id === reservation.cliente_id);
      if (found) return found;
    }
    return reservation.customer || null;
  }, [reservation.cliente_id, reservation.customer, allClients]);

  // Historial de reservas del cliente para métricas en vivo sincronizadas con su ficha
  const [clientReservations, setClientReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (!clientData?.id || !db || !isOpen) {
      setClientReservations([]);
      return;
    }

    let isSubscribed = true;
    const fetchClientReservations = async () => {
      try {
        const q = query(
          collection(db, 'reservas'),
          where('cliente_id', '==', clientData.id)
        );
        const snap = await getDocs(q);
        if (isSubscribed) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
          setClientReservations(list);
        }
      } catch (err) {
        console.error("Error checking client reservations:", err);
      }
    };
    fetchClientReservations();
    return () => { isSubscribed = false; };
  }, [clientData?.id, db, isOpen]);

  // Estadísticas del cliente sincronizadas con su historial real
  const clientStats = useMemo(() => {
    if (!clientData) {
      return { totalCitas: 0, asistidasCount: 0, inasistenciasCount: 0, canceladasCount: 0 };
    }

    if (clientReservations.length > 0) {
      const total = clientReservations.length;
      const asistidas = clientReservations.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado' || r.pago_estado === 'Pagado').length;
      const inasistencias = clientReservations.filter(r => r.estado === 'No asiste').length;
      const canceladas = clientReservations.filter(r => r.estado === 'Cancelado').length;

      return {
        totalCitas: Math.max(total, Number(clientData.citas_totales) || 0),
        asistidasCount: Math.max(asistidas, Number(clientData.citas_asistidas) || 0),
        inasistenciasCount: Math.max(inasistencias, Number(clientData.citas_no_asistidas) || 0),
        canceladasCount: Math.max(canceladas, Number(clientData.citas_canceladas) || 0),
      };
    }

    return {
      totalCitas: Number(clientData.citas_totales) || 0,
      asistidasCount: Number(clientData.citas_asistidas) || 0,
      inasistenciasCount: Number(clientData.citas_no_asistidas) || 0,
      canceladasCount: Number(clientData.citas_canceladas) || 0,
    };
  }, [clientData, clientReservations]);

  const unattendedCount = clientStats.inasistenciasCount;

  const isNewClient = useMemo(() => {
    if (!clientData) return false;
    return clientStats.totalCitas === 0;
  }, [clientData, clientStats.totalCitas]);

  const hasUnattendedAlert = isPenalizacionActive && unattendedCount >= maxInasistenciasPermitidas;

  // Resolución de nombre de quién agendó la cita
  const resolvedCreatorName = useMemo(() => {
    const raw = (reservation.creada_por || reservation.creado_por || (reservation as any).created_by || '').trim();

    // 1. Si viene como 'admin' o vacío en una cita de recepción/agenda
    if (!raw || raw.toLowerCase() === 'admin' || raw.toLowerCase() === 'administrador') {
      const adminUser = allUsers?.find((u: any) => u.role === 'Administrador general' || u.email === 'vatosalfa@gmail.com');
      if (adminUser?.name) return adminUser.name;
      if (user?.role === 'Administrador general' && user?.displayName) return user.displayName;
      return 'José Alejandro Pacheco';
    }

    // 2. Si coincide con un usuario de la colección `usuarios` (UID, correo o nombre)
    const foundUser = allUsers?.find((u: any) => 
      u.id === raw || 
      u.uid === raw || 
      (u.email && u.email.toLowerCase() === raw.toLowerCase()) ||
      (u.name && u.name.toLowerCase() === raw.toLowerCase())
    );
    if (foundUser?.name) return foundUser.name;

    // 3. Si coincide con un profesional de la colección `profesionales`
    const foundProf = professionals?.find(p => 
      p.id === raw || 
      (p.email && p.email.toLowerCase() === raw.toLowerCase()) ||
      (p.name && p.name.toLowerCase() === raw.toLowerCase())
    );
    if (foundProf?.name) return foundProf.name;

    // 4. Si es un correo, limpiar el dominio
    if (raw.includes('@')) {
      const prefix = raw.split('@')[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    return raw;
  }, [reservation.creada_por, reservation.creado_por, (reservation as any).created_by, allUsers, professionals, user]);

  // Canal de creación y auditoría
  const originInfo = useMemo(() => {
    const canal = (reservation.canal_reserva || reservation.origen || '').toLowerCase();

    // 1. App Móvil (preparada para cuando esté activa la app)
    if (canal.includes('app') || canal.includes('mobile')) {
      return {
        type: 'app',
        label: 'App Móvil Vatos Alfa',
        badgeTitle: 'App Móvil',
        icon: Smartphone,
        accentColor: 'text-[#C5A880]',
        badgeClass: 'border-[#C5A880]/40 bg-[#C5A880]/10 text-[#C5A880]',
        cardBg: 'bg-[#C5A880]/5 border-[#C5A880]/20',
        creator: reservation.creada_por ? resolvedCreatorName : 'Cliente (Vía App)',
        description: 'Cita reservada directamente por el cliente desde la aplicación móvil oficial de Vatos Alfa.',
      };
    }

    // 2. Chatbot WhatsApp / Janet
    if (canal.includes('chatbot') || canal.includes('janet') || canal.includes('bot')) {
      return {
        type: 'chatbot',
        label: 'Janet (WhatsApp)',
        badgeTitle: 'Janet (WhatsApp)',
        icon: Bot,
        accentColor: 'text-blue-600 dark:text-blue-400',
        badgeClass: 'border-blue-500/40 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
        cardBg: 'bg-blue-50/40 dark:bg-blue-950/15 border-blue-200/60 dark:border-blue-800/40',
        creator: 'Janet (Asistente Virtual)',
        description: 'Cita agendada de forma automática por la asistente virtual Janet a través de WhatsApp.',
      };
    }

    // 3. Sitio Web Público
    if (canal.includes('web') || canal.includes('sitio') || canal.includes('publica')) {
      return {
        type: 'web',
        label: 'Sitio Web Público',
        badgeTitle: 'Sitio Web',
        icon: Globe,
        accentColor: 'text-blue-400',
        badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        cardBg: 'bg-slate-50/80 dark:bg-slate-900/40 border-border/60',
        creator: reservation.creada_por ? resolvedCreatorName : 'Cliente (En Línea)',
        description: 'Cita reservada directamente por el cliente desde el sitio web público.',
      };
    }

    // 4. Agenda Sucursal (Recepción / Manual) - Predeterminada
    return {
      type: 'agenda',
      label: 'Agenda Sucursal (Recepción)',
      badgeTitle: 'Agenda Sucursal',
      icon: Laptop,
      accentColor: 'text-blue-600 dark:text-blue-400',
      badgeClass: 'border-blue-500/30 bg-blue-50/80 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
      cardBg: 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/60',
      creator: resolvedCreatorName,
      description: `Cita registrada manualmente en recepción por ${resolvedCreatorName}.`,
    };
  }, [reservation.canal_reserva, reservation.origen, reservation.creada_por, resolvedCreatorName]);

  // Formateo de fecha y hora exacta de creación
  const creationFormattedDate = useMemo(() => {
    const raw = reservation.creado_en || (reservation as any).createdAt || (reservation as any).creada_el;
    if (!raw) return null;
    try {
      let d: Date | null = null;
      if (typeof (raw as any).toDate === 'function') {
        d = (raw as any).toDate();
      } else if (typeof (raw as any).seconds === 'number') {
        d = new Date((raw as any).seconds * 1000);
      } else if (typeof raw === 'string' || typeof raw === 'number') {
        d = new Date(raw);
      }
      if (d && !isNaN(d.getTime())) {
        return {
          full: format(d, "EEEE dd 'de' MMMM, yyyy 'a las' hh:mm a", { locale: es }),
          short: `${format(d, "dd/MM/yyyy", { locale: es })} - ${format(d, "hh:mm a", { locale: es })}`,
        };
      }
    } catch (e) {
      console.error('Error formatting creation date:', e);
    }
    return null;
  }, [reservation.creado_en, (reservation as any).createdAt, (reservation as any).creada_el]);

  if (!reservation) return null;

  const handleCancelClick = () => {
    setIsCancelModalOpen(true);
  };

  const handleCancelReservation = async (reservationId: string, reason: string) => {
    setIsCancelModalOpen(false);

    const isSandboxRes = (reservation as any).isSandbox;
    if (!reservation.cliente_id && !isSandboxRes || !db) {
      toast({ variant: 'destructive', title: "Error", description: "La reserva no tiene un cliente asociado o la base de datos no está disponible." });
      return;
    }

    try {
      if (isSandboxRes) {
        const resRef = doc(db, 'reservas_sandbox', reservationId);
        await updateDoc(resRef, { estado: 'Cancelado', motivo_cancelacion: reason || '' });
      } else {
        await runTransaction(db, async (transaction) => {
          if (!db) throw new Error("Database not available in transaction");
          const resRef = doc(db, 'reservas', reservationId);
          const clientRef = doc(db, 'clientes', reservation.cliente_id!);

          transaction.update(resRef, { estado: 'Cancelado', motivo_cancelacion: reason || '' });
          transaction.update(clientRef, {
            citas_canceladas: increment(1)
          });
        });

        sendBookingCancellationAction(reservationId, reason).catch((err) => {
          console.error("[Modal] Error al enviar correo de cancelación:", err);
        });
      }

      toast({
        title: "Reserva Cancelada",
        description: isSandboxRes
          ? "La reserva de prueba ha sido cancelada en Sandbox."
          : "El estado de la reserva ha sido actualizado a 'Cancelado'.",
      });

      await logAuditAction({
        action: 'Cancelar Reserva',
        details: `Se canceló la cita del cliente ${reservation.customer?.nombre || 'Desconocido'}. Motivo: ${reason || 'No especificado'}. Fecha: ${reservation.fecha} a las ${reservation.hora_inicio}.`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        severity: 'warning',
        localId: reservation.local_id || 'unknown'
      });

      onOpenChange(false);
      onUpdateStatus(reservationId, 'Cancelado');

    } catch (error) {
      console.error("Error canceling reservation: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cancelar la reserva. Inténtalo de nuevo.",
      });
    }
  };

  const handleViewPayment = async () => {
    if (!db) return;
    setIsLoadingSale(true);
    try {
      let saleData: Sale | null = null;
      let saleId: string | null = null;

      const salesQuery = query(collection(db, 'ventas'), where('reservationId', '==', reservation.id));
      const salesSnapshot = await getDocs(salesQuery);

      if (!salesSnapshot.empty) {
        saleId = salesSnapshot.docs[0].id;
        saleData = salesSnapshot.docs[0].data() as Sale;
      }

      if (saleData && saleId) {
        setSaleForReservation({ ...saleData, id: saleId, client: reservation.customer });
        setIsSaleDetailModalOpen(true);
      } else {
        toast({
          variant: 'destructive',
          title: 'Venta no encontrada',
          description: 'No se encontró el comprobante de pago vinculado a esta cita.',
        });
      }
    } catch (error) {
      console.error("Error fetching sale details:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron obtener los detalles del pago.' });
    } finally {
      setIsLoadingSale(false);
    }
  };

  const handleResendEmail = async () => {
    if (!reservation.id) return;

    if ((reservation as any).isSandbox) {
      toast({
        title: "Modo Sandbox",
        description: "En citas de prueba (Sandbox) el envío de correos reales a clientes está desactivado.",
      });
      return;
    }

    if (!reservation.customer?.correo) {
      toast({
        title: "Atención",
        description: "El cliente no cuenta con correo electrónico registrado.",
        variant: "destructive"
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const resendFn = httpsCallable(functions, 'resendReservationConfirmation');
      const result = await resendFn({ reservationId: reservation.id });
      const data = result.data as any;

      if (data?.warning) {
        toast({ title: "Atención", description: data.warning, variant: "destructive" });
      } else {
        toast({ title: "Correo enviado", description: "Se ha enviado la confirmación al cliente." });
      }
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "No se pudo enviar el correo." });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const generateWhatsAppMessage = () => {
    if (!reservation.customer) return '';
    
    let servicesText = '';
    if (reservation.items && reservation.items.length > 0) {
      servicesText = reservation.items.map(i => i.nombre || i.servicio).join(', ');
    } else {
      servicesText = (reservation as any).servicio || 'Servicio';
    }

    let dateStr = reservation.fecha;
    try {
        dateStr = format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM, yyyy", { locale: es });
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    } catch(e) {}

    const local = locales?.find(l => l.id === reservation.local_id);
    const locationStr = local ? `${local.name} (${local.address})` : 'VATOS ALFA Barber Shop';

    const message = whatsappTemplate
        .replace(/{nombre}/g, formatClientName(reservation.customer.nombre, reservation.customer.apellido))
        .replace(/{servicios}/g, servicesText)
        .replace(/{fecha}/g, dateStr)
        .replace(/{hora}/g, reservation.hora_inicio || '')
        .replace(/{profesional}/g, allProfessionalNames)
        .replace(/{ubicacion}/g, locationStr);
    
    return encodeURIComponent(message);
  };

  const generateWhatsAppReminderMessage = () => {
    if (!reservation.customer) return '';
    let dateStr = reservation.fecha;
    try {
        dateStr = format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM", { locale: es });
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    } catch(e) {}
    const local = locales?.find(l => l.id === reservation.local_id);
    const locationStr = local ? `${local.name} (${local.address})` : 'VATOS ALFA Barber Shop';

    let servicesText = '';
    if (reservation.items && reservation.items.length > 0) {
      servicesText = reservation.items.map(i => i.nombre || i.servicio).join(', ');
    } else {
      servicesText = (reservation as any).servicio || 'Servicio';
    }

    const message = whatsappReminderTemplate
        .replace(/{nombre}/g, formatClientName(reservation.customer.nombre, reservation.customer.apellido))
        .replace(/{servicios}/g, servicesText)
        .replace(/{fecha}/g, dateStr)
        .replace(/{hora}/g, reservation.hora_inicio || '')
        .replace(/{profesional}/g, allProfessionalNames)
        .replace(/{ubicacion}/g, locationStr);
    
    return encodeURIComponent(message);
  };

  const handleWhatsAppClick = async (type: 'confirmation' | 'reminder') => {
    if (!reservation.customer?.telefono || !db) return;
    const phone = reservation.customer.telefono.replace(/\D/g, '');
    const formattedPhone = phone.length === 10 ? '52' + phone : phone;
    
    const message = type === 'confirmation' ? generateWhatsAppMessage() : generateWhatsAppReminderMessage();
    
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
    
    try {
      const targetCol = (reservation as any).isSandbox ? 'reservas_sandbox' : 'reservas';
      await updateDoc(doc(db, targetCol, reservation.id), {
        [type === 'confirmation' ? 'whatsappConfirmationSent' : 'whatsappReminderSent']: true
      });
      toast({ title: 'Estado actualizado', description: 'Se marcó el mensaje como enviado.', variant: 'default' });
    } catch(e) {
      console.error("Error updating whatsapp status", e);
    }
  };

  const currentLocal = locales?.find(l => l.id === reservation.local_id);
  const totalAmount = reservation.precio ?? (reservation as any).total ?? 0;
  const isDepositPaid =
    reservation.pago_estado === 'deposit_paid' ||
    reservation.pago_estado === 'anticipo_pagado' ||
    (reservation.pago_estado !== 'pendiente_anticipo' &&
      reservation.pago_estado !== 'pending_payment' &&
      reservation.pago_estado !== 'Pendiente' &&
      reservation.pago_estado !== 'pendiente' &&
      (Number(reservation.anticipo_pagado) > 0 ||
        Number(reservation.anticipoPagado) > 0 ||
        Number(reservation.monto_pagado_real) > 0 ||
        Number(reservation.monto_pagado) > 0));

  const depositAmount = isDepositPaid
    ? Number(reservation.anticipo_pagado ?? reservation.anticipoPagado ?? reservation.monto_pagado_real ?? reservation.monto_pagado ?? reservation.monto_anticipo ?? 0)
    : 0;
  const expectedDepositAmount = Number((reservation as any).anticipo_esperado ?? reservation.monto_anticipo ?? 0);
  const balancePending = reservation.pago_estado === 'Pagado'
    ? 0
    : Math.max(0, totalAmount - depositAmount);

  // Determinar si la cita realmente requiere anticipo (por inasistencias, franja de apertura 10:00 a 10:30 AM, regla >= $190 o estado)
  const isAnticipoRequired = Boolean(
    hasUnattendedAlert ||
    reservation.requiere_anticipo ||
    reservation.pago_estado === 'pendiente_anticipo' ||
    (expectedDepositAmount > 0 && reservation.pago_estado !== 'Pagado' && !isDepositPaid) ||
    (bookingRules.anticipo_horario_apertura_activo !== false && isOpeningHourTime(reservation.hora_inicio, bookingRules.anticipo_horario_apertura_hora || '10:00', bookingRules.anticipo_horario_apertura_hora_fin || '10:30') && reservation.pago_estado !== 'Pagado' && !isDepositPaid) ||
    (bookingRules.anticipo_monto_minimo_activo !== false && totalAmount >= (Number(bookingRules.anticipo_monto_minimo) || 190) && reservation.pago_estado !== 'Pagado' && !isDepositPaid)
  );

  // Tolerancia de 10 minutos para anticipo
  const rawCreated = reservation.creado_en || (reservation as any).createdAt || (reservation as any).creada_el;
  let createdMs: number | null = null;
  if (typeof (rawCreated as any)?.toMillis === 'function') {
    createdMs = (rawCreated as any).toMillis();
  } else if (typeof (rawCreated as any)?.toDate === 'function') {
    createdMs = (rawCreated as any).toDate().getTime();
  } else if (typeof (rawCreated as any)?.seconds === 'number') {
    createdMs = (rawCreated as any).seconds * 1000;
  } else if (typeof rawCreated === 'string' || typeof rawCreated === 'number') {
    const t = new Date(rawCreated).getTime();
    if (!isNaN(t)) createdMs = t;
  }

  const nowMs = Date.now();
  const diffMinutes = createdMs ? (nowMs - createdMs) / (1000 * 60) : 0;
  const depositMinutesRemaining = createdMs ? Math.max(0, Math.ceil(10 - diffMinutes)) : 10;
  const isDepositExpired = createdMs ? diffMinutes > 10 : false;

  // Auto-sync estado a 'Confirmado' si la cita tiene anticipo pagado pero seguía en 'Reservado' o 'Pendiente de pago'
  const effectiveReservationEstado = (isDepositPaid && (!reservation.estado || reservation.estado === 'Reservado' || reservation.estado === 'Pendiente de pago' || reservation.estado === 'Pendiente de Pago'))
    ? 'Confirmado'
    : (reservation.estado || 'Reservado');

  useEffect(() => {
    if (!isOpen || !reservation?.id || !db) return;
    if (isDepositPaid && (!reservation.estado || reservation.estado === 'Reservado' || reservation.estado === 'Pendiente de pago' || reservation.estado === 'Pendiente de Pago')) {
      const targetCol = (reservation as any).isSandbox ? 'reservas_sandbox' : 'reservas';
      updateDoc(doc(db, targetCol, reservation.id), { estado: 'Confirmado' }).catch(console.error);
    }
  }, [isOpen, reservation?.id, reservation?.estado, isDepositPaid, db]);

  // Manejo de candado de profesional editable (abrir / fijar)
  const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [localLockOverride, setLocalLockOverride] = useState<boolean | null>(null);

  useEffect(() => {
    setLocalLockOverride(null);
  }, [reservation?.id, isOpen]);

  const defaultIsLocked = Boolean(
    reservation.professional_lock !== undefined
      ? reservation.professional_lock
      : (reservation.canal_reserva?.startsWith('web_publica') ||
         reservation.origen?.startsWith('web_publica') ||
         reservation.canal_reserva === 'chatbot' ||
         reservation.origen === 'chatbot')
  );

  const currentIsLocked = localLockOverride !== null ? localLockOverride : defaultIsLocked;

  const handleToggleLock = async () => {
    if (!reservation?.id || !db || isTogglingLock) return;
    const newLockState = !currentIsLocked;
    setIsTogglingLock(true);
    setLocalLockOverride(newLockState);

    try {
      const targetCol = (reservation as any).isSandbox ? 'reservas_sandbox' : 'reservas';
      const resRef = doc(db, targetCol, reservation.id);

      const updatedItems = (reservation.items || []).map((item: any) => ({
        ...item,
        professional_lock: newLockState,
      }));

      await updateDoc(resRef, {
        professional_lock: newLockState,
        items: updatedItems,
      });

      toast({
        title: newLockState ? "Candado cerrado" : "Candado abierto",
        description: newLockState
          ? "El profesional quedó fijado exclusivamente para esta cita."
          : "El candado se abrió. La cita ahora permite reasignación flexible de barbero.",
      });
    } catch (err) {
      console.error("Error toggling professional lock:", err);
      setLocalLockOverride(currentIsLocked);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado del candado.",
      });
    } finally {
      setIsTogglingLock(false);
    }
  };

  // Verificación automática en tiempo real con Mercado Pago si la reserva tiene preferencia o anticipo pendiente
  useEffect(() => {
    if (!isOpen || !reservation?.id) return;
    if (reservation.pago_estado === 'Pagado' || isDepositPaid) return;
    const hasMpLinkOrDeposit = Boolean(
      (reservation as any).mercado_pago_preference_id ||
      reservation.mercado_pago_link ||
      reservation.requiere_anticipo ||
      isAnticipoRequired
    );
    if (!hasMpLinkOrDeposit) return;

    let cancelled = false;
    fetch(`/api/mercado-pago-webhook?reservationId=${encodeURIComponent(reservation.id)}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.verified) {
          toast({
            title: '¡Anticipo Mercado Pago Acreditado!',
            description: `Se verificó el pago de $${Number(data.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN y la cita quedó Confirmada.`,
          });
        }
      })
      .catch(err => console.warn('[MP Verify] Background check error:', err));

    return () => {
      cancelled = true;
    };
  }, [isOpen, reservation?.id, reservation.pago_estado, isDepositPaid, isAnticipoRequired]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent hideCloseButton={true} className="max-w-xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
          {/* HEADER ESTILO VATOS ALFA */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            {/* Haz de luz animado sutil */}
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                {/* Icono izquierdo sin contenedor */}
                <originInfo.icon className="h-5 w-5 text-slate-300 shrink-0" />
                <div className="space-y-0.5">
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2 flex-wrap">
                    <span>Detalle de la Reserva</span>
                    {(reservation as any).isSandbox && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/40 tracking-wider uppercase">
                        Sandbox (Test)
                      </span>
                    )}
                  </DialogTitle>
                  <div className="flex items-center gap-2 text-xs text-slate-300 flex-wrap">
                    <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-[11px] border border-white/10">
                      ID: {reservation.id?.slice(0, 8)}...
                    </span>
                    {currentLocal && (
                      <>
                        <span>•</span>
                        <span className="text-slate-300 font-medium truncate max-w-[150px]">{currentLocal.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Botones de acción y cerrar sin contenedor ni texto */}
              <div className="flex items-center gap-3">
                {onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    disabled={reservation.pago_estado === 'Pagado'}
                    className="p-1 text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Editar cita"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={isSendingEmail}
                  className="p-1 text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Reenviar confirmación por correo"
                  aria-label="Notificar por correo"
                >
                  {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  aria-label="Cerrar modal"
                  title="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* CONTENIDO SCROLLEABLE */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm">

            {/* 1. ORIGEN Y AUDITORÍA DE LA RESERVA (Compacto con iconos interactivos) */}
            <div className={cn("px-3.5 py-2.5 rounded-xl border transition-all text-xs", originInfo.cardBg)}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                  {/* Iconos de Origen y Preferencia de Barbero (Hover o Mantener Presionado) */}
                  <div className="flex items-center gap-2 shrink-0 pr-2 border-r border-border/50">
                    <TooltipProvider delayDuration={100}>
                      <Tooltip open={activeHintId === 'origin'}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onMouseEnter={() => setActiveHintId('origin')}
                            onMouseLeave={() => setActiveHintId(null)}
                            onTouchStart={() => setActiveHintId(prev => prev === 'origin' ? null : 'origin')}
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveHintId(prev => prev === 'origin' ? null : 'origin');
                            }}
                            className="p-1 text-slate-400 hover:text-blue-400 transition-colors cursor-help focus:outline-none"
                            aria-label={originInfo.label}
                            title={originInfo.label}
                          >
                            <originInfo.icon className={cn("w-4 h-4", originInfo.accentColor)} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="border-2 border-blue-500 rounded-xl bg-[#0d1424] text-white text-xs font-semibold px-3 py-1.5 shadow-lg">
                          <p>{originInfo.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* Candado de Preferencia de Profesional (Editable: Clic para abrir o fijar) */}
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleLock();
                            }}
                            disabled={isTogglingLock}
                            className={cn(
                              "p-1 transition-colors cursor-pointer focus:outline-none rounded-md group flex items-center justify-center",
                              currentIsLocked ? "text-slate-400 hover:text-blue-400" : "text-blue-400 hover:text-blue-300"
                            )}
                            aria-label={currentIsLocked ? "Candado cerrado: Clic para abrir" : "Candado abierto: Clic para fijar"}
                            title={currentIsLocked ? "Candado cerrado: Clic para abrir" : "Candado abierto: Clic para fijar"}
                          >
                            {isTogglingLock ? (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                            ) : currentIsLocked ? (
                              <Lock className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
                            ) : (
                              <Unlock className="w-4 h-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="border-2 border-blue-500 rounded-xl bg-[#0d1424] text-white text-xs font-semibold px-3 py-1.5 shadow-lg">
                          <p>
                            {currentIsLocked
                              ? "Candado cerrado: Barbero fijado por cliente (Clic para abrir)"
                              : "Candado abierto: Barbero flexible (Clic para fijar)"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {reservation.confirmada_por_cliente && (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip open={activeHintId === 'wa_confirmed'}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onMouseEnter={() => setActiveHintId('wa_confirmed')}
                              onMouseLeave={() => setActiveHintId(null)}
                              onTouchStart={() => setActiveHintId(prev => prev === 'wa_confirmed' ? null : 'wa_confirmed')}
                              onClick={(e) => {
                                e.preventDefault();
                                setActiveHintId(prev => prev === 'wa_confirmed' ? null : 'wa_confirmed');
                              }}
                              className="p-1 text-blue-400 hover:text-blue-300 transition-colors cursor-help focus:outline-none"
                              aria-label="Confirmada por WhatsApp"
                              title="Confirmada por WhatsApp"
                            >
                              <CheckCircle2 className="w-4 h-4 text-blue-400" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="border-2 border-blue-500 rounded-xl bg-[#0d1424] text-white text-xs font-semibold px-3 py-1.5 shadow-lg">
                            <p>Confirmada por WhatsApp</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {/* Quién agendó y fecha */}
                  <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
                    <User className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span className="text-muted-foreground shrink-0">Agendó:</span>
                    <strong className="text-foreground font-semibold truncate">{originInfo.creator}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  {creationFormattedDate && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                      <strong className="text-foreground font-semibold whitespace-nowrap">
                        {creationFormattedDate.short}
                      </strong>
                    </div>
                  )}

                  <Badge
                    variant={reservation.pago_estado === 'Pagado' || isDepositPaid ? 'default' : 'secondary'}
                    className={cn(
                      "text-[10px] font-bold px-2 py-0.5",
                      reservation.pago_estado === 'Pagado' ? 'bg-blue-600 text-white' :
                        isDepositPaid ? 'bg-[#C5A880] text-black font-semibold' :
                          reservation.estado === 'Cancelado' ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                            'bg-slate-700 text-white dark:bg-slate-800 dark:text-slate-200'
                    )}
                  >
                    {reservation.estado === 'Cancelado' ? 'Cancelada' :
                      (reservation.pago_estado === 'pending_payment' || reservation.pago_estado === 'pending' || reservation.pago_estado === 'pendiente_anticipo') ? 'Pendiente Anticipo' :
                        isDepositPaid ? 'Anticipo Pagado' :
                          reservation.pago_estado === 'Pagado' ? 'Pagada Completa' :
                            reservation.pago_estado || 'Sin Pago'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* 2. FICHA DEL CLIENTE (Simplificada: solo nombre y acceso a Ver Perfil) */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-9 w-9 border border-border shrink-0">
                    <AvatarFallback className="bg-[#1a233a] text-white font-bold text-xs">
                      {clientData?.nombre?.[0] || 'C'}{clientData?.apellido?.[0] || ''}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h4
                      className={cn(
                        "font-bold text-sm text-foreground transition-colors truncate",
                        canViewPhone && onClientClick && reservation.cliente_id && "cursor-pointer hover:text-primary hover:underline"
                      )}
                      onClick={() => canViewPhone && onClientClick && reservation.cliente_id && onClientClick(reservation.cliente_id)}
                    >
                      {formatClientName(clientData?.nombre, clientData?.apellido)}
                    </h4>

                    {isNewClient ? (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] py-0 px-1.5 font-semibold">
                        ⭐ Nuevo
                      </Badge>
                    ) : hasUnattendedAlert ? (
                      <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 text-[10px] py-0 px-1.5 font-bold animate-pulse">
                        🚨 Anticipo Requerido
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] py-0 px-1.5 font-semibold">
                        ✓ Frecuente
                      </Badge>
                    )}
                  </div>
                </div>

                {canViewPhone && onClientClick && reservation.cliente_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 text-xs font-semibold text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg shrink-0"
                    onClick={() => onClientClick(reservation.cliente_id!)}
                  >
                    Ver Perfil
                  </Button>
                )}
              </div>

              {/* Alerta de Escudo Antifraude si tiene inasistencias acumuladas */}
              {hasUnattendedAlert && !isStaff && (
                <div className="p-2.5 rounded-lg border-2 border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1 flex-1">
                    <p className="font-bold uppercase tracking-wide text-[11px]">Escudo Antifraude: Cliente con {unattendedCount} Faltas</p>
                    <p className="text-red-700 dark:text-red-300 leading-snug">
                      Según las reglas de reserva, este cliente debe cubrir un <strong>anticipo obligatorio del {penalizacionPorcentaje}%</strong> para apartar su lugar en la agenda.
                    </p>
                    {reservation.pago_estado !== 'Pagado' && reservation.pago_estado !== 'deposit_paid' && (
                      <div className="pt-1">
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => setIsDepositLinkModalOpen(true)}
                          className="h-7 text-xs font-bold bg-[#202A49] hover:bg-[#18223c] text-white rounded-lg gap-1.5 shadow-xs"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Enviar Enlace SPEI / Mercado Pago
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Alerta de Cita Tentativa en Espera de Anticipo */}
              {isAnticipoRequired && reservation.pago_estado !== 'Pagado' && !isDepositPaid && (
                <div className={cn(
                  "p-3 rounded-xl border-2 flex items-start gap-2.5",
                  isDepositExpired
                    ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200"
                    : "border-blue-500/40 bg-blue-500/10 text-foreground"
                )}>
                  <Clock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1 flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <p className="font-bold uppercase tracking-wide text-[11px] text-blue-400">
                        Cita Tentativa: Esperando Anticipo (${expectedDepositAmount.toFixed(2)} MXN)
                      </p>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap",
                        isDepositExpired
                          ? "bg-red-500/20 text-red-300 border-red-500/40"
                          : "bg-blue-500/20 text-blue-200 border-blue-400/40 animate-pulse"
                      )}>
                        {isDepositExpired ? "Tolerancia 10m Vencida" : `${depositMinutesRemaining} min restantes`}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-snug">
                      Esta cita ocupa la mitad del espacio en la agenda como apartado preliminar. Cuenta con una tolerancia de 10 minutos para recibir y registrar el anticipo. Al confirmarse el pago, pasará al 100% del espacio formal.
                    </p>
                  </div>
                </div>
              )}

              {/* Notas del perfil del cliente si existen */}
              {clientData?.notas && (
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-2 rounded-lg text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-0.5">
                    <Tag className="w-3 h-3 text-slate-500" /> Notas del Cliente (Perfil):
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{clientData.notas}</p>
                </div>
              )}
            </div>

            {/* 3. FECHA, HORA, PROFESIONAL Y SERVICIOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border bg-card space-y-2">
                <p className="font-semibold text-xs flex items-center gap-2 text-foreground uppercase tracking-wider">
                  <CalendarIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" /> Fecha y Horario
                </p>
                <div className="space-y-1 pl-6">
                  <p className="font-bold text-sm text-foreground capitalize">
                    {format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM", { locale: es })}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span>
                      Inicio: <strong className="text-foreground font-semibold">{reservation.hora_inicio || '--:--'}</strong>
                      {' • '}
                      Fin: <strong className="text-foreground font-semibold">{reservation.hora_fin || addMinutesToTimeStr(reservation.hora_inicio, 60)}</strong>
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-0.5">
                    <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                    <strong className="text-foreground">{allProfessionalNames}</strong>
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-xs flex items-center gap-2 text-foreground uppercase tracking-wider">
                    <Scissors className="w-4 h-4 text-slate-600 dark:text-slate-300" /> Servicios ({reservation.items?.length || 1})
                  </p>
                  <span className="text-xs font-bold text-foreground font-sans">
                    ${Number(totalAmount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs max-h-36 overflow-y-auto pr-1">
                  {reservation.items && reservation.items.length > 0 ? (() => {
                    let runningStart = reservation.hora_inicio || '';
                    return reservation.items.map((i, idx) => {
                      const prof = professionals?.find(p => p.id === i.barbero_id);
                      const dur = Number((i as any).duracion) || 60;
                      const itemStart = (i as any).hora_inicio || runningStart || reservation.hora_inicio || '';
                      const itemEnd = (i as any).hora_fin || (reservation.items!.length === 1 && reservation.hora_fin ? reservation.hora_fin : addMinutesToTimeStr(itemStart, dur));
                      runningStart = itemEnd || runningStart;

                      return (
                        <li key={idx} className="flex justify-between items-start py-1 border-b last:border-b-0 border-border/50">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{i.nombre || i.servicio}</span>
                            {itemStart && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>
                                  {itemStart} - {itemEnd}
                                </span>
                              </span>
                            )}
                          </div>
                          {prof && (
                            <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded ml-2 shrink-0">
                              {prof.publicName || prof.name}
                            </span>
                          )}
                        </li>
                      );
                    });
                  })() : (
                    <li className="flex flex-col gap-0.5 py-1">
                      <span className="font-medium text-foreground">{(reservation as any).servicio || 'Servicio General'}</span>
                      {reservation.hora_inicio && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{reservation.hora_inicio} - {reservation.hora_fin || addMinutesToTimeStr(reservation.hora_inicio, 60)}</span>
                        </span>
                      )}
                    </li>
                  )}
                </ul>
              </div>
            </div>

            {/* 4. DESGLOSE FINANCIERO / ANTICIPO */}
            {(depositAmount > 0 || (isAnticipoRequired && expectedDepositAmount > 0) || isDepositPaid || reservation.pago_estado === 'Pagado') && (
              <div className="p-3 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-400" />
                  <div>
                    <span className="font-semibold text-foreground">Total Cita: ${Number(totalAmount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                    {depositAmount > 0 ? (
                      <span className="text-muted-foreground ml-2">
                        (Anticipo pagado: <strong className="text-blue-400">${Number(depositAmount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</strong>)
                      </span>
                    ) : expectedDepositAmount > 0 && isAnticipoRequired ? (
                      <span className="text-muted-foreground ml-2">
                        (Anticipo requerido: <strong className="text-red-400">${Number(expectedDepositAmount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</strong>)
                      </span>
                    ) : null}
                  </div>
                </div>
                {reservation.pago_estado !== 'Pagado' && balancePending > 0 && (
                  <Badge variant="outline" className="border-border bg-muted/50 text-foreground font-bold text-xs">
                    Resta por cobrar: ${Number(balancePending).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                  </Badge>
                )}
              </div>
            )}

            {/* 5. COMUNICACIÓN POR WHATSAPP (Oculto para rol Staff por privacidad del cliente) */}
            {canViewPhone && reservation.customer?.telefono && (
              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" /> Notificaciones WhatsApp
                  </span>
                  {reservation.customer?.correo && reservation.notifications?.email_confirmation_sent && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 text-[10px] py-0 px-2 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Correo enviado
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Si requiere anticipo y no está pagada, mostrar botón prioritario para enviar enlace SPEI */}
                  {isAnticipoRequired && (
                    <div className="flex items-center justify-between bg-muted/40 border border-border/70 p-2.5 rounded-xl text-xs col-span-1 sm:col-span-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <span className="font-bold text-foreground">Enlace de Anticipo (SPEI / MP)</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {reservation.mercado_pago_link ? 'Enlace generado listo para enviar' : 'Generar enlace dinámico con CLABE SPEI'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setIsDepositLinkModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#202A49] hover:bg-[#18223c] text-white shadow-xs transition-all"
                      >
                        <Send className="w-3 h-3" /> Enviar Link
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-card p-2.5 rounded-xl border text-xs">
                    <div className="flex items-center gap-2">
                      <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                      <span className="font-medium text-foreground">Confirmación</span>
                    </div>
                    <Button
                      size="sm"
                      variant="alfa"
                      onClick={() => handleWhatsAppClick('confirmation')}
                      className={cn(
                        "h-7 px-2.5 rounded-lg text-xs font-semibold shadow-xs", 
                        reservation.whatsappConfirmationSent && "opacity-90"
                      )}
                    >
                      {reservation.whatsappConfirmationSent ? <><CheckCircle2 className="w-3 h-3" /> Enviada</> : <><Send className="w-3 h-3" /> Enviar</>}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between bg-card p-2.5 rounded-xl border text-xs">
                    <div className="flex items-center gap-2">
                      <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                      <div className="leading-tight">
                        <span className="font-medium text-foreground">Recordatorio</span>
                        {isShortNotice && !reservation.whatsappReminderSent && (
                          <span className="block text-[9px] text-muted-foreground">
                            Cita de poca anticipación
                          </span>
                        )}
                      </div>
                    </div>
                    {isShortNotice ? (
                      <Button
                        size="sm"
                        disabled
                        variant="outline"
                        className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-muted text-muted-foreground border border-border/70 cursor-not-allowed opacity-80"
                        title="No requerido: cita agendada con poca anticipación"
                      >
                        <CheckCircle2 className="w-3 h-3 text-blue-400" /> No requerido
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="alfa"
                        onClick={() => {
                          if (isReminderDoneOrNotNeeded) return;
                          handleWhatsAppClick('reminder');
                        }}
                        disabled={isReminderDoneOrNotNeeded}
                        className={cn(
                          "h-7 px-2.5 rounded-lg text-xs font-semibold shadow-xs", 
                          reservation.whatsappReminderSent && "opacity-90"
                        )}
                        title={
                          reservation.whatsappReminderSent
                            ? "Recordatorio ya enviado"
                            : "Enviar recordatorio por WhatsApp"
                        }
                      >
                        {reservation.whatsappReminderSent ? (
                          <><CheckCircle2 className="w-3 h-3" /> Enviado</>
                        ) : (
                          <><Send className="w-3 h-3" /> Enviar</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 6. NOTAS INTERNAS O MOTIVO DE CANCELACIÓN */}
            {reservation.estado === 'Cancelado' && (reservation as any).motivo_cancelacion && (
              <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-xs space-y-1">
                <span className="font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Motivo de Cancelación:
                </span>
                <p className="text-red-800 dark:text-red-200 pl-5">{(reservation as any).motivo_cancelacion}</p>
              </div>
            )}

            {reservation.nota_interna && (
              <div className="p-3 rounded-xl border bg-muted/30 text-xs space-y-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> Nota Interna de la Cita:
                </span>
                <p className="text-muted-foreground pl-5 whitespace-pre-wrap">{reservation.nota_interna}</p>
              </div>
            )}

            {/* 7. SELECTOR DE ESTADOS DE AGENDA (Solo círculos de color con texto al pasar el puntero o mantener presionado) */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Estado de la Cita:
                </span>
                <span className="text-xs font-bold text-foreground">
                  {statusOptions.find(s => s.status === effectiveReservationEstado)?.label || effectiveReservationEstado}
                </span>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                {statusOptions.map(({ status, hex, label }) => {
                  const hintKey = `status_${status}`;
                  const isSelected = effectiveReservationEstado === status;
                  return (
                    <TooltipProvider key={status} delayDuration={80}>
                      <Tooltip open={activeHintId === hintKey}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onMouseEnter={() => setActiveHintId(hintKey)}
                            onMouseLeave={() => setActiveHintId(null)}
                            onTouchStart={() => {
                              isLongPressRef.current = false;
                              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = setTimeout(() => {
                                isLongPressRef.current = true;
                                setActiveHintId(hintKey);
                              }, 220);
                            }}
                            onTouchEnd={() => {
                              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                              setTimeout(() => setActiveHintId(null), 1400);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setActiveHintId(hintKey);
                            }}
                            onClick={() => {
                              if (isLongPressRef.current) {
                                isLongPressRef.current = false;
                                return;
                              }
                              if (reservation.pago_estado === 'Pagado') return;
                              if (status === 'Cancelado') {
                                handleCancelClick();
                              } else {
                                onUpdateStatus(reservation.id, status);
                              }
                            }}
                            aria-label={label}
                            title={label}
                            className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center transition-all focus:outline-none',
                              isSelected
                                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background scale-110 shadow-sm'
                                : 'hover:scale-110 opacity-80 hover:opacity-100',
                              reservation.pago_estado === 'Pagado' && 'cursor-not-allowed opacity-40'
                            )}
                          >
                            <span
                              className="rounded-full shrink-0 shadow-xs"
                              style={{
                                backgroundColor: hex,
                                width: '16px',
                                height: '16px',
                                minWidth: '16px',
                                minHeight: '16px',
                                borderRadius: '9999px',
                                display: 'inline-block'
                              }}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="border-2 border-blue-500 rounded-xl bg-[#0d1424] text-white text-xs font-semibold px-3 py-1.5 shadow-lg">
                          <p>{label}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>

          </div>

          {/* FOOTER DE ACCIONES */}
          <DialogFooter className="p-3.5 sm:p-4 border-t border-border/80 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 bg-muted/20">
            <div className="shrink-0">
              {reservation.estado !== 'Cancelado' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelClick}
                  disabled={reservation.pago_estado === 'Pagado' || isDepositPaid}
                  className="rounded-xl text-xs shrink-0 whitespace-nowrap h-9 px-3"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Cancelar Cita
                </Button>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
              {reservation.estado !== 'Cancelado' && reservation.pago_estado !== 'Pagado' && !isDepositPaid && (
                <>
                  {/* SOLO se muestra el botón de Link SPEI si la cita realmente requiere anticipo */}
                  {isAnticipoRequired && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-border/80 hover:bg-muted font-bold text-xs h-9 px-2.5"
                      onClick={() => setIsDepositLinkModalOpen(true)}
                    >
                      <Link2 className="mr-1 h-3.5 w-3.5 text-blue-400" /> Link SPEI
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-border hover:bg-muted font-bold text-xs h-9 px-2.5"
                    onClick={() => setIsDepositModalOpen(true)}
                  >
                    <DollarSign className="mr-1 h-3.5 w-3.5 text-blue-400" /> Registrar Anticipo
                  </Button>
                </>
              )}

              {reservation.estado === 'Cancelado' ? (
                <Button disabled variant="outline" size="sm" className="rounded-xl opacity-60 cursor-not-allowed border-gray-300 text-gray-500 text-xs h-9">
                  <XCircle className="mr-1.5 h-3.5 w-3.5 text-gray-400" />
                  Cita Cancelada
                </Button>
              ) : reservation.pago_estado !== 'Pagado' ? (
                <Button
                  onClick={onPay}
                  size="sm"
                  className="rounded-xl text-xs font-bold transition-all shadow-xs h-9 px-3.5 btn-vatos-alfa"
                >
                  <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                  {isDepositPaid
                    ? `Cobrar Restante ($${balancePending.toFixed(2)})`
                    : `Cobrar Total ($${totalAmount.toFixed(2)})`}
                </Button>
              ) : (
                <Button onClick={handleViewPayment} disabled={isLoadingSale} variant="outline" size="sm" className="rounded-xl text-xs h-9">
                  {isLoadingSale ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
                  Ver Recibo
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RegisterDepositModal
        isOpen={isDepositModalOpen}
        onOpenChange={setIsDepositModalOpen}
        reservation={reservation}
        onConfirmDeposit={async (amount, method, computedTotal) => {
          if (onRegisterDeposit) {
            return await onRegisterDeposit(amount, method, computedTotal);
          }
        }}
      />

      <CancelReservationModal
        isOpen={isCancelModalOpen}
        onOpenChange={setIsCancelModalOpen}
        reservation={reservation}
        onConfirm={handleCancelReservation}
      />

      <SaleDetailModal
        isOpen={isSaleDetailModalOpen}
        onOpenChange={setIsSaleDetailModalOpen}
        sale={saleForReservation}
      />

      <SendConfirmationModal
        isOpen={isDepositLinkModalOpen}
        onOpenChange={setIsDepositLinkModalOpen}
        reservation={reservation}
        forceAnticipoMode={true}
      />
    </>
  );
}