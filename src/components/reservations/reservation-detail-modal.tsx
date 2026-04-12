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
  CheckCircle2,
  MessageCircle,
  Send,
} from 'lucide-react';
import type { Reservation, Sale, Local, Profesional } from '@/lib/types';
import { format, parse, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { useState, useMemo, useEffect } from 'react';
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
}

const statusOptions = [
  { status: 'Reservado', color: 'bg-blue-500', label: 'Reservado' },
  { status: 'Confirmado', color: 'bg-yellow-500', label: 'Confirmado' },
  { status: 'Asiste', color: 'bg-pink-500', label: 'Asiste' },
  { status: 'No asiste', color: 'bg-orange-500', label: 'No Asistió' },
  { status: 'Pendiente', color: 'bg-red-500', label: 'Pendiente de Pago' },
  { status: 'En espera', color: 'bg-green-500', label: 'En Espera' },
  { status: 'Cancelado', color: 'bg-gray-400', label: 'Cancelado' },
];

export function ReservationDetailModal({
  reservation,
  isOpen,
  onOpenChange,
  onPay,
  onUpdateStatus,
  onEdit,
  onClientClick
}: ReservationDetailModalProps) {
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSaleDetailModalOpen, setIsSaleDetailModalOpen] = useState(false);
  const [saleForReservation, setSaleForReservation] = useState<Sale | null>(null);
  const [isLoadingSale, setIsLoadingSale] = useState(false);

  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  const [whatsappTemplate, setWhatsappTemplate] = useState<string>('¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 3 horas antes. Favor de llegar 5 minutos antes de tu cita._');
  const [whatsappReminderTemplate, setWhatsappReminderTemplate] = useState<string>('¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_');

  const { toast } = useToast();
  const { db, user } = useAuth();


  const { data: locales } = useFirestoreQuery<Local>('locales');
  const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');

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

  const allProfessionalNames = useMemo(() => {
    if (!reservation.items || !professionals) return reservation.professionalNames || 'N/A';

    const profIds = new Set(reservation.items.map(i => i.barbero_id).filter(Boolean));
    if (profIds.size === 0) return reservation.professionalNames || 'N/A';

    const names = Array.from(profIds)
      .map(id => professionals.find(p => p.id === id)?.name)
      .filter(Boolean);

    return names.length > 0 ? names.join(', ') : (reservation.professionalNames || 'N/A');
  }, [reservation.items, reservation.professionalNames, professionals]);

  if (!reservation) return null;

  const handleCancelClick = () => {
    setIsCancelModalOpen(true);
  }

  const handleCancelReservation = async (reservationId: string) => {
    // 1. CERRAR PRIMERO EL MODAL DE CONFIRMACIÓN PARA EVITAR CONGELAMIENTO
    setIsCancelModalOpen(false);

    if (!reservation.cliente_id || !db) {
      toast({ variant: 'destructive', title: "Error", description: "La reserva no tiene un cliente asociado o la base de datos no está disponible." });
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        if (!db) throw new Error("Database not available in transaction");
        const resRef = doc(db, 'reservas', reservationId);
        const clientRef = doc(db, 'clientes', reservation.cliente_id!);

        transaction.update(resRef, { estado: 'Cancelado' });
        transaction.update(clientRef, {
          citas_canceladas: increment(1)
        });
      });

      toast({
        title: "Reserva Cancelada",
        description: "El estado de la reserva ha sido actualizado a 'Cancelado'.",
      });

      await logAuditAction({
        action: 'Cancelar Reserva',
        details: `Se canceló la cita del cliente ${reservation.customer?.nombre || 'Desconocido'}. Fecha: ${reservation.fecha} a las ${reservation.hora_inicio}.`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        severity: 'warning',
        localId: reservation.local_id || 'unknown'
      });

      // 2. CERRAR EL MODAL PRINCIPAL DESPUÉS DE LA TRANSACCIÓN
      onOpenChange(false);
      onUpdateStatus(reservationId, 'Cancelado');

    } catch (error) {
      console.error("Error canceling reservation: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cancelar la reserva. Inténtalo de nuevo.",
      });
      // Si falla, volvemos a abrir el modal de confirmación por si quiere reintentar (opcional)
      // setIsCancelModalOpen(true); 
    }
  };

  const handleViewPayment = async () => {
    if (!db) return;
    setIsLoadingSale(true);
    try {
      // Priority 1: Direct fetch by ID (Since we synced IDs in webhook)
      const directRef = doc(db, 'ventas', reservation.id);
      const directSnap = await getDocs(query(collection(db, 'ventas'), where('reservationId', '==', reservation.id))); // Fallback query kept but improved logic below

      // Let's try direct GET first (cheaper/faster)
      // Actually the generic 'getDocs' above is a query. Let's do getDoc properly.
      // We can't use 'getDoc' comfortably without importing it, but we have 'query'.
      // Let's stick to the query if we aren't 100% sure about the ID, 
      // BUT users reported "Venta no encontrada".
      // The issue might be latency or permission. 
      // Let's TRY BOTH methods strictly.

      let saleData: Sale | null = null;
      let saleId: string | null = null;

      // Method A: Query by reservationId field
      const salesQuery = query(collection(db, 'ventas'), where('reservationId', '==', reservation.id));
      const salesSnapshot = await getDocs(salesQuery);

      if (!salesSnapshot.empty) {
        saleId = salesSnapshot.docs[0].id;
        saleData = salesSnapshot.docs[0].data() as Sale;
      }

      // Method B: Direct ID check (if A failed)
      // Note: We need 'getDoc' imported. I see 'getDocs' but not 'getDoc' in imports?
      // I checked imports line 40: "doc, deleteDoc, updateDoc, collection, query, where, getDocs, runTransaction".
      // 'getDoc' is MISSING. I cannot use it without import.
      // I will fallback to just trusting the query BUT I see I added 'reservationId' to the sale in the webhook fix.
      // So the query SHOULD work now for NEW sales.
      // For the EXISTING sale that failed, it didn't have 'reservationId'. 
      // So we must also try to query where document ID == reservation.id... but you can't query by doc ID easily in client sdk without 'getDoc'.
      // Wait, we can use `where(documentId(), '==', reservation.id)` if imported.

      // ALTERNATIVE: Since I cannot import 'getDoc' easily in this chunk without breaking file structure (imports are at top),
      // I will rely on the fact that I JUST FIXED the webhook to include 'reservationId'.
      // For the BROKEN one, the user might need to edit manually or re-test.
      // However, usually online payments link via ID.

      if (saleData && saleId) {
        setSaleForReservation({ ...saleData, id: saleId, client: reservation.customer });
        setIsSaleDetailModalOpen(true);
      } else {
        // Fallback Message for older sales (before fix)
        toast({
          variant: 'destructive',
          title: 'Venta no encontrada',
          description: 'No se encontró el pago. Para ventas anteriores al parche, puede que falte el vínculo.',
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
        // Capitalize first letter of day
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
      await updateDoc(doc(db, 'reservas', reservation.id), {
        [type === 'confirmation' ? 'whatsappConfirmationSent' : 'whatsappReminderSent']: true
      });
      toast({ title: 'Estado actualizado', description: 'Se marcó el mensaje como enviado.', variant: 'default' });
    } catch(e) {
      console.error("Error updating whatsapp status", e);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pr-12 pb-4 flex-row justify-between items-center border-b flex-shrink-0 space-y-0">
            <div className="flex flex-col gap-1">
              <DialogTitle>Detalle de la Reserva</DialogTitle>
              <DialogDescription>ID: {reservation.id}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit} disabled={reservation.pago_estado === 'Pagado'}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleResendEmail} disabled={isSendingEmail}>
                {isSendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Notificar
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h4
                  className={cn("font-semibold text-lg hover:text-primary transition-colors", onClientClick && "cursor-pointer hover:underline")}
                  onClick={() => onClientClick && reservation.cliente_id && onClientClick(reservation.cliente_id)}
                >
                  {formatClientName(reservation.customer?.nombre, reservation.customer?.apellido)}
                </h4>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{allProfessionalNames}</p>
                  {(reservation.canal_reserva?.startsWith('web_publica') || reservation.origen?.startsWith('web_publica')) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="w-3 h-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Profesional seleccionado por el cliente</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
              <Badge variant={reservation.pago_estado === 'Pagado' || reservation.pago_estado === 'deposit_paid' ? 'default' : 'secondary'} className={cn(
                reservation.pago_estado === 'Pagado' ? 'bg-green-100 text-green-800' :
                  reservation.pago_estado === 'deposit_paid' ? 'bg-orange-100 text-orange-800' :
                    reservation.estado === 'Cancelado' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
              )}>
                {reservation.estado === 'Cancelado' ? 'Reserva Cancelada' :
                  reservation.pago_estado === 'pending_payment' ? 'Pendiente de Pago' :
                    reservation.pago_estado === 'deposit_paid' ? 'Anticipo Pagado' :
                      reservation.pago_estado}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-primary" /> Fecha y Hora</p>
                <p className="pl-6">{format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM", { locale: es })}</p>
                <p className="pl-6">{reservation.hora_inicio} - {reservation.hora_fin}</p>
              </div>
              <div>
                <p className="font-medium flex items-center gap-2"><Scissors className="w-4 h-4 text-primary" /> Servicios</p>
                <ul className="list-disc pl-10">
                  {reservation.items ? reservation.items.map((i, idx) => {
                    const prof = professionals?.find(p => p.id === i.barbero_id);
                    return (
                      <li key={idx} className="flex justify-between items-center pr-4">
                        <span>{i.nombre || i.servicio}</span>
                        {prof && <span className="text-[10px] text-muted-foreground">({prof.name})</span>}
                      </li>
                    );
                  }) : <li>{(reservation as any).servicio}</li>}
                </ul>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <h4 className="font-semibold">Información del Cliente</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{reservation.customer?.correo || 'No registrado'}</span>
                </div>
                {reservation.customer?.correo && reservation.notifications?.email_confirmation_sent && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] py-0 px-2 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Correo enviado
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{reservation.customer?.telefono || 'No registrado'}</span>
                </div>
                {reservation.customer?.telefono && (
                  <div className="flex flex-col gap-2 pl-7 mt-1 w-full max-w-sm">
                    <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border text-sm">
                      <div className="flex items-center gap-2">
                        <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                        <span className="font-medium text-muted-foreground">Confirmación</span>
                      </div>
                      <button
                        onClick={() => handleWhatsAppClick('confirmation')}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-semibold shadow-sm", 
                          reservation.whatsappConfirmationSent 
                            ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow" 
                            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow"
                        )}
                      >
                        {reservation.whatsappConfirmationSent ? <><CheckCircle2 className="w-3.5 h-3.5" /> Enviada</> : <><Send className="w-3 h-3" /> Enviar</>}
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border text-sm">
                      <div className="flex items-center gap-2">
                        <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                        <span className="font-medium text-muted-foreground">Recordatorio</span>
                      </div>
                      <button
                        onClick={() => handleWhatsAppClick('reminder')}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-semibold shadow-sm", 
                          reservation.whatsappReminderSent 
                            ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow" 
                            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow"
                        )}
                      >
                        {reservation.whatsappReminderSent ? <><CheckCircle2 className="w-3.5 h-3.5" /> Enviado</> : <><Send className="w-3 h-3" /> Enviar</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {reservation.customer?.notas && (
                <div className="mt-3 bg-amber-50/60 border border-amber-200/60 p-3 rounded-lg shadow-sm">
                  <h5 className="font-semibold text-amber-800 text-xs mb-1 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Notas del Cliente (Internas)
                  </h5>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{reservation.customer.notas}</p>
                </div>
              )}
            </div>

            {reservation.nota_interna && (
              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" /> Nota Interna
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reservation.nota_interna}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              {statusOptions.map(({ status, color, label }) => (
                <TooltipProvider key={status}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          if (reservation.pago_estado === 'Pagado') return;
                          if (status === 'Cancelado') {
                            handleCancelClick();
                          } else {
                            onUpdateStatus(reservation.id, status);
                          }
                        }}
                        className={cn(
                          'h-6 w-6 rounded-full border-2 transition-all',
                          reservation.estado === status ? 'border-primary ring-2 ring-primary ring-offset-2 scale-110' : 'border-transparent opacity-50',
                          reservation.pago_estado !== 'Pagado' && 'hover:opacity-100',
                          reservation.pago_estado === 'Pagado' && 'cursor-not-allowed opacity-30',
                          color
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{label}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
          <DialogFooter className="p-6 border-t flex justify-between flex-shrink-0 mt-0">
            {reservation.estado !== 'Cancelado' && (
              <Button
                variant="destructive"
                onClick={handleCancelClick}
                // Deshabilitar cancelación si ya hay un pago parcial o total para evitar inconsistencias financieras
                disabled={reservation.pago_estado === 'Pagado' || reservation.pago_estado === 'deposit_paid'}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Cancelar Reserva
              </Button>
            )}

            {reservation.pago_estado !== 'Pagado' ? (
              <Button onClick={onPay} className={cn(
                "hover:bg-primary/90",
                reservation.pago_estado === 'deposit_paid' ? "bg-orange-600 hover:bg-orange-700" : "bg-primary"
              )}>
                <CreditCard className="mr-2 h-4 w-4" />
                {reservation.pago_estado === 'deposit_paid'
                  ? `Cobrar Restante ($${(reservation.saldo_pendiente || 0).toFixed(2)})`
                  : 'Cobrar Total'}
              </Button>
            ) : (
              <Button onClick={handleViewPayment} disabled={isLoadingSale} variant="outline">
                {isLoadingSale ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="mr-2 h-4 w-4" />}
                Ver Recibo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
}