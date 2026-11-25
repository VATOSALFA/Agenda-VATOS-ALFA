'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatClientName } from '../agenda/agenda-utils';
import type { Reservation, Local, Profesional } from '@/lib/types';
import {
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Scissors,
  Mail,
  Phone,
  AlertCircle,
  ShieldAlert,
  MessageSquare,
  CreditCard,
  Copy,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhoneForWhatsApp } from '@/lib/phone-utils';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className={className}>
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157.1zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
  </svg>
);

interface SendConfirmationModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  forceAnticipoMode?: boolean;
}

export function SendConfirmationModal({
  reservation,
  isOpen,
  onOpenChange,
  forceAnticipoMode = false,
}: SendConfirmationModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [linkMode, setLinkMode] = useState<'deposit' | 'full'>('deposit');
  const [paymentLinksCache, setPaymentLinksCache] = useState<{ deposit?: string; full?: string }>({});
  const [isGeneratingLink, setIsGeneratingLink] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  const [whatsappTemplate, setWhatsappTemplate] = useState<string>(
    '¡Hola *{nombre}*, tu cita está agendada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\nAgradecemos tu puntualidad y asistencia.\nEn caso de llegar después y tener clientes en espera, la cita podrá reprogramarse según disponibilidad.\n\n¡Te esperamos 💈!\nvatosalfa.com\n\nhttps://vatosalfa.com/terminos\nhttps://vatosalfa.com/privacidad'
  );

  const [whatsappAnticipoTemplate, setWhatsappAnticipoTemplate] = useState<string>(
    '¡Hola *{nombre}*! 👋\n\n💈 *Cita:* {servicios} con {profesional}\n📅 *Fecha:* {fecha} a las {hora}\n\nPara confirmar tu espacio, realiza tu anticipo de *${monto_anticipo} MXN* (SPEI o tarjeta) aquí:\n{link_pago}\n\n⏳ *Importante:* Este enlace tiene una vigencia de *30 minutos* para confirmar tu lugar; pasado ese tiempo el horario se libera automáticamente.'
  );

  const { data: locales } = useFirestoreQuery<Local>('locales');
  const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');

  // Check if deposit is required
  const isDepositRequired = useMemo(() => {
    if (!reservation) return false;
    if (forceAnticipoMode) return true;
    if (reservation.requiere_anticipo) return true;
    if (reservation.pago_estado === 'pendiente_anticipo' || reservation.pago_estado === 'pending_payment') return true;
    const isPaid =
      reservation.pago_estado === 'Pagado' ||
      reservation.pago_estado === 'deposit_paid' ||
      reservation.pago_estado === 'anticipo_pagado';
    if (!isPaid && (((reservation as any).anticipo_esperado || 0) > 0 || (reservation.monto_anticipo || 0) > 0)) return true;
    return false;
  }, [reservation, forceAnticipoMode]);

  const servicesSignature = useMemo(() => {
    if (!reservation) return '';
    if (reservation.items && reservation.items.length > 0) {
      return reservation.items.map((i: any) => i.nombre || i.servicio).filter(Boolean).join(', ').trim();
    }
    return String((reservation as any).servicio || 'Servicio de Barbería').trim();
  }, [reservation]);

  const totalReservationAmount = useMemo(() => {
    if (!reservation) return 0;
    const itemsSum = Array.isArray(reservation.items)
      ? reservation.items.reduce((acc, it: any) => acc + Number(it.precio || it.price || 0) * Number(it.cantidad || 1), 0)
      : 0;
    return Number(reservation.precio || itemsSum || reservation.total || 0);
  }, [reservation]);

  const depositAmount = useMemo(() => {
    if (!reservation) return 0;
    if ((reservation as any).anticipo_esperado && (reservation as any).anticipo_esperado > 0) {
      return Number((reservation as any).anticipo_esperado);
    }
    if (reservation.monto_anticipo && reservation.monto_anticipo > 0) {
      return Number(reservation.monto_anticipo);
    }
    return Math.round(totalReservationAmount * 0.5) || 200;
  }, [reservation, totalReservationAmount]);

  const canSwitchToFullLink = isDepositRequired && totalReservationAmount > depositAmount + 0.01;
  const activeChargeAmount = (linkMode === 'full' && canSwitchToFullLink) ? totalReservationAmount : depositAmount;
  const shortPaymentLink = useMemo(() => {
    if (!reservation?.id) return '';
    const amountTag = Math.round(Number(activeChargeAmount || 0));
    return linkMode === 'full' && canSwitchToFullLink
      ? `https://vatosalfa.com/p/${reservation.id}?m=full&v=${amountTag}`
      : `https://vatosalfa.com/p/${reservation.id}?v=${amountTag}`;
  }, [reservation?.id, linkMode, canSwitchToFullLink, activeChargeAmount]);
  const paymentLink = shortPaymentLink || (linkMode === 'full' ? (paymentLinksCache.full || '') : (paymentLinksCache.deposit || ''));

  useEffect(() => {
    if (isOpen && reservation) {
      setLinkMode('deposit');
      const resAny = reservation as any;
      const cachedDepAmt = Number(resAny?.mercado_pago_link_amount || 0);
      const cachedDepSrv = String(resAny?.mercado_pago_link_services || '').trim();
      const cachedDepTs = Number(resAny?.mercado_pago_link_ts || 0);
      const isDepositLinkFresh =
        Boolean(resAny?.mercado_pago_link) &&
        cachedDepAmt > 0 &&
        Math.abs(cachedDepAmt - depositAmount) < 0.01 &&
        Boolean(cachedDepSrv) &&
        cachedDepSrv === servicesSignature &&
        cachedDepTs > 0 &&
        Date.now() - cachedDepTs < 25 * 60 * 1000;

      const cachedFullAmt = Number(resAny?.mercado_pago_link_total_amount || 0);
      const cachedFullSrv = String(resAny?.mercado_pago_link_total_services || '').trim();
      const cachedFullTs = Number(resAny?.mercado_pago_link_total_ts || 0);
      const isFullLinkFresh =
        Boolean(resAny?.mercado_pago_link_total) &&
        cachedFullAmt > 0 &&
        Math.abs(cachedFullAmt - totalReservationAmount) < 0.01 &&
        Boolean(cachedFullSrv) &&
        cachedFullSrv === servicesSignature &&
        cachedFullTs > 0 &&
        Date.now() - cachedFullTs < 25 * 60 * 1000;

      setPaymentLinksCache({
        deposit: isDepositLinkFresh ? resAny.mercado_pago_link : undefined,
        full: isFullLinkFresh ? resAny.mercado_pago_link_total : undefined,
      });
    }
  }, [isOpen, reservation?.id, depositAmount, totalReservationAmount, servicesSignature]);

  useEffect(() => {
    if (isOpen && db) {
      getDoc(doc(db, 'configuracion', 'whatsapp'))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const confTpl = data?.whatsappMessageTemplate || data?.whatsappConfirmationTemplate || data?.whatsappTemplate;
            if (confTpl) {
              setWhatsappTemplate(confTpl);
            }
            if (data?.whatsappAnticipoTemplate) {
              setWhatsappAnticipoTemplate(data.whatsappAnticipoTemplate);
            }
          }
        })
        .catch(console.error);

      setWhatsappSent(reservation?.whatsappConfirmationSent || false);
    }
  }, [isOpen, db, reservation]);

  // Pre-warm Mercado Pago Preference Link in background without blocking the UI
  useEffect(() => {
    if (!isOpen || !reservation || !isDepositRequired) return;

    const currentMode = (linkMode === 'full' && canSwitchToFullLink) ? 'full' : 'deposit';
    if (currentMode === 'deposit' && paymentLinksCache.deposit) return;
    if (currentMode === 'full' && paymentLinksCache.full) return;

    let isMounted = true;
    const generateLink = async () => {
      if (!reservation.id) setIsGeneratingLink(true);
      try {
        let servicesText = '';
        if (reservation.items && reservation.items.length > 0) {
          servicesText = reservation.items.map((i: any) => i.nombre || i.servicio).join(', ');
        } else {
          servicesText = (reservation as any).servicio || 'Servicio de Barbería';
        }

        const clientName = reservation.customer?.nombre || (reservation as any).cliente_nombre || 'Cliente';
        const clientLastName = reservation.customer?.apellido || '';
        const clientEmail = reservation.customer?.correo || (reservation as any).cliente_email || '';
        const clientPhone = reservation.customer?.telefono || (reservation as any).cliente_telefono || '';
        const targetAmount = currentMode === 'full' ? totalReservationAmount : depositAmount;

        const res = await fetch('/api/mercadopago/preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservationId: reservation.id,
            items: [
              {
                id: currentMode === 'full' ? 'full_payment' : 'deposit',
                title: `${currentMode === 'full' ? 'Pago Total Cita' : 'Anticipo Cita'} - ${servicesText}`,
                quantity: 1,
                unit_price: targetAmount,
              },
            ],
            payer: {
              name: clientName,
              lastName: clientLastName,
              email: clientEmail,
              phone: clientPhone,
            },
          }),
        });

        const data = await res.json();
        if (isMounted && data.init_point) {
          setPaymentLinksCache((prev) => ({
            ...prev,
            [currentMode]: data.init_point,
          }));
          if (db && reservation.id) {
            await updateDoc(doc(db, 'reservas', reservation.id), {
              ...(currentMode === 'full'
                ? {
                    mercado_pago_link_total: data.init_point,
                    mercado_pago_preference_id_total: data.id,
                    mercado_pago_link_total_ts: Date.now(),
                    mercado_pago_link_total_amount: targetAmount,
                    mercado_pago_link_total_services: servicesText.trim(),
                  }
                : {
                    mercado_pago_link: data.init_point,
                    link_pago: data.init_point,
                    mercado_pago_preference_id: data.id,
                    mercado_pago_link_ts: Date.now(),
                    mercado_pago_link_amount: targetAmount,
                    mercado_pago_link_services: servicesText.trim(),
                  }),
              anticipo_esperado: depositAmount,
              requiere_anticipo: true,
            }).catch(console.error);
          }
        }
      } catch (err: any) {
        console.error('Failed to pre-warm MP preference:', err);
      } finally {
        if (isMounted) setIsGeneratingLink(false);
      }
    };

    generateLink();

    return () => {
      isMounted = false;
    };
  }, [isOpen, reservation, isDepositRequired, depositAmount, totalReservationAmount, linkMode, canSwitchToFullLink, paymentLinksCache.deposit, paymentLinksCache.full, db, toast]);

  const allProfessionalNames = useMemo(() => {
    if (!professionals) return reservation?.professionalNames || 'Profesional';
    const profIds = new Set<string>();
    if (reservation?.items && reservation.items.length > 0) {
      reservation.items.forEach((i) => {
        if (i.barbero_id) profIds.add(i.barbero_id);
      });
    }
    if (profIds.size === 0 && reservation?.barbero_id) {
      profIds.add(reservation.barbero_id);
    }
    if (profIds.size === 0) return reservation?.professionalNames || 'Profesional';
    const names = Array.from(profIds)
      .map((id) => {
        const prof = professionals.find((p) => p.id === id);
        return prof?.publicName || prof?.name;
      })
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : (reservation?.professionalNames || 'Profesional');
  }, [reservation?.items, reservation?.barbero_id, reservation?.professionalNames, professionals]);

  if (!reservation) return null;

  const clientPhone = reservation.customer?.telefono || (reservation as any).cliente_telefono || '';
  const clientName = formatClientName(
    reservation.customer?.nombre || (reservation as any).cliente_nombre,
    reservation.customer?.apellido
  );

  const generateMessage = () => {
    if (!reservation) return '';
    let servicesText = '';
    if (reservation.items && reservation.items.length > 0) {
      servicesText = reservation.items.map((i: any) => i.nombre || i.servicio).join(', ');
    } else {
      servicesText = (reservation as any).servicio || 'Servicio';
    }

    let dateStr = reservation.fecha;
    try {
      if (reservation.fecha) {
        dateStr = format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM, yyyy", { locale: es });
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      }
    } catch (e) {}

    const local = locales?.find((l) => l.id === reservation.local_id);
    const locationStr = local ? `${local.name} (${local.address})` : 'VATOS ALFA Barber Shop';

    if (isDepositRequired) {
      const activeLink = paymentLink || (isGeneratingLink ? '[Generando enlace de pago SPEI...]' : '');
      const formattedAmount = Number(activeChargeAmount || 0).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      let msg = whatsappAnticipoTemplate
        .replace(/{nombre}/gi, clientName)
        .replace(/{cliente}/gi, clientName)
        .replace(/{servicios}/gi, servicesText)
        .replace(/{servicio}/gi, servicesText)
        .replace(/{fecha}/gi, dateStr)
        .replace(/{hora}/gi, reservation.hora_inicio || '')
        .replace(/{horario}/gi, reservation.hora_inicio || '')
        .replace(/{profesional}/gi, allProfessionalNames)
        .replace(/{barbero}/gi, allProfessionalNames)
        .replace(/{ubicacion}/gi, locationStr)
        .replace(/{sucursal}/gi, locationStr)
        .replace(/{monto_anticipo}/gi, formattedAmount)
        .replace(/{link_pago}/gi, activeLink);

      if (linkMode === 'full' && canSwitchToFullLink) {
        msg = msg.replace(/tu anticipo de/gi, 'tu pago total de');
      }
      if (
        !/(30 minutos|vigencia|tolerancia)/i.test(msg) &&
        !(reservation as any).tolerancia_anticipo_extendida
      ) {
        msg +=
          '\n\n⏳ *Importante:* Este enlace tiene una vigencia de *30 minutos* para confirmar tu lugar; pasado ese tiempo el horario se libera automáticamente.';
      }
      return msg;
    }

    return whatsappTemplate
      .replace(/{nombre}/gi, clientName)
      .replace(/{cliente}/gi, clientName)
      .replace(/{servicios}/gi, servicesText)
      .replace(/{servicio}/gi, servicesText)
      .replace(/{fecha}/gi, dateStr)
      .replace(/{hora}/gi, reservation.hora_inicio || '')
      .replace(/{horario}/gi, reservation.hora_inicio || '')
      .replace(/{profesional}/gi, allProfessionalNames)
      .replace(/{barbero}/gi, allProfessionalNames)
      .replace(/{ubicacion}/gi, locationStr)
      .replace(/{sucursal}/gi, locationStr);
  };

  const previewMessageText = generateMessage();

  const handleCopyLink = () => {
    if (!paymentLink) return;
    navigator.clipboard.writeText(paymentLink);
    setLinkCopied(true);
    toast({
      title: '¡Enlace Copiado!',
      description: 'El enlace de pago Mercado Pago (SPEI/Tarjeta) fue copiado.',
    });
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleSendWhatsApp = async () => {
    if (!clientPhone || !db) return;
    const formattedPhone = formatPhoneForWhatsApp(clientPhone);
    const message = generateMessage();

    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');

    try {
      if (reservation.id) {
        await updateDoc(doc(db, 'reservas', reservation.id), {
          whatsappConfirmationSent: true,
        });
      }
      setWhatsappSent(true);
      toast({
        title: isDepositRequired ? 'Enlace de Anticipo Enviado' : 'Confirmación Enviada',
        description: 'Se abrió WhatsApp y la cita quedó registrada.',
      });
    } catch (e) {
      console.error('Error updating whatsapp confirmation flag:', e);
      setWhatsappSent(true);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !whatsappSent && clientPhone && !linkCopied) {
      return;
    }
    onOpenChange(open);
  };

  const canDismiss = whatsappSent || !clientPhone || linkCopied;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton={true}
        onPointerDownOutside={(e) => {
          if (!canDismiss) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (!canDismiss) {
            e.preventDefault();
          }
        }}
        className="w-[96vw] sm:max-w-3xl lg:max-w-4xl max-h-[92dvh] p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background flex flex-col"
      >
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              {isDepositRequired ? (
                <ShieldAlert className="w-4 h-4 text-[#C5A880] shrink-0" />
              ) : (
                <MessageSquare className="w-4 h-4 text-slate-300 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide leading-tight">
                    {isDepositRequired ? 'Solicitud de Anticipo' : 'Enviar Confirmación'}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="border-white/20 bg-white/10 text-slate-200 text-[10px] px-1.5 py-0 font-bold uppercase tracking-wider"
                  >
                    {isDepositRequired ? 'SPEI / Tarjeta' : 'Paso Obligatorio'}
                  </Badge>
                </div>
                <DialogDescription className="text-[11px] text-slate-300 hidden sm:block">
                  {isDepositRequired
                    ? 'Enlace dinámico para apartar la cita'
                    : 'Notifica al cliente para asegurar su cita'}
                </DialogDescription>
              </div>
            </div>

            {canDismiss && (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="p-3.5 sm:p-4 flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
            {/* COLUMNA IZQUIERDA: Resumen, Enlace SPEI/MP y Correo */}
            <div className="space-y-3">
              <div className="bg-muted/40 rounded-xl p-3 border border-border/60 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{clientName}</span>
                  </span>
                  {clientPhone ? (
                    <Badge variant="secondary" className="font-sans text-xs flex items-center gap-1 shrink-0">
                      <Phone className="w-3 h-3 text-[#25D366]" />
                      {clientPhone}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px] shrink-0">
                      Sin teléfono
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1.5 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{reservation.fecha}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="font-medium text-foreground">{reservation.hora_inicio || '00:00'} hrs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">
                      {reservation.items?.map((i) => i.nombre || i.servicio).join(', ') ||
                        (reservation as any).servicio ||
                        'Servicio'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{allProfessionalNames}</span>
                  </div>
                </div>
              </div>

              {isDepositRequired && (
                <div className="bg-gradient-to-br from-[#10172b]/50 via-[#1c2847]/30 to-[#10172b]/50 border border-blue-500/35 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="font-bold text-xs text-foreground font-sans">
                          {linkMode === 'full' && canSwitchToFullLink ? 'Liquidar Total:' : 'Anticipo Requerido:'}{' '}
                          <span className="text-blue-400 font-extrabold">
                            ${Number(activeChargeAmount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                          </span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Transferencia SPEI (18 dígitos) o Tarjeta
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-sans text-[10px] tracking-wide">
                      Mercado Pago
                    </Badge>
                  </div>

                  {canSwitchToFullLink && (
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-background/60 border border-border/60">
                      <button
                        type="button"
                        onClick={() => setLinkMode('deposit')}
                        className={cn(
                          'py-1.5 px-2 rounded-md text-[11px] font-semibold font-sans transition-all cursor-pointer',
                          linkMode === 'deposit'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Anticipo (${Number(depositAmount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkMode('full')}
                        className={cn(
                          'py-1.5 px-2 rounded-md text-[11px] font-semibold font-sans transition-all cursor-pointer',
                          linkMode === 'full'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Liquidar Total (${Number(totalReservationAmount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        readOnly
                        value={
                          isGeneratingLink
                            ? 'Generando enlace único con SPEI...'
                            : paymentLink || 'Error al generar enlace'
                        }
                        className="w-full bg-background border border-border/70 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-foreground truncate pr-8 select-all focus:outline-none"
                      />
                      {isGeneratingLink && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 absolute right-2.5 top-2" />
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCopyLink}
                      disabled={!paymentLink || isGeneratingLink}
                      className="h-8 text-xs font-semibold px-2.5 gap-1 shrink-0 border-border/70 hover:bg-muted text-foreground rounded-lg"
                    >
                      {linkCopied ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </Button>

                    {paymentLink && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(paymentLink, '_blank')}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                        title="Abrir enlace de pago"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <p className="text-[10.5px] text-muted-foreground leading-tight bg-muted/40 p-2 rounded-lg border border-border/60">
                    ⚡ <strong>Confirmación Automática:</strong> Al transferir a la CLABE o pagar con tarjeta, la cita pasa a <strong>Confirmada / Anticipo Pagado</strong> de inmediato.
                  </p>
                </div>
              )}

              {reservation.customer?.correo && (
                <div className="flex items-center justify-between bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900 rounded-xl px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span className="truncate">{reservation.customer.correo}</span>
                  </div>
                  <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300 text-[10px] bg-blue-100/50 shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Correo enviado
                  </Badge>
                </div>
              )}

              {!whatsappSent && clientPhone && (
                <div className="border rounded-xl p-2.5 flex items-start gap-2 text-xs bg-muted/40 border-border/70 text-foreground">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <p className="font-bold">
                      {isDepositRequired ? 'Enviar enlace para apartar la cita' : 'Paso obligatorio para continuar'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {isDepositRequired
                        ? 'Envía el mensaje por WhatsApp para que el cliente reciba su enlace de pago.'
                        : 'Para asegurar la cita y evitar inasistencias, envía la confirmación por WhatsApp.'}
                    </p>
                  </div>
                </div>
              )}

              {whatsappSent && clientPhone && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-2.5 flex items-start gap-2 text-xs text-blue-900 dark:text-blue-200 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-foreground">
                      {isDepositRequired ? '¡Enlace de anticipo enviado!' : '¡Confirmación enviada!'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {isDepositRequired
                        ? 'Al recibir el pago por SPEI o tarjeta se confirmará la cita automáticamente.'
                        : 'Se ha abierto WhatsApp y la cita quedó registrada como confirmada.'}
                    </p>
                  </div>
                </div>
              )}

              {!clientPhone && (
                <div className="bg-muted/40 border border-border/70 p-2.5 rounded-xl flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Sin teléfono registrado</p>
                    <p className="text-[11px] text-muted-foreground">
                      Puedes copiar el enlace de pago arriba para compartírselo.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA: Vista Previa del Mensaje WhatsApp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                <span className="font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  Mensaje para WhatsApp:
                </span>
                {whatsappSent && (
                  <span className="text-blue-400 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Enviado
                  </span>
                )}
              </div>

              <div className="relative bg-[#efeae2] dark:bg-[#111b21] p-3 rounded-xl border border-border/80 shadow-inner max-h-[340px] overflow-y-auto">
                <div className="bg-white dark:bg-[#202c33] p-3 rounded-lg rounded-tl-none shadow-sm text-xs leading-relaxed text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap font-sans border border-black/5">
                  {previewMessageText}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-4 py-2.5 sm:px-5 sm:py-3 bg-muted/30 border-t border-border/60 flex flex-col sm:flex-row gap-2 shrink-0">
          {!clientPhone ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto sm:ml-auto h-9 px-5 text-xs font-bold btn-vatos-alfa rounded-xl"
            >
              Continuar a la Agenda
            </Button>
          ) : !whatsappSent ? (
            <div className="w-full flex flex-col sm:flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto h-9 text-xs text-muted-foreground hover:text-foreground order-2 sm:order-1"
              >
                Cerrar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSendWhatsApp}
                disabled={isDepositRequired && isGeneratingLink}
                className="w-full sm:w-auto font-bold gap-2 text-xs h-9 px-5 rounded-xl shadow-md hover:shadow-lg transition-all text-white bg-[#25D366] hover:bg-[#20ba59] order-1 sm:order-2"
              >
                {isGeneratingLink ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generando Enlace...</span>
                  </>
                ) : (
                  <>
                    <WhatsAppIcon className="w-4 h-4" />
                    <span>{isDepositRequired ? 'Enviar Enlace por WhatsApp' : 'Enviar Confirmación por WhatsApp'}</span>
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="w-full flex flex-col sm:flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendWhatsApp}
                className="w-full sm:w-auto h-9 text-xs gap-1.5 border-border/80 hover:bg-muted text-foreground rounded-xl"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
                <span>Volver a Enviar</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto h-9 px-5 btn-vatos-alfa font-bold text-xs gap-1.5 shadow-md rounded-xl"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Continuar a la Agenda</span>
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
