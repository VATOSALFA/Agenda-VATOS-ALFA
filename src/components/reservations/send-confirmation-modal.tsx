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
  const [paymentLink, setPaymentLink] = useState<string>('');
  const [isGeneratingLink, setIsGeneratingLink] = useState<boolean>(false);
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  const [whatsappTemplate, setWhatsappTemplate] = useState<string>(
    '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 3 horas antes. Favor de llegar 5 minutos antes de tu cita._'
  );

  const [whatsappAnticipoTemplate, setWhatsappAnticipoTemplate] = useState<string>(
    '¡Hola *{nombre}*! 👋\n\nTu cita ha sido agendada con éxito:\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n⚠️ *Anticipo requerido para confirmar:*\nPara apartar y asegurar tu lugar en la agenda, es necesario realizar tu anticipo de *${monto_anticipo} MXN*.\n\n💳 *Paga fácilmente con Transferencia SPEI o Tarjeta aquí:*\n{link_pago}\n\nℹ️ _Instrucciones SPEI:_ Al abrir el enlace y elegir "Transferencia", Mercado Pago te generará una CLABE interbancaria única de 18 dígitos para transferir desde tu banca móvil. Tu cita se confirmará en automático al recibir tu pago.\n\n¡Te esperamos en Vatos Alfa!'
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

  const depositAmount = useMemo(() => {
    if (!reservation) return 0;
    if ((reservation as any).anticipo_esperado && (reservation as any).anticipo_esperado > 0) {
      return Number((reservation as any).anticipo_esperado);
    }
    if (reservation.monto_anticipo && reservation.monto_anticipo > 0) {
      return Number(reservation.monto_anticipo);
    }
    const total = Number(reservation.total || reservation.precio || 0);
    return Math.round(total * 0.5) || 200;
  }, [reservation]);

  useEffect(() => {
    if (isOpen && db) {
      getDoc(doc(db, 'configuracion', 'whatsapp'))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.whatsappMessageTemplate) {
              setWhatsappTemplate(data.whatsappMessageTemplate);
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

  // Generate or load Mercado Pago Preference Link
  useEffect(() => {
    if (!isOpen || !reservation || !isDepositRequired) return;

    if (reservation.mercado_pago_link) {
      setPaymentLink(reservation.mercado_pago_link);
      return;
    }

    let isMounted = true;
    const generateLink = async () => {
      setIsGeneratingLink(true);
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

        const res = await fetch('/api/mercadopago/preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservationId: reservation.id,
            items: [
              {
                title: `Anticipo Cita - ${servicesText}`,
                quantity: 1,
                unit_price: depositAmount,
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
        if (isMounted) {
          if (data.init_point) {
            setPaymentLink(data.init_point);
            if (db && reservation.id) {
              await updateDoc(doc(db, 'reservas', reservation.id), {
                mercado_pago_link: data.init_point,
                mercado_pago_preference_id: data.id,
                anticipo_esperado: depositAmount,
                requiere_anticipo: true,
              }).catch(console.error);
            }
          } else {
            console.error('Error in MP preference response:', data);
            toast({
              variant: 'destructive',
              title: 'Error de Enlace de Pago',
              description: data.error || 'No se pudo generar el enlace de Mercado Pago.',
            });
          }
        }
      } catch (err: any) {
        console.error('Failed to create MP preference:', err);
      } finally {
        if (isMounted) setIsGeneratingLink(false);
      }
    };

    generateLink();

    return () => {
      isMounted = false;
    };
  }, [isOpen, reservation, isDepositRequired, depositAmount, db, toast]);

  const allProfessionalNames = useMemo(() => {
    if (!reservation?.items || !professionals) return reservation?.professionalNames || 'Profesional';
    const profIds = new Set(reservation.items.map((i) => i.barbero_id).filter(Boolean));
    if (profIds.size === 0) return reservation.professionalNames || 'Profesional';
    const names = Array.from(profIds)
      .map((id) => professionals.find((p) => p.id === id)?.name)
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : (reservation.professionalNames || 'Profesional');
  }, [reservation?.items, reservation?.professionalNames, professionals]);

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
      return whatsappAnticipoTemplate
        .replace(/{nombre}/g, clientName)
        .replace(/{servicios}/g, servicesText)
        .replace(/{fecha}/g, dateStr)
        .replace(/{hora}/g, reservation.hora_inicio || '')
        .replace(/{profesional}/g, allProfessionalNames)
        .replace(/{ubicacion}/g, locationStr)
        .replace(/{monto_anticipo}/g, String(depositAmount))
        .replace(/{link_pago}/g, activeLink);
    }

    return whatsappTemplate
      .replace(/{nombre}/g, clientName)
      .replace(/{servicios}/g, servicesText)
      .replace(/{fecha}/g, dateStr)
      .replace(/{hora}/g, reservation.hora_inicio || '')
      .replace(/{profesional}/g, allProfessionalNames)
      .replace(/{ubicacion}/g, locationStr);
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
        className="max-w-md p-0 overflow-hidden sm:rounded-2xl border border-slate-800 shadow-2xl bg-background flex flex-col"
      >
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          {/* Haz de luz animado en diagonal */}
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              {isDepositRequired ? (
                <ShieldAlert className="w-5 h-5 text-[#C5A880] shrink-0" />
              ) : (
                <MessageSquare className="w-5 h-5 text-slate-300 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    {isDepositRequired ? 'Solicitud de Anticipo' : 'Enviar Confirmación'}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="border-white/20 bg-white/10 text-slate-200 text-[10px] px-1.5 py-0 font-bold uppercase tracking-wider"
                  >
                    {isDepositRequired ? 'SPEI / Tarjeta' : 'Paso Obligatorio'}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-slate-300 mt-0.5 truncate max-w-[260px] sm:max-w-xs">
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
                className="p-1 text-slate-300 hover:text-white transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Reservation Summary Card */}
          <div className="bg-muted/40 rounded-xl p-3.5 border space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <User className="w-4 h-4 text-primary" />
                {clientName}
              </span>
              {clientPhone ? (
                <Badge variant="secondary" className="font-mono text-xs flex items-center gap-1">
                  <Phone className="w-3 h-3 text-[#25D366]" />
                  {clientPhone}
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  Sin teléfono
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                <span className="truncate">{reservation.fecha}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                <span className="font-medium text-foreground">{reservation.hora_inicio || '00:00'} hrs</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                <span className="truncate">
                  {reservation.items?.map((i) => i.nombre || i.servicio).join(', ') ||
                    (reservation as any).servicio ||
                    'Servicio'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                <span className="truncate">{allProfessionalNames}</span>
              </div>
            </div>
          </div>

          {/* DEDICATED MERCADO PAGO / SPEI BOX IF DEPOSIT REQUIRED */}
          {isDepositRequired && (
            <div className="bg-gradient-to-br from-[#10172b]/50 via-[#1c2847]/30 to-[#10172b]/50 border-2 border-blue-500/30 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-xs text-foreground">
                      Anticipo Requerido: <span className="text-blue-400 font-extrabold">${depositAmount} MXN</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Transferencia SPEI (18 dígitos) o Tarjeta
                    </p>
                  </div>
                </div>
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-[10px] tracking-wide">
                  Mercado Pago
                </Badge>
              </div>

              {/* Payment Link Display & Copy Actions */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
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
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 absolute right-2.5 top-2.5" />
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  disabled={!paymentLink || isGeneratingLink}
                  className="h-8 text-xs font-semibold px-2.5 gap-1 shrink-0 border-border/70 hover:bg-muted text-foreground"
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
                ⚡ <strong>Confirmación 100% Automática:</strong> Al transferir a la CLABE de 18 dígitos o pagar con tarjeta, Mercado Pago notifica al sistema vía Webhook y la cita pasa a <strong>Confirmada / Anticipo Pagado</strong> de inmediato.
              </p>
            </div>
          )}

          {/* Email Auto-Notification Badge if client has email */}
          {reservation.customer?.correo && (
            <div className="flex items-center justify-between bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900 rounded-lg px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
              <div className="flex items-center gap-2 truncate">
                <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="truncate">{reservation.customer.correo}</span>
              </div>
              <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300 text-[10px] bg-blue-100/50">
                <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Correo enviado
              </Badge>
            </div>
          )}

          {/* WhatsApp Chat Preview Bubble */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-medium flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                Mensaje que se enviará por WhatsApp:
              </span>
              {whatsappSent && (
                <span className="text-blue-400 font-bold flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enviado
                </span>
              )}
            </div>

            <div className="relative bg-[#efeae2] dark:bg-[#111b21] p-3.5 rounded-xl border border-border/80 shadow-inner">
              {/* Simulated WhatsApp message bubble */}
              <div className="bg-white dark:bg-[#202c33] p-3 rounded-lg rounded-tl-none shadow-sm text-xs leading-relaxed text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap font-sans border border-black/5">
                {previewMessageText}
              </div>
            </div>
          </div>

          {/* Notice banner depending on status */}
          {!whatsappSent && clientPhone && (
            <div
              className={cn(
                'border rounded-xl p-3 flex items-start gap-2.5 text-xs',
                isDepositRequired
                  ? 'bg-muted/40 border-border/70 text-foreground'
                  : 'bg-muted/40 border-border/70 text-foreground'
              )}
            >
              <AlertCircle
                className={cn(
                  'w-4 h-4 flex-shrink-0 mt-0.5',
                  isDepositRequired ? 'text-blue-400' : 'text-blue-400'
                )}
              />
              <div>
                <p className="font-bold">
                  {isDepositRequired ? 'Enviar enlace para apartar la cita' : 'Paso obligatorio para continuar'}
                </p>
                <p className="text-[11px] opacity-90 mt-0.5 leading-snug">
                  {isDepositRequired
                    ? 'Envía el mensaje por WhatsApp para que el cliente reciba su enlace de pago y realice la transferencia SPEI.'
                    : 'Para asegurar la cita y evitar inasistencias en la agenda, debes enviar la confirmación por WhatsApp.'}
                </p>
              </div>
            </div>
          )}

          {whatsappSent && clientPhone && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-foreground">
                  {isDepositRequired ? '¡Enlace de anticipo enviado!' : '¡Confirmación enviada!'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isDepositRequired
                    ? 'Se ha enviado el enlace de Mercado Pago al cliente. Al recibir el pago por SPEI o tarjeta se confirmará la cita automáticamente.'
                    : 'Se ha abierto WhatsApp y la cita quedó registrada como confirmada. Ya puedes continuar a la agenda.'}
                </p>
              </div>
            </div>
          )}

          {/* If no phone number warning */}
          {!clientPhone && (
            <div className="bg-muted/40 border border-border/70 p-3 rounded-lg flex items-start gap-2.5 text-xs text-muted-foreground">
              <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Sin teléfono registrado</p>
                <p className="text-[11px] text-muted-foreground">
                  Este cliente no tiene teléfono guardado, pero puedes copiar el enlace de pago arriba para compartírselo.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-muted/30 border-t flex flex-col sm:flex-row gap-2">
          {!clientPhone ? (
            <Button
              type="button"
              size="default"
              onClick={() => onOpenChange(false)}
              className="w-full text-xs font-bold btn-vatos-alfa rounded-xl"
            >
              Continuar a la Agenda
            </Button>
          ) : !whatsappSent ? (
            <div className="w-full flex flex-col sm:flex-row items-center gap-2">
              <Button
                type="button"
                size="lg"
                onClick={handleSendWhatsApp}
                disabled={isDepositRequired && isGeneratingLink}
                className="w-full flex-1 font-bold gap-2 text-sm shadow-md hover:shadow-lg py-5 transition-all text-white bg-[#25D366] hover:bg-[#20ba59]"
              >
                {isGeneratingLink ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generando Enlace...</span>
                  </>
                ) : (
                  <>
                    <WhatsAppIcon className="w-5 h-5" />
                    <span>{isDepositRequired ? 'Enviar Enlace por WhatsApp' : 'Enviar Confirmación por WhatsApp'}</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="w-full flex flex-col sm:flex-row items-center gap-2">
              <Button
                type="button"
                size="default"
                onClick={() => onOpenChange(false)}
                className="w-full sm:flex-1 btn-vatos-alfa font-bold text-xs gap-1.5 shadow-md order-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Continuar a la Agenda</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendWhatsApp}
                className="w-full sm:w-auto text-xs gap-1.5 border-border/80 hover:bg-muted text-foreground order-2"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" />
                <span>Volver a Enviar</span>
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
