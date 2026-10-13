'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  doc,
  setDoc,
  getDocs,
  where,
} from 'firebase/firestore';
import { logAuditAction } from '@/lib/audit-logger';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase-client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// Icons
import {
  MessageSquare,
  Bot,
  User,
  Send,
  Phone,
  Calendar,
  Clock,
  Scissors,
  Search,
  Download,
  Sparkles,
  RefreshCw,
  CheckCheck,
  AlertCircle,
  Plus,
  Play,
  Pause,
  ExternalLink,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Info,
  SlidersHorizontal,
  X,
  History,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  Tag,
  Volume2,
  VolumeX,
  Lock,
  EyeOff,
  Paperclip,
  Image as ImageIcon,
  Check,
  Star,
  Bookmark,
  UploadCloud,
  Trash2,
  Smile,
  Mic,
  MicOff,
  Camera,
  Loader2,
  Users,
  MessageSquarePlus,
  SearchX,
  XCircle,
  Bell,
} from 'lucide-react';

// Modals & Actions
import { NewConversationModal } from '@/components/admin/conversations/new-conversation-modal';
import { NewReservationForm } from '@/components/reservations/new-reservation-form';
import { ClientDetailModal } from '@/components/clients/client-detail-modal';
import { processAgentMessage } from '@/lib/actions/ai-agent';
import {
  sendStaffMessage,
  toggleConversationMode,
  markConversationAsRead,
  getClientDetailsForChat,
  exportClientsToVCard,
  updateConversationTags,
  sendInternalStaffNote,
  confirmReservationByStaff,
  deleteConversation,
  handleClientAppointmentAction,
  checkAndSendPendingChatReminders,
  sendAppointmentChatReminder,
  sendTestChatReminder,
} from '@/lib/actions/conversation-actions';
import type { Conversation, ChatMessage, Client } from '@/lib/types';

const AVAILABLE_TAGS = [
  { id: 'VIP', label: '⭐ VIP', color: 'bg-[#C5A880]/15 text-[#C5A880] border-[#C5A880]/30' },
  { id: 'Anticipo Pendiente', label: '⏳ Anticipo Pendiente', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { id: 'Por Confirmar', label: '📅 Por Confirmar', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { id: 'Nuevo', label: '🌱 Nuevo', color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  { id: 'Queja', label: '⚠️ Queja', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  { id: 'Seguimiento', label: '🔍 Seguimiento', color: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
];

const getQuickReplies = (sofiaCfg?: any) => {
  const bankName = sofiaCfg?.bankName || 'Mercado Pago';
  const bankHolder = sofiaCfg?.bankAccountHolder || 'Jose Alejandro Pacheco';
  const bankClabe = sofiaCfg?.bankClabe || '722969013328430098';
  const address = sofiaCfg?.addressReferences || 'Av. Cerro Sombrerete 1001, Col. Cipreses, Santiago de Querétaro, Qro.';
  const tolerance = sofiaCfg?.punctualityToleranceMinutes || 10;

  return [
    {
      id: 'ubicacion',
      title: '📍 Ubicación y Horarios',
      category: 'Información',
      text: `¡Hola! Con gusto te comparto nuestra ubicación y horarios de atención:

📍 Dirección:
${address}
(Contamos con cajones de estacionamiento al frente para tu comodidad).

🕒 Horarios:
- Lunes a Sábado: 10:00 AM a 9:00 PM
- Domingo: 10:00 AM a 8:00 PM

🗺️ Google Maps:
https://maps.google.com/?q=Av+Cerro+Sombrerete+1001+Cipreses+Queretaro

¡Te esperamos en VATOS ALFA!`,
    },
    {
      id: 'datos_banco',
      title: '💳 Datos para Transferencia (SPEI)',
      category: 'Pagos',
      text: `Con gusto te comparto nuestras opciones oficiales de pago:

🏦 Transferencia Directa (SPEI):
- Banco: ${bankName}
- Titular: ${bankHolder}
- CLABE: ${bankClabe}

💳 En Sucursal:
Aceptamos tarjetas de débito/crédito y pago en efectivo.

Por favor compártenos tu comprobante o captura de pantalla por este chat para registrarlo en tu expediente. ¡Muchas gracias!`,
    },
    {
      id: 'link_anticipo',
      title: '📲 Enlace de Pago / Anticipo',
      category: 'Pagos',
      text: `Con gusto te comparto la información para tu anticipo:

Puedes realizar tu pago de manera rápida y segura con tarjeta de crédito, débito o transferencia SPEI directa con acreditación inmediata.

En cuanto quede realizado, compártenos tu comprobante por este medio para confirmar tu cita de inmediato. ¡Muchas gracias!`,
    },
    {
      id: 'servicios_precios',
      title: '✂️ Servicios y Precios',
      category: 'Servicios',
      text: `Con gusto te comparto nuestros servicios más solicitados:

💈 Menú de Servicios VATOS ALFA:
- Corte de Cabello: $140.00
- Arreglo de Barba Express: $100.00
- Barba Clásica con Toalla Caliente: $165.00
- Combo Corte + Barba Clásica: $305.00
- Perfilado de Ceja: $30.00
- Mascarilla Facial / Black Mask: $190.00

¿Te gustaría que revisemos disponibilidad para agendarte?`,
    },
    {
      id: 'en_atencion',
      title: '⏳ En atención (Mensaje de espera)',
      category: 'Cortesía',
      text: `¡Hola! Disculpa la demora, en este momento estamos terminando de atender a un cliente en silla.

En 5 minutos te atendemos con mucho gusto. ¡Gracias por tu paciencia!`,
    },
    {
      id: 'tolerancia',
      title: '⏰ Políticas de Tolerancia',
      category: 'Políticas',
      text: `Te recordamos amablemente nuestras políticas de servicio y puntualidad:

⏰ Tolerancia:
Contamos con una tolerancia máxima de ${tolerance} minutos para el inicio de tu cita.

🔄 Cambios y Cancelaciones:
Con gusto te apoyamos avisando con al menos 2 horas de anticipación para reprogramar y respaldar tu saldo a favor.

¡Agradecemos mucho tu puntualidad y preferencia!`,
    },
    {
      id: 'pregunta_confirmar',
      title: '✅ Preguntar Confirmación',
      category: 'Citas',
      text: `¡Hola! Te escribimos de VATOS ALFA para recordarte tu cita programada.

¿Nos confirmas tu asistencia por favor respondiendo con:
- Confirmar
- Reagendar
- Cancelar

¡Muchas gracias!`,
    },
    {
      id: 'cita_confirmada',
      title: '💈 Cita Confirmada',
      category: 'Citas',
      text: `¡Excelente! Te confirmamos que tu cita ha quedado debidamente programada en nuestra agenda.

📍 Av. Cerro Sombrerete 1001, Col. Cipreses.
⏰ Agradecemos tu puntualidad (contamos con ${tolerance} minutos de tolerancia).

¡Te esperamos con gusto en VATOS ALFA!`,
    },
  ];
};

const DEFAULT_QUICK_REPLIES = getQuickReplies();

function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

const EMOJI_CATEGORIES = [
  {
    name: 'Barbería & Estilo',
    emojis: ['💈', '✂️', '🪒', '🧔', '💇‍♂️', '✨', '🧴', '🧼', '🔥', '👑', '💆‍♂️', '😎'],
  },
  {
    name: 'Caritas & Gestos',
    emojis: ['😊', '😄', '👍', '🙌', '👌', '🤝', '🙏', '👏', '😉', '🤩', '❤️', '💯', '👋', '😃'],
  },
  {
    name: 'Citas & Pagos',
    emojis: ['📅', '🕒', '⏰', '⏳', '📍', '🗺️', '💳', '💰', '💵', '📲', '📞', '💬', '✅', '⚠️'],
  },
];

// Helper component to render clean, rich chat text with clickable links and without raw markdown asterisks
function FormattedChatText({ text, className = 'text-sm' }: { text: string; className?: string }) {
  if (!text) return null;

  const lines = text.split('\n');

  const formatInline = (content: string) => {
    // 1. Clean up prices enclosed in parentheses like ($159.50 MXN) or ($150)
    let cleaned = content.replace(/\(\s*(\$\d+(?:\.\d+)?(?:\s*MXN)?)\s*\)/g, '$1');
    cleaned = cleaned.replace(/\(\s*([^)\n]*?\$\d+[^)\n]*?)\s*\)/g, '$1');

    // 2. Auto-link location/address to Google Maps if no link already exists
    if (
      !cleaned.includes('http') &&
      (cleaned.toLowerCase().includes('ubicación') ||
        cleaned.toLowerCase().includes('ubicacion') ||
        cleaned.toLowerCase().includes('dirección') ||
        cleaned.toLowerCase().includes('direccion'))
    ) {
      cleaned = cleaned.replace(
        /(?:Ubicación|Ubicacion|Dirección|Direccion):\*?\s*(.+)$/i,
        (match, addr) => {
          const trimmedAddr = addr.trim().replace(/^\*|\*$/g, '').trim();
          if (!trimmedAddr) return match;
          const mapsQuery = encodeURIComponent(
            `VATOS ALFA Barber Shop ${trimmedAddr.includes('Sombrerete') ? trimmedAddr : trimmedAddr + ' Av Cerro Sombrerete'}`
          );
          const mapsUrl = `https://maps.google.com/?q=${mapsQuery}`;
          return match.replace(trimmedAddr, `[${trimmedAddr}](${mapsUrl})`);
        }
      );
    } else if (
      !cleaned.includes('http') &&
      cleaned.includes('📍') &&
      (cleaned.includes('Sombrerete') || cleaned.includes('Cipreses'))
    ) {
      cleaned = cleaned.replace(
        /(Av\.?\s*Cerro\s*Sombrerete[^\n,.]*(?:,\s*Col\.?\s*Cipreses)?)/i,
        (match, addr) => {
          const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent('VATOS ALFA Barber Shop ' + addr)}`;
          return `[${addr}](${mapsUrl})`;
        }
      );
    }

    // 3. Match links: markdown [label](url) OR raw URLs (https?://...)
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let linkMatch: RegExpExecArray | null;

    const renderWithPin = (strNode: string, key: string) => {
      if (!strNode.includes('📍')) return strNode;
      const pinParts = strNode.split(/(📍)/g);
      return pinParts.map((p, i) =>
        p === '📍' ? (
          <MapPin
            key={`${key}-pin-${i}`}
            className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20 inline-block shrink-0 mr-1 align-[-2px]"
          />
        ) : (
          p
        )
      );
    };

    const renderTextWithFormatting = (subText: string, keyPrefix: string) => {
      // Regex matching **bold**, *bold*, and _italic_
      const formatRegex = /(\*\*([^*]+?)\*\*|\*([^*\s][^*]*?[^*\s]|[^*])\*|_([^_]+?)_)/g;
      const nodes: React.ReactNode[] = [];
      let formatLastIdx = 0;
      let fmtMatch: RegExpExecArray | null;

      while ((fmtMatch = formatRegex.exec(subText)) !== null) {
        if (fmtMatch.index > formatLastIdx) {
          nodes.push(renderWithPin(subText.substring(formatLastIdx, fmtMatch.index), `${keyPrefix}-t-${formatLastIdx}`));
        }

        const boldText = fmtMatch[2] || fmtMatch[3];
        const italicText = fmtMatch[4];

        if (boldText) {
          nodes.push(
            <strong key={`${keyPrefix}-b-${fmtMatch.index}`} className="font-bold text-inherit">
              {renderWithPin(boldText, `${keyPrefix}-b-${fmtMatch.index}`)}
            </strong>
          );
        } else if (italicText) {
          nodes.push(
            <em key={`${keyPrefix}-i-${fmtMatch.index}`} className="italic text-inherit">
              {renderWithPin(italicText, `${keyPrefix}-i-${fmtMatch.index}`)}
            </em>
          );
        }

        formatLastIdx = formatRegex.lastIndex;
      }

      if (formatLastIdx < subText.length) {
        nodes.push(renderWithPin(subText.substring(formatLastIdx), `${keyPrefix}-end`));
      }

      return nodes;
    };

    const hasPinOnLine = content.includes('📍');

    while ((linkMatch = linkRegex.exec(cleaned)) !== null) {
      if (linkMatch.index > lastIndex) {
        parts.push(...renderTextWithFormatting(cleaned.substring(lastIndex, linkMatch.index), `txt-${lastIndex}`));
      }

      const markdownLabel = linkMatch[1];
      const markdownUrl = linkMatch[2];
      const rawUrl = linkMatch[3];
      const targetUrl = markdownUrl || rawUrl;
      const displayLabel = markdownLabel || rawUrl;
      const isGoogleMaps =
        targetUrl.includes('maps.google') ||
        targetUrl.includes('goo.gl/maps') ||
        targetUrl.includes('maps.app.goo.gl');

      if (isGoogleMaps) {
        parts.push(
          <a
            key={`link-${linkMatch.index}`}
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-2 break-all transition-colors cursor-pointer group"
            onClick={(e) => e.stopPropagation()}
            title="Abrir ubicación en Google Maps"
          >
            {!hasPinOnLine && (
              <MapPin className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20 inline-block shrink-0 group-hover:scale-110 transition-transform" />
            )}
            <span>{displayLabel}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-80 inline-block shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </a>
        );
      } else if (targetUrl.includes('/terminos') || targetUrl.includes('/privacidad')) {
        parts.push(
          <a
            key={`link-${linkMatch.index}`}
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 underline decoration-slate-600/50 transition-colors cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{displayLabel}</span>
          </a>
        );
      } else {
        parts.push(
          <a
            key={`link-${linkMatch.index}`}
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-blue-400 underline underline-offset-2 hover:text-blue-300 break-all transition-colors cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{displayLabel}</span>
            <ExternalLink className="w-3 h-3 inline-block shrink-0" />
          </a>
        );
      }

      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < cleaned.length) {
      parts.push(...renderTextWithFormatting(cleaned.substring(lastIndex), `txt-${lastIndex}`));
    }

    return parts;
  };

  return (
    <div className={`space-y-1 leading-relaxed ${className}`}>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();

        if (!line) {
          return <div key={idx} className="h-1.5" />;
        }

        const isBullet = /^([*\-•])\s+(.+)$/.test(line);

        if (isBullet) {
          const itemText = line.replace(/^([*\-•])\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
              <span className="text-blue-400 font-bold select-none text-xs mt-0.5">•</span>
              <span className="flex-1">{formatInline(itemText)}</span>
            </div>
          );
        }

        return (
          <div key={idx} className="break-words">
            {formatInline(rawLine)}
          </div>
        );
      })}
    </div>
  );
}

function ClientProfileContent({
  activeConversation,
  clientDetails,
  loadingClientDetails,
  onOpenAppointmentModal,
  onOpenDetailModal,
  onRefreshDetails,
}: {
  activeConversation: Conversation;
  clientDetails: any;
  loadingClientDetails: boolean;
  onOpenAppointmentModal: () => void;
  onOpenDetailModal?: () => void;
  onRefreshDetails?: () => void;
}) {
  const { toast } = useToast();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const clientObj = clientDetails?.client;
  const alfaCoins = Number(clientObj?.alfaCoins ?? clientObj?.alfa_coins ?? clientObj?.puntosLealtad ?? clientObj?.puntos_lealtad ?? clientObj?.puntos ?? 0);
  const stamps = Number(clientObj?.cortes_acumulados ?? clientObj?.cortesAcumulados ?? 0);
  const freeCutReady = Boolean(clientObj?.corte_gratis_disponible ?? clientObj?.corteGratisDisponible ?? stamps >= 9);
  const clientLevel = clientObj?.nivel || (stamps >= 8 ? 'Alfa Black VIP' : stamps >= 4 ? 'Alfa Gold' : 'Alfa Member');
  const metrics = clientDetails?.metrics || {
    total: clientObj?.citas_totales || 0,
    asistidas: clientObj?.citas_asistidas || 0,
    canceladas: clientObj?.citas_canceladas || 0,
  };

  const handleSendReminder = async (reservationId: string) => {
    if (sendingReminderId) return;
    setSendingReminderId(reservationId);
    try {
      const res = await sendAppointmentChatReminder({ reservationId });
      if (res.success) {
        toast({
          title: '🔔 Recordatorio enviado',
          description: 'Janet ha enviado el mensaje con los 3 botones al chat del cliente.',
        });
      } else {
        toast({
          title: 'No se pudo enviar',
          description: res.error || 'Error al enviar recordatorio.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleConfirmReservation = async (reservationId: string) => {
    setConfirmingId(reservationId);
    try {
      const res = await confirmReservationByStaff({
        reservationId,
        staffName: 'Recepción',
      });
      if (res.success) {
        toast({
          title: '✅ Cita Confirmada',
          description: 'La cita ha sido marcada como confirmada en la agenda.',
        });
        if (onRefreshDetails) onRefreshDetails();
      } else {
        toast({
          title: 'Error al confirmar',
          description: res.error || 'No se pudo confirmar la cita.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className="flex flex-col items-center text-center p-4 rounded-xl bg-background/60 border border-border/50">
        <Avatar className="w-14 h-14 border-2 border-primary/20 mb-2.5">
          <AvatarFallback className="bg-primary/10 text-primary font-bold text-base">
            {activeConversation.cliente_nombre
              ? activeConversation.cliente_nombre.slice(0, 2).toUpperCase()
              : 'CL'}
          </AvatarFallback>
        </Avatar>
        <h4 className="font-bold text-sm text-foreground">
          {activeConversation.cliente_nombre || 'Cliente sin registrar'}
        </h4>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Phone className="w-3 h-3 text-slate-400" />
          {activeConversation.cliente_telefono || activeConversation.id}
        </p>

        {activeConversation.cliente_telefono && (
          <a
            href={`https://wa.me/${activeConversation.cliente_telefono.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium transition-colors"
          >
            <ExternalLink className="w-3 h-3 text-slate-400" /> Abrir WhatsApp Web
          </a>
        )}

        {onOpenDetailModal && clientObj && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8 gap-1.5 mt-3 border-border/70 hover:bg-accent"
            onClick={onOpenDetailModal}
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Ver Ficha Completa
          </Button>
        )}
      </div>

      {/* Pase Alfa Card (Estilo Oficial Vatos Alfa con Dorado Mate) */}
      <div className="rounded-xl bg-gradient-to-br from-[#10172b] to-[#1c2847] border border-[#C5A880]/30 p-3 text-white space-y-2 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#C5A880] uppercase tracking-wider flex items-center gap-1.5">
            <Scissors className="h-3.5 w-3.5 text-[#C5A880]" /> Pase Alfa
          </span>
          <Badge className="bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/30 text-[10px] px-1.5 py-0 h-4 font-semibold">
            {clientLevel}
          </Badge>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-slate-300">
            <span>Visitas acumuladas</span>
            <span className="font-bold text-[#C5A880]">{stamps} / 10</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#C5A880] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (stamps / 10) * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] pt-1 text-slate-300 border-t border-white/10">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Sparkles className="h-3 w-3 text-[#C5A880]" /> Balance
          </span>
          <span className="font-bold text-[#C5A880]">{alfaCoins} AlfaCoins</span>
        </div>

        {freeCutReady && (
          <div className="mt-1 text-[10px] font-bold bg-[#C5A880]/20 text-[#C5A880] border border-[#C5A880]/40 rounded px-1.5 py-0.5 text-center">
            ✨ ¡10.° Corte Gratis Listo!
          </div>
        )}
      </div>

      {/* Action: Quick Create Appointment (Botón Oficial Vatos Alfa) */}
      <Button
        variant="alfa"
        className="w-full h-9 rounded-xl text-xs font-bold text-white shadow-md"
        onClick={onOpenAppointmentModal}
      >
        <Calendar className="w-3.5 h-3.5 mr-1 text-slate-300" />
        Agendar
      </Button>

      {/* VIP Intelligence / Historical Memory */}
      {(clientDetails?.frequentBarber || clientDetails?.frequentService) && (
        <div className="p-3 rounded-lg bg-card/60 border border-border/60 text-xs space-y-1.5">
          <span className="font-semibold text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[#C5A880]" /> Preferencias del Cliente
          </span>
          {clientDetails.frequentBarber && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <Scissors className="w-3 h-3 text-slate-400" /> Barbero habitual:
              </span>
              <span className="font-semibold text-foreground">
                {clientDetails.frequentBarber}
                {clientDetails.frequentBarberVisits ? ` (${clientDetails.frequentBarberVisits} visitas)` : ''}
              </span>
            </div>
          )}
          {clientDetails.frequentService && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <Star className="w-3 h-3 text-[#C5A880]" /> Servicio favorito:
              </span>
              <span className="font-semibold text-foreground truncate max-w-[150px]">
                {clientDetails.frequentService}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Client Metrics */}
      {clientObj && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-background/60 border text-center">
              <span className="text-muted-foreground block text-[10px]">Citas Totales</span>
              <span className="font-bold text-base text-foreground">
                {metrics.total}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-background/60 border text-center">
              <span className="text-muted-foreground block text-[10px]">Asistidas</span>
              <span className="font-bold text-base text-blue-500 dark:text-blue-400">
                {metrics.asistidas}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-background/60 border text-center">
              <span className="text-muted-foreground block text-[10px]">Canceladas</span>
              <span className="font-bold text-base text-destructive">
                {metrics.canceladas}
              </span>
            </div>
          </div>

          {(clientDetails?.totalSpent > 0 || clientObj?.gasto_total > 0) && (
            <div className="p-2 rounded-lg bg-background/60 border flex items-center justify-between px-3 text-xs">
              <span className="text-muted-foreground text-[11px]">
                Gasto Total ({clientDetails?.totalCompras || clientObj?.total_compras || 0} compras)
              </span>
              <span className="font-bold text-xs text-foreground">
                ${(clientDetails?.totalSpent || clientObj?.gasto_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Appointments History (Minimized by default, expandable) */}
      <div className="rounded-xl border border-border/60 bg-background/50 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors text-left"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <History className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              Historial de Citas
            </span>
            {clientDetails?.recentAppointments?.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {clientDetails.recentAppointments.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {loadingClientDetails && (
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground mr-1" />
            )}
            <span className="text-[11px] text-primary font-medium hover:underline">
              {isHistoryExpanded ? 'Minimizar' : 'Maximizar'}
            </span>
            {isHistoryExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </button>

        {isHistoryExpanded && (
          <div className="p-3 pt-0 border-t border-border/40 space-y-2 mt-2">
            {clientDetails?.recentAppointments?.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 pt-2">
                {clientDetails.recentAppointments.map((app: any) => {
                  const isAttended = ['Asiste', 'Pagado', 'confirmada', 'Confirmado', 'Completado', 'asistida'].includes(app.estado);
                  const isCancelled = ['Cancelado', 'cancelada', 'No asiste'].includes(app.estado);
                  const isConfirmed = app.confirmada_por_cliente || app.estado === 'confirmada' || app.estado === 'Confirmado';

                  return (
                    <div
                      key={app.id}
                      className="p-2.5 rounded-lg bg-background/70 border text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {app.fecha} • {app.hora_inicio}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 ${
                            isConfirmed
                              ? 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
                              : isAttended
                              ? 'border-blue-500/40 text-blue-400 bg-blue-500/10'
                              : isCancelled
                              ? 'border-destructive/40 text-destructive bg-destructive/10'
                              : 'border-border/60 text-muted-foreground bg-muted/20'
                          }`}
                        >
                          {app.estado}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground truncate">{app.servicio}</p>
                      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground/80">
                        <span className="flex items-center gap-1">
                          <Scissors className="w-3 h-3 text-slate-400" />
                          {app.professionalNames || app.barbero_nombre || 'Barbero'}
                        </span>
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3 text-yellow-400" /> Confirmada
                          </span>
                        ) : !isCancelled ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={sendingReminderId === app.id}
                              className="h-5 text-[9px] px-1.5 gap-1 text-slate-300 border-border/70 hover:bg-white/10"
                              onClick={() => handleSendReminder(app.id)}
                              title="Enviar recordatorio automático con botones al chat del cliente"
                            >
                              {sendingReminderId === app.id ? (
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Bell className="w-2.5 h-2.5 text-slate-400" />
                              )}
                              Recordatorio
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={confirmingId === app.id}
                              className="h-5 text-[9px] px-1.5 gap-1 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/10"
                              onClick={() => handleConfirmReservation(app.id)}
                            >
                              {confirmingId === app.id ? (
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Check className="w-2.5 h-2.5 text-yellow-400" />
                              )}
                              Confirmar
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">
                No hay citas registradas para este número.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Client Notes */}
      {clientObj?.notas && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/60 text-xs text-foreground">
          <span className="font-semibold block mb-1 text-slate-300">Notas del cliente:</span>
          <p className="text-muted-foreground">{clientObj.notas}</p>
        </div>
      )}
    </div>
  );
}

export default function ConversationsDashboardPage() {
  const { user, db } = useAuth();
  const { toast } = useToast();

  // Permissions check
  const canView =
    user?.role === 'Administrador general' ||
    user?.permissions?.includes('ver_conversaciones');
  const canReply =
    user?.role === 'Administrador general' ||
    user?.permissions?.includes('atender_chats');

  // Conversations query
  const {
    data: rawConversations,
    loading: conversationsLoading,
  } = useFirestoreQuery<Conversation>('conversaciones');

  // Clientes query for unified search
  const {
    data: rawClients,
    loading: clientsLoading,
  } = useFirestoreQuery<Client>('clientes');

  // Local state
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [staffInput, setStaffInput] = useState<string>('');
  const [isSendingStaff, setIsSendingStaff] = useState<boolean>(false);
  const [isTogglingMode, setIsTogglingMode] = useState<boolean>(false);
  const [sendRole, setSendRole] = useState<'cliente' | 'recepcion' | 'nota_interna'>('recepcion');
  const [pauseBotOnSend, setPauseBotOnSend] = useState<boolean>(false);
  const [isProcessingAI, setIsProcessingAI] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [attachedImageUrl, setAttachedImageUrl] = useState<string>('');
  const [showImageInput, setShowImageInput] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState<boolean>(false);
  const [isDeleteAuthModalOpen, setIsDeleteAuthModalOpen] = useState<boolean>(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [deleteAuthCode, setDeleteAuthCode] = useState<string>('');
  const [deleteAuthError, setDeleteAuthError] = useState<string>('');
  const [isVerifyingDeleteCode, setIsVerifyingDeleteCode] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Audio voice recording state & refs
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [assistantName, setAssistantName] = useState<string>('Janet');
  const [sofiaConfig, setSofiaConfig] = useState<any>(null);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'settings', 'sofia'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSofiaConfig(data);
        if (data?.assistantName) {
          setAssistantName(data.assistantName);
        }
      }
    });
    return () => unsub();
  }, [db]);

  const quickRepliesList = useMemo(() => getQuickReplies(sofiaConfig), [sofiaConfig]);

  // Cleanup audio tracks and timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Auto-grow textarea as text grows
  useEffect(() => {
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
      chatTextareaRef.current.style.height = `${Math.max(38, Math.min(chatTextareaRef.current.scrollHeight, 180))}px`;
    }
  }, [staffInput]);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'todos' | 'requiere_atencion' | 'bot_activo' | 'humano_al_mando' | 'no_leidos'>('todos');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  // Right sidebar details
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [loadingClientDetails, setLoadingClientDetails] = useState<boolean>(false);
  const [showRightPanel, setShowRightPanel] = useState<boolean>(false);
  const [isChatListVisible, setIsChatListVisible] = useState<boolean>(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(false);

  // Modals
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState<boolean>(false);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState<boolean>(false);
  const [isClientDetailModalOpen, setIsClientDetailModalOpen] = useState<boolean>(false);
  const [isExportingVCard, setIsExportingVCard] = useState<boolean>(false);
  const [tagModalConv, setTagModalConv] = useState<Conversation | null>(null);

  // Long-press detection for conversation cards
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef<boolean>(false);

  const startLongPress = (conv: Conversation) => {
    isLongPressActiveRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      setTagModalConv(conv);
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(50);
        } catch (e) {}
      }
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardClick = (convId: string) => {
    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      return;
    }
    setSelectedConvId(convId);
  };

  // Simulator Modal State
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [simInput, setSimInput] = useState<string>('');
  const [simPhone, setSimPhone] = useState<string>('5214421234567');
  const [simName, setSimName] = useState<string>('Cliente de Prueba');
  const [simEmail, setSimEmail] = useState<string>('');
  const [simMessages, setSimMessages] = useState<ChatMessage[]>([]);
  const [isSimProcessing, setIsSimProcessing] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const simMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const simScrollContainerRef = useRef<HTMLDivElement>(null);
  const activeConvRef = useRef<Conversation | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const isSimInitialLoadRef = useRef<boolean>(true);

  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  // Background checker for pending appointment chat reminders
  useEffect(() => {
    const runReminderCheck = async () => {
      try {
        await checkAndSendPendingChatReminders();
      } catch (e) {
        console.error('Error running pending chat reminders check:', e);
      }
    };
    runReminderCheck();
    const interval = setInterval(runReminderCheck, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const handleExecuteAppointmentAction = async (msg: ChatMessage, action: 'confirm' | 'reschedule' | 'cancel') => {
    if (!msg.metadata?.reservation_id || isProcessingAction) return;
    const convId = msg.conversation_id || selectedConvId;
    if (!convId) return;

    setIsProcessingAction(true);
    try {
      const res = await handleClientAppointmentAction({
        conversationId: convId,
        messageId: msg.id,
        reservationId: msg.metadata.reservation_id,
        action,
        clientName: activeConversation?.cliente_nombre || simName || 'Cliente',
      });

      if (res.success) {
        toast({
          title: action === 'confirm' ? '¡Cita Confirmada!' : action === 'cancel' ? 'Cita Cancelada' : 'Reagendamiento Iniciado',
          description: res.message,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error al procesar acción',
          description: res.error || 'No se pudo actualizar el estado de la cita.',
        });
      }
    } catch (err: any) {
      console.error('Error executing message action:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Error al ejecutar la acción.',
      });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const [isSendingDirectReminder, setIsSendingDirectReminder] = useState<boolean>(false);

  const handleSendDirectReminderTest = async () => {
    if (!selectedConvId || isSendingDirectReminder) return;
    setIsSendingDirectReminder(true);
    try {
      const res = await sendTestChatReminder({
        conversationId: selectedConvId,
        clientName: activeConversation?.cliente_nombre || undefined,
      });
      if (res.success) {
        toast({
          title: '🔔 Recordatorio enviado',
          description: 'Janet ha enviado el mensaje interactivo con los 3 botones a este chat.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'No se pudo enviar',
          description: res.error || 'Error al enviar recordatorio de prueba.',
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message,
      });
    } finally {
      setIsSendingDirectReminder(false);
    }
  };

  // Sort and filter conversations
  const filteredConversations = useMemo(() => {
    let list = [...rawConversations];

    // Filter by tag
    if (filterTag) {
      list = list.filter((c) => c.etiquetas?.includes(filterTag));
    }

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (c) =>
          c.cliente_nombre?.toLowerCase().includes(q) ||
          c.cliente_telefono?.includes(q) ||
          c.ultimo_mensaje?.toLowerCase().includes(q) ||
          c.id?.toLowerCase().includes(q) ||
          c.etiquetas?.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Filter by mode
    if (filterMode === 'requiere_atencion') {
      list = list.filter((c) => c.modo_atencion === 'requiere_atencion');
    } else if (filterMode === 'bot_activo') {
      list = list.filter((c) => c.modo_atencion === 'bot_activo');
    } else if (filterMode === 'humano_al_mando') {
      list = list.filter((c) => c.modo_atencion === 'humano_al_mando');
    } else if (filterMode === 'no_leidos') {
      list = list.filter((c) => (c.mensajes_no_leidos || 0) > 0);
    }

    // Sort by most recent message
    return list.sort((a, b) => {
      const timeA = a.fecha_ultimo_mensaje?.seconds || (a.fecha_ultimo_mensaje ? new Date(a.fecha_ultimo_mensaje).getTime() / 1000 : 0);
      const timeB = b.fecha_ultimo_mensaje?.seconds || (b.fecha_ultimo_mensaje ? new Date(b.fecha_ultimo_mensaje).getTime() / 1000 : 0);
      return timeB - timeA;
    });
  }, [rawConversations, searchTerm, filterMode, filterTag]);

  // Selected conversation object
  const activeConversation = useMemo(() => {
    return rawConversations.find((c) => c.id === selectedConvId) || null;
  }, [rawConversations, selectedConvId]);

  // Keep active conversation reference fresh without triggering listener re-subscriptions
  useEffect(() => {
    activeConvRef.current = activeConversation;
  }, [activeConversation]);

  // Count attention required
  const attentionCount = useMemo(() => {
    return rawConversations.filter((c) => c.modo_atencion === 'requiere_atencion').length;
  }, [rawConversations]);

  // Matching clients for unified search
  const matchingClients = useMemo(() => {
    if (!searchTerm.trim() || !rawClients || rawClients.length === 0) return [];

    const clean = (val: any) =>
      String(val ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const query = clean(searchTerm);
    const terms = query.split(/\s+/).filter(Boolean);

    return rawClients
      .filter((c) => {
        const fullName = clean(`${c.nombre || ''} ${c.apellido || ''}`);
        const phone = String(c.telefono ?? '').replace(/\D/g, '');
        const rawPhone = clean(c.telefono);
        const email = clean(c.correo);
        const clientNumber = clean(c.numero_cliente);
        const combined = `${fullName} ${rawPhone} ${phone} ${email} ${clientNumber}`;

        return terms.every((t) => combined.includes(t));
      })
      .slice(0, 30);
  }, [rawClients, searchTerm]);

  // Handler to open or start a conversation with a client
  const handleStartConversationWithClient = async (client: Client) => {
    const cleanPhone = String(client.telefono ?? '').replace(/\D/g, '');

    // Search if conversation already exists by phone or client id
    const existingConv = rawConversations.find(
      (c) =>
        (cleanPhone && String(c.cliente_telefono ?? '').replace(/\D/g, '') === cleanPhone) ||
        (client.id && c.cliente_id === client.id) ||
        (cleanPhone && c.id === cleanPhone) ||
        (client.id && c.id === client.id)
    );

    if (existingConv) {
      setSelectedConvId(existingConv.id);
      return;
    }

    const convId = cleanPhone || client.id;
    if (db) {
      try {
        const convRef = doc(db, 'conversaciones', convId);
        await setDoc(
          convRef,
          {
            id: convId,
            cliente_id: client.id,
            cliente_nombre: `${client.nombre || ''} ${client.apellido || ''}`.trim() || 'Cliente',
            cliente_telefono: client.telefono || '',
            modo_atencion: 'bot_activo',
            mensajes_no_leidos: 0,
            ultimo_mensaje: 'Conversación iniciada',
            fecha_ultimo_mensaje: Timestamp.now(),
            updated_at: Timestamp.now(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Error creating conversation document:', err);
      }
    }

    setSelectedConvId(convId);
  };

  // Digits from search term to detect phone numbers
  const searchPhoneDigits = useMemo(() => {
    return searchTerm.replace(/\D/g, '');
  }, [searchTerm]);

  const hasConvWithSearchPhone = useMemo(() => {
    if (searchPhoneDigits.length < 7) return true;
    return rawConversations.some(
      (c) => String(c.cliente_telefono ?? '').replace(/\D/g, '') === searchPhoneDigits || c.id === searchPhoneDigits
    );
  }, [rawConversations, searchPhoneDigits]);

  // Handler to start a conversation with a raw phone number (unregistered client)
  const handleStartConversationWithPhone = async (phoneNumber: string) => {
    const cleanPhone = String(phoneNumber).replace(/\D/g, '');
    if (!cleanPhone) return;

    const existingConv = rawConversations.find(
      (c) =>
        String(c.cliente_telefono ?? '').replace(/\D/g, '') === cleanPhone ||
        c.id === cleanPhone
    );

    if (existingConv) {
      setSelectedConvId(existingConv.id);
      setSearchTerm('');
      return;
    }

    if (db) {
      try {
        const convRef = doc(db, 'conversaciones', cleanPhone);
        await setDoc(
          convRef,
          {
            id: cleanPhone,
            cliente_id: '',
            cliente_nombre: 'Cliente',
            cliente_telefono: cleanPhone,
            modo_atencion: 'bot_activo',
            mensajes_no_leidos: 0,
            ultimo_mensaje: 'Conversación iniciada',
            fecha_ultimo_mensaje: Timestamp.now(),
            updated_at: Timestamp.now(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Error creating conversation for new phone:', err);
      }
    }

    setSelectedConvId(cleanPhone);
    setSearchTerm('');
  };

  // Select first conversation if none selected (desktop only to preserve mobile chat list experience)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      if (!selectedConvId && filteredConversations.length > 0) {
        setSelectedConvId(filteredConversations[0].id);
      }
    }
  }, [filteredConversations, selectedConvId]);

  // Reset initial load flag and role when conversation changes
  useEffect(() => {
    isInitialLoadRef.current = true;
    if (activeConversation && activeConversation.canal !== 'simulador' && sendRole === 'cliente') {
      setSendRole('recepcion');
    }
  }, [selectedConvId, activeConversation?.canal]);

  useEffect(() => {
    if (isSimulatorOpen) {
      isSimInitialLoadRef.current = true;
    }
  }, [isSimulatorOpen]);

  // Real-time messages listener for selected conversation
  // Note: Only depends on db and selectedConvId so it doesn't unmount messages on conversation updates
  useEffect(() => {
    if (!db || !selectedConvId) {
      setMessages([]);
      return;
    }

    setMessagesLoading(true);
    const msgsQuery = query(
      collection(db, 'conversaciones', selectedConvId, 'mensajes'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(
      msgsQuery,
      (snapshot) => {
        // Sound notification on incoming client message if not initial load
        if (!isInitialLoadRef.current && soundEnabled) {
          const hasNewClientMsg = snapshot.docChanges().some(
            (change) => change.type === 'added' && change.doc.data().de === 'cliente'
          );
          if (hasNewClientMsg) {
            playNotificationChime();
          }
        }

        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ChatMessage[];

        setMessages((prev) => {
          // Retain any pending optimistic messages that haven't landed in Firestore yet
          const pending = prev.filter(
            (m) =>
              (m.id.startsWith('temp-client-') || m.id.startsWith('temp-staff-') || m.id.startsWith('temp-note-')) &&
              !list.some((real) => real.texto === m.texto && real.de === m.de)
          );
          return [...list, ...pending];
        });
        setMessagesLoading(false);

        // Mark as read if has unread
        const currentConv = activeConvRef.current;
        if (currentConv && (currentConv.mensajes_no_leidos || 0) > 0) {
          markConversationAsRead({ conversationId: selectedConvId });
        }
      },
      (error) => {
        console.error('Error fetching messages:', error);
        setMessagesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, selectedConvId, soundEnabled]);

  // Load client details when conversation changes
  const loadClientDetails = () => {
    if (!activeConversation?.cliente_telefono && !activeConversation?.cliente_id) {
      setClientDetails(null);
      return;
    }

    setLoadingClientDetails(true);
    getClientDetailsForChat({
      phone: activeConversation.cliente_telefono || '',
      clientId: activeConversation.cliente_id,
    })
      .then((res) => {
        if (res.success) {
          setClientDetails(res);
        }
      })
      .finally(() => {
        setLoadingClientDetails(false);
      });
  };

  useEffect(() => {
    loadClientDetails();
  }, [activeConversation?.cliente_telefono, activeConversation?.cliente_id]);

  // Auto-scroll inside the chat container ONLY (prevents window jumping)
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const timer = setTimeout(() => {
      if (chatScrollContainerRef.current) {
        if (isInitialLoadRef.current) {
          // Snap directly to bottom on initial load - NO scrolling all the way from the top
          chatScrollContainerRef.current.scrollTo({
            top: chatScrollContainerRef.current.scrollHeight,
            behavior: 'auto',
          });
          isInitialLoadRef.current = false;
        } else {
          // Smooth glide down only for new messages
          chatScrollContainerRef.current.scrollTo({
            top: chatScrollContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [messages, isProcessingAI]);

  useEffect(() => {
    if (!simMessages || simMessages.length === 0) return;

    const timer = setTimeout(() => {
      if (simScrollContainerRef.current) {
        if (isSimInitialLoadRef.current) {
          simScrollContainerRef.current.scrollTo({
            top: simScrollContainerRef.current.scrollHeight,
            behavior: 'auto',
          });
          isSimInitialLoadRef.current = false;
        } else {
          simScrollContainerRef.current.scrollTo({
            top: simScrollContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [simMessages, isSimProcessing]);

  // Auto-sync sendRole based on conversation channel
  useEffect(() => {
    if (activeConversation?.canal === 'simulador' || activeConversation?.id?.startsWith('sim-sandbox')) {
      setSendRole('cliente');
    } else {
      setSendRole('recepcion');
    }
  }, [activeConversation?.id, activeConversation?.canal]);

  // Toggle tag on active conversation or specific conversation (from modal)
  const handleToggleTag = async (tagId: string, targetConv?: Conversation | null) => {
    const target = targetConv || activeConversation;
    if (!target) return;
    const currentTags = target.etiquetas || [];
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];
    try {
      const res = await updateConversationTags({
        conversationId: target.id,
        tags: newTags,
      });
      if (res.success) {
        toast({
          title: 'Etiquetas actualizadas',
          description: newTags.includes(tagId)
            ? `Se agregó la etiqueta "${tagId}".`
            : `Se eliminó la etiqueta "${tagId}".`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error al actualizar etiquetas',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  // Handle processing image files from local disk, clipboard paste, or drag & drop
  const handleProcessImageFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Formato no soportado',
        description: 'Por favor selecciona un archivo de imagen válido (JPG, PNG, WEBP, etc.).',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Imagen muy grande',
        description: 'El tamaño máximo permitido para imágenes es de 10 MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      if (storage) {
        const safeName = file.name ? file.name.replace(/[^a-zA-Z0-9._-]/g, '_') : 'imagen.png';
        const fileRef = storageRef(
          storage,
          `chat_attachments/${selectedConvId || 'general'}/${Date.now()}_${safeName}`
        );
        const uploadRes = await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(uploadRes.ref);
        setAttachedImageUrl(downloadUrl);
        toast({
          title: 'Imagen adjuntada',
          description: 'La imagen se cargó correctamente y está lista para enviarse.',
        });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            setAttachedImageUrl(result);
            toast({
              title: 'Imagen adjuntada',
              description: 'Imagen preparada para enviar.',
            });
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.warn('Error subiendo imagen a Firebase Storage, usando DataURL de respaldo:', err);
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            setAttachedImageUrl(result);
            toast({
              title: 'Imagen adjuntada',
              description: 'Imagen preparada para enviar.',
            });
          }
        };
        reader.readAsDataURL(file);
      } catch (fallbackErr: any) {
        toast({
          title: 'Error al procesar imagen',
          description: err.message || 'No se pudo cargar la imagen seleccionada.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleProcessImageFile(file);
          break;
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFile) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleProcessImageFile(file);
      } else {
        toast({
          title: 'Archivo no soportado',
          description: 'Por favor arrastra únicamente archivos de imagen.',
          variant: 'destructive',
        });
      }
    }
  };

  // Insert emoji at cursor position or append to text
  const handleInsertEmoji = (emoji: string) => {
    if (chatTextareaRef.current) {
      const textarea = chatTextareaRef.current;
      const start = textarea.selectionStart ?? staffInput.length;
      const end = textarea.selectionEnd ?? staffInput.length;
      const newText = staffInput.substring(0, start) + emoji + staffInput.substring(end);
      setStaffInput(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setStaffInput((prev) => prev + emoji);
    }
  };

  // Start voice recording with microphone
  const startVoiceRecording = async () => {
    if (isRecordingAudio) return;
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      toast({
        title: 'Navegador no compatible',
        description: 'Tu navegador no permite la grabación directa de notas de voz.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Error starting audio recording:', err);
      toast({
        title: 'Micrófono no disponible',
        description: 'Por favor permite el acceso al micrófono en los permisos de tu navegador para grabar notas de voz.',
        variant: 'destructive',
      });
    }
  };

  // Cancel voice recording without sending
  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
  };

  // Finish voice recording and send immediately to chat
  const finishAndSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !isRecordingAudio || !selectedConvId) return;

    if (recordingSeconds < 1) {
      toast({
        title: 'Nota de voz muy corta',
        description: 'Graba al menos 1 segundo de audio para enviar.',
      });
      cancelVoiceRecording();
      return;
    }

    const durationSec = recordingSeconds;
    setIsRecordingAudio(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';

    recorder.onstop = async () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];

      if (audioBlob.size === 0) {
        toast({
          title: 'Error de audio',
          description: 'No se detectó audio grabado.',
          variant: 'destructive',
        });
        return;
      }

      setIsSendingStaff(true);
      try {
        let audioUrl = '';

        if (storage) {
          try {
            const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
            const fileRef = storageRef(
              storage,
              `chat_audio/${selectedConvId || 'general'}/${Date.now()}_voice.${extension}`
            );
            const uploadRes = await uploadBytes(fileRef, audioBlob);
            audioUrl = await getDownloadURL(uploadRes.ref);
          } catch (storageErr) {
            console.warn('Fallo Firebase Storage para audio, usando DataURL de respaldo:', storageErr);
          }
        }

        if (!audioUrl) {
          audioUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });
        }

        const durationStr = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`;
        const msgText = `🎤 Nota de voz (${durationStr})`;
        const tempId = `temp-voice-${Date.now()}`;

        const optimisticMsg: ChatMessage = {
          id: tempId,
          conversation_id: selectedConvId,
          de: 'recepcion',
          texto: msgText,
          timestamp: new Date(),
          tipo: 'audio',
          mediaUrl: audioUrl,
          estado: 'enviado',
          metadata: {
            staffName: user?.displayName || user?.email || 'Recepción',
            duration: durationSec,
          },
        };
        setMessages((prev) => [...prev, optimisticMsg]);

        const res = await sendStaffMessage({
          conversationId: selectedConvId,
          messageText: msgText,
          staffName: user?.displayName || user?.email || 'Recepcionista',
          pauseBot: pauseBotOnSend,
          audioUrl: audioUrl,
          audioDuration: durationSec,
        });

        if (!res.success) {
          toast({
            title: 'Error al enviar audio',
            description: res.error || 'No se pudo registrar la nota de voz.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: '🎤 Nota de voz enviada',
            description: `Duración: ${durationStr}`,
          });
        }
      } catch (err: any) {
        console.error('Error enviando nota de voz:', err);
        toast({
          title: 'Error al procesar audio',
          description: err.message,
          variant: 'destructive',
        });
      } finally {
        setIsSendingStaff(false);
        setRecordingSeconds(0);
      }
    };

    try {
      recorder.stop();
    } catch (e) {
      cancelVoiceRecording();
    }
  };

  // Send message (as client, reception staff, or internal staff note)
  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = staffInput.trim();
    const media = attachedImageUrl.trim() || undefined;
    if ((!text && !media) || !selectedConvId || isSendingStaff || isProcessingAI || isUploadingImage || isRecordingAudio) return;

    // Internal staff note
    if (sendRole === 'nota_interna') {
      if (!text) {
        toast({
          title: 'Nota vacía',
          description: 'Escribe un texto para la nota interna.',
          variant: 'destructive',
        });
        return;
      }
      const tempId = `temp-note-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        conversation_id: selectedConvId,
        de: 'recepcion',
        texto: text,
        timestamp: new Date(),
        tipo: 'nota_interna',
        metadata: {
          staffName: user?.displayName || user?.email || 'Recepción',
        },
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setStaffInput('');
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = 'auto';
      setIsSendingStaff(true);
      try {
        const res = await sendInternalStaffNote({
          conversationId: selectedConvId,
          noteText: text,
          staffName: user?.displayName || user?.email || 'Recepción',
        });
        if (!res.success) {
          toast({
            title: 'Error al guardar nota',
            description: res.error || 'No se pudo guardar la nota interna.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: '🔒 Nota interna guardada',
            description: 'La nota solo es visible para el equipo de recepción.',
          });
        }
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message,
          variant: 'destructive',
        });
      } finally {
        setIsSendingStaff(false);
      }
      return;
    }

    // Client test message
    if (sendRole === 'cliente') {
      const messageContent = text || (media ? 'Envío una imagen adjunta' : '');
      const tempId = `temp-client-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        conversation_id: selectedConvId,
        de: 'cliente',
        texto: messageContent,
        timestamp: new Date(),
        tipo: media ? 'imagen' : 'texto',
        mediaUrl: media,
        estado: 'enviado',
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setStaffInput('');
      setAttachedImageUrl('');
      setShowImageInput(false);
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = 'auto';
      setIsProcessingAI(true);
      try {
        const res = await processAgentMessage({
          conversationId: selectedConvId,
          clientPhone: activeConversation?.cliente_telefono || '5214421234567',
          clientName: activeConversation?.cliente_nombre || 'Cliente de Prueba',
          userMessage: messageContent,
          channel: (activeConversation?.canal as any) || 'simulador',
          imageUrl: media,
        });

        if (!res.success) {
          toast({
            title: 'Error del Asistente Virtual',
            description: res.error || 'No se pudo generar respuesta.',
            variant: 'destructive',
          });
        } else if (!res.replied && res.status === 'humano_al_mando') {
          toast({
            title: 'Janet pausada en este chat',
            description: 'El chat está en modo Recepción / Humano. Activa el interruptor "Janet Auto" arriba a la derecha para que responda automáticamente.',
          });
        }
      } catch (err: any) {
        toast({
          title: 'Error de envío',
          description: err.message,
          variant: 'destructive',
        });
      } finally {
        setIsProcessingAI(false);
      }
    } else {
      // Reception manual reply
      if (!canReply) {
        toast({
          title: 'Sin permisos',
          description: 'No cuentas con el permiso "atender_chats" para responder.',
          variant: 'destructive',
        });
        return;
      }

      const messageContent = text || (media ? '📷 Imagen enviada' : '');
      setStaffInput('');
      setAttachedImageUrl('');
      setShowImageInput(false);
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = 'auto';
      setIsSendingStaff(true);
      const tempId = `temp-staff-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        conversation_id: selectedConvId,
        de: 'recepcion',
        texto: messageContent,
        timestamp: new Date(),
        tipo: media ? 'imagen' : 'texto',
        mediaUrl: media,
        estado: 'enviado',
        metadata: {
          staffName: user?.displayName || user?.email || 'Recepción',
        },
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await sendStaffMessage({
          conversationId: selectedConvId,
          messageText: messageContent,
          staffName: user?.displayName || user?.email || 'Recepcionista',
          pauseBot: pauseBotOnSend,
          imageUrl: media,
        });

        if (!res.success) {
          toast({
            title: 'Error al enviar mensaje',
            description: res.error || 'Ocurrió un error inesperado.',
            variant: 'destructive',
          });
        }
      } catch (error: any) {
        toast({
          title: 'Error de envío',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setIsSendingStaff(false);
      }
    }
  };

  // Toggle Bot Mode
  const handleToggleMode = async (checked: boolean) => {
    if (!selectedConvId || isTogglingMode) return;
    setIsTogglingMode(true);

    const newMode = checked ? 'humano_al_mando' : 'bot_activo';
    try {
      const res = await toggleConversationMode({
        conversationId: selectedConvId,
        mode: newMode,
      });

      if (res.success) {
        toast({
          title: checked ? '👤 Recepción al mando' : `💈 ${assistantName} Activa`,
          description: checked
            ? `${assistantName} ha sido pausada. Ahora tú tienes el control de las respuestas.`
            : `${assistantName} responderá automáticamente las dudas y citas del cliente.`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error al cambiar modo',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsTogglingMode(false);
    }
  };

  // Export Contacts to vCard
  const handleExportVCard = async () => {
    setIsExportingVCard(true);
    try {
      const res = await exportClientsToVCard();
      if (res.success && res.vcfContent) {
        const blob = new Blob([res.vcfContent], { type: 'text/vcard;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Contactos_VATOS_ALFA_${format(new Date(), 'yyyy-MM-dd')}.vcf`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: '✅ Contactos exportados con éxito',
          description: `Se han exportado ${res.count} clientes en formato .vcf listos para tu teléfono o WhatsApp.`,
        });
      } else {
        toast({
          title: 'Error al exportar',
          description: res.error || 'No se pudieron exportar los contactos.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error de exportación',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExportingVCard(false);
    }
  };

  const handleOpenDeleteModal = (conversation: Conversation) => {
    setConversationToDelete(conversation);
    setDeleteAuthCode('');
    setDeleteAuthError('');
    setIsDeleteAuthModalOpen(true);
  };

  const handleConfirmDeleteWithCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!conversationToDelete) return;
    const trimmedCode = deleteAuthCode.trim();

    if (!trimmedCode) {
      setDeleteAuthError('Ingresa el código de autorización para continuar.');
      return;
    }

    if (!db) {
      toast({
        variant: 'destructive',
        title: 'Error de conexión',
        description: 'Base de datos no disponible.',
      });
      return;
    }

    setIsVerifyingDeleteCode(true);
    setDeleteAuthError('');

    try {
      // 1. Validar código en la colección codigos_autorizacion
      const authQuery = query(
        collection(db, 'codigos_autorizacion'),
        where('code', '==', trimmedCode),
        where('active', '==', true)
      );
      const authSnap = await getDocs(authQuery);

      if (authSnap.empty) {
        setDeleteAuthError('Código de autorización incorrecto o inactivo.');
        toast({
          variant: 'destructive',
          title: 'Acceso Denegado',
          description: 'El código ingresado no es válido o ha sido desactivado.',
        });
        setIsVerifyingDeleteCode(false);
        return;
      }

      // 2. Código válido -> Eliminar conversación de forma permanente
      setIsDeletingConversation(true);
      const convId = conversationToDelete.id;
      const clientName = conversationToDelete.cliente_nombre || conversationToDelete.cliente_telefono || 'Conversación';

      const res = await deleteConversation(convId);

      if (res.success) {
        await logAuditAction({
          action: 'Eliminar Conversación',
          details: `Conversación con ${clientName} (${convId}) eliminada permanentemente mediante código de autorización.`,
          userId: user?.uid || 'unknown',
          userName: user?.displayName || user?.email || 'Unknown',
          userRole: user?.role,
          authCode: trimmedCode,
          severity: 'warning',
        });

        toast({
          title: 'Conversación eliminada',
          description: 'La conversación y todo su historial de mensajes fueron eliminados con éxito.',
        });

        setIsDeleteAuthModalOpen(false);
        setConversationToDelete(null);
        setDeleteAuthCode('');
        setSelectedConvId(null);
      } else {
        toast({
          title: 'Error al eliminar',
          description: res.error || 'No se pudo eliminar la conversación.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('Error eliminando conversación con código:', err);
      toast({
        title: 'Error',
        description: err.message || 'Ocurrió un error inesperado al eliminar.',
        variant: 'destructive',
      });
    } finally {
      setIsVerifyingDeleteCode(false);
      setIsDeletingConversation(false);
    }
  };

  // Simulator Message Handler
  const handleSendSimulatorMessage = async (textToSend?: string) => {
    const text = (textToSend || simInput).trim();
    if (!text || isSimProcessing) return;

    setSimInput('');
    setIsSimProcessing(true);

    // Optimistic push to simulator messages
    const clientTempMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      conversation_id: 'sim-sandbox',
      de: 'cliente',
      texto: text,
      timestamp: new Date(),
    };
    setSimMessages((prev) => [...prev, clientTempMsg]);

    try {
      const res = await processAgentMessage({
        conversationId: 'sim-sandbox-' + simPhone.replace(/\D/g, ''),
        clientPhone: simPhone,
        clientName: simName,
        clientEmail: simEmail,
        userMessage: text,
        channel: 'simulador',
      });

      if (res.success && res.botReply) {
        const botTempMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          conversation_id: 'sim-sandbox',
          de: 'bot',
          texto: res.botReply,
          timestamp: new Date(),
        };
        setSimMessages((prev) => [...prev, botTempMsg]);
      } else if (res.status === 'humano_al_mando') {
        const infoMsg: ChatMessage = {
          id: 'sys-' + Date.now(),
          conversation_id: 'sim-sandbox',
          de: 'recepcion',
          texto: '👤 El chat está en modo humano. La recepcionista debe responder.',
          timestamp: new Date(),
          tipo: 'sistema',
        };
        setSimMessages((prev) => [...prev, infoMsg]);
      }
    } catch (err: any) {
      toast({
        title: 'Error en simulador',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSimProcessing(false);
    }
  };

  // Simulator: Trigger sample appointment reminder with the 3 interactive buttons
  const handleTriggerSimulatedReminder = () => {
    const reminderMsg: ChatMessage = {
      id: 'sim-rem-' + Date.now(),
      conversation_id: 'sim-sandbox',
      de: 'bot',
      texto: `¡Hola *${simName || 'Cliente'}*, te recordamos tu cita en Vatos Alfa! 💈\n\n📅 *Fecha:* Hoy\n⏰ *Hora:* 16:00\n👤 *Profesional:* Carlos Barber\n✂️ *Servicio(s):* Corte Clásico + Barba de Caballero\n📍 *Ubicación:* Av. Cerro Sombrerete 1001, Col. Cipreses (Suc. Sombrerete)\n\nPor favor confirma tu asistencia presionando una opción abajo:`,
      timestamp: new Date(),
      tipo: 'accion',
      metadata: {
        action_type: 'appointment_reminder',
        reservation_id: 'sim-res-123',
        buttons: [
          { id: 'confirm', label: 'Confirmar Asistencia', action: 'confirm', variant: 'confirm' },
          { id: 'reschedule', label: 'Reagendar', action: 'reschedule', variant: 'reschedule' },
          { id: 'cancel', label: 'Cancelar', action: 'cancel', variant: 'cancel' },
        ],
      },
    };
    setSimMessages((prev) => [...prev, reminderMsg]);
  };

  // Simulator: Handle click on one of the 3 reminder buttons
  const handleExecuteSimulatorAction = (msg: ChatMessage, action: 'confirm' | 'reschedule' | 'cancel') => {
    // 1. Mark selected_action in simulator message
    setSimMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? { ...m, metadata: { ...(m.metadata || {}), selected_action: action } }
          : m
      )
    );

    // 2. Formulate simulated reply from Janet
    let replyText = '';
    if (action === 'confirm') {
      replyText = `¡Excelente ${simName || 'Cliente'}! 🎉 Tu cita ha quedado confirmada para el día de hoy a las 16:00. Te esperamos 5 minutos antes con la etiqueta amarilla de Confirmado en la agenda. 💈✂️`;
    } else if (action === 'reschedule') {
      replyText = `¡Hola ${simName || 'Cliente'}! Con gusto te ayudo a reagendar tu cita. 📅✂️\n\n¿Para qué día y en qué horario te gustaría moverla? Indícamelo aquí mismo para consultar la disponibilidad de los barberos en la agenda.`;
    } else {
      replyText = `Tu cita ha sido cancelada conforme a lo solicitado y el turno ha quedado liberado. 💈\n\nSi deseas agendar en otra ocasión, aquí estaré lista para ayudarte. ¡Hasta pronto!`;
    }

    const botReply: ChatMessage = {
      id: 'sim-reply-' + Date.now(),
      conversation_id: 'sim-sandbox',
      de: 'bot',
      texto: replyText,
      timestamp: new Date(),
    };

    setTimeout(() => {
      setSimMessages((prev) => [...prev, botReply]);
    }, 400);
  };

  // Helper to render a single conversation item in the list
  const renderConversationItem = (conv: Conversation) => {
    const isSelected = conv.id === selectedConvId;
    const isAttention = conv.modo_atencion === 'requiere_atencion';
    const isHuman = conv.modo_atencion === 'humano_al_mando';
    const unread = conv.mensajes_no_leidos || 0;

    // Format timestamp
    let timeDisplay = '';
    if (conv.fecha_ultimo_mensaje) {
      const dateObj = conv.fecha_ultimo_mensaje?.toDate
        ? conv.fecha_ultimo_mensaje.toDate()
        : new Date(conv.fecha_ultimo_mensaje);
      timeDisplay = format(dateObj, 'HH:mm', { locale: es });
    }

    return (
      <button
        key={conv.id}
        type="button"
        onClick={() => handleCardClick(conv.id)}
        onTouchStart={() => startLongPress(conv)}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onMouseDown={() => startLongPress(conv)}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelLongPress();
          setTagModalConv(conv);
        }}
        className={`w-full text-left px-3 py-2.5 transition-all flex items-start gap-2.5 hover:bg-muted/50 select-none group relative ${
          isSelected
            ? 'bg-muted border-l-4 border-l-primary'
            : 'border-l-4 border-l-transparent'
        }`}
        title="Clic para abrir • Mantén presionado o clic derecho para etiquetas"
      >
        <Avatar className="w-9 h-9 border shrink-0 mt-0.5">
          <AvatarFallback className="bg-muted/40 text-slate-300 font-bold text-xs">
            {conv.cliente_nombre ? conv.cliente_nombre.slice(0, 2).toUpperCase() : 'CL'}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="font-semibold text-sm truncate text-foreground">
              {conv.cliente_nombre || 'Cliente'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelLongPress();
                  setTagModalConv(conv);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-blue-400 rounded"
                title="Asignar etiquetas"
              >
                <Tag className="w-3 h-3" />
              </button>
              <span className="text-[11px] text-muted-foreground">
                {timeDisplay}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground truncate">
            {conv.ultimo_mensaje || 'Conversación iniciada'}
          </p>

          {(isAttention || isHuman || conv.canal === 'simulador' || (conv.etiquetas && conv.etiquetas.length > 0) || unread > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              {isAttention && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/40 text-red-400 bg-red-500/10 font-medium gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" /> Requiere atención
                </Badge>
              )}
              {isHuman && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/40 text-blue-400 bg-blue-500/10 gap-1">
                  <User className="w-2.5 h-2.5" /> Humano
                </Badge>
              )}

              {conv.canal === 'simulador' && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 opacity-70">
                  Simulador
                </Badge>
              )}

              {/* Conversation Tag Badges */}
              {conv.etiquetas && conv.etiquetas.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {conv.etiquetas.map((t) => {
                    const found = AVAILABLE_TAGS.find((at) => at.id === t);
                    return (
                      <span
                        key={t}
                        className={`text-[9px] px-1.5 py-0.2 rounded-full border font-medium ${
                          found ? found.color : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {found ? found.label : t}
                      </span>
                    );
                  })}
                </div>
              )}

              {unread > 0 && (
                <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {unread}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    );
  };

  // Permission Guard
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="w-16 h-16 text-slate-400 mb-4" />
        <h2 className="text-2xl font-bold tracking-tight mb-2">Acceso Restringido</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          No tienes permisos suficientes para ver el módulo de Mensajes y WhatsApp. Solicita el permiso
          <strong className="text-foreground"> "Ver conversaciones"</strong> a tu administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-9rem)] md:h-[calc(100dvh-4rem)] w-full overflow-hidden bg-background">
      {/* Top Header Bar */}
      <header className="h-14 md:h-16 border-b px-3 md:px-6 flex items-center justify-between bg-card/60 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <MessageSquare className="w-5 h-5 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold tracking-tight truncate">Mensajes</h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                {assistantName} AI
              </span>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center space-x-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsSimulatorOpen(true)}
            className="h-8 text-xs font-semibold px-2.5 gap-1.5 border-blue-500/40 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600 transition-colors shadow-xs"
            title="Abrir Simulador de Pruebas (Sandbox)"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <span>Simulador IA</span>
          </Button>

          <button
            type="button"
            onClick={handleExportVCard}
            disabled={isExportingVCard}
            title="Exportar contactos (.vcf)"
            aria-label="Exportar contactos (.vcf)"
            className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors disabled:opacity-50"
          >
            {isExportingVCard ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsNewConvModalOpen(true)}
            title="Nuevo chat"
            aria-label="Nuevo chat"
            className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Workspace (3 Columns) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ============================================================ */}
        {/* COLUMNA 1: LISTA DE CONVERSACIONES (IZQUIERDA) */}
        {/* ============================================================ */}
        <aside className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-card/30 shrink-0 transition-all ${
          !isChatListVisible ? 'hidden' : selectedConvId ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Search & Filter Header (Unificado en barra + menú 3 puntitos) */}
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-7 h-9 text-xs rounded-xl bg-background/80 border-border/70 focus-visible:ring-1 focus-visible:ring-blue-500"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    title="Borrar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Menú de 3 puntitos para Filtros de Estado y Etiquetas */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 transition-all relative ${
                      filterMode !== 'todos' || filterTag
                        ? 'border-blue-500 bg-blue-500/15 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                        : 'border-border/70 text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                    title="Filtrar por estado o etiqueta"
                  >
                    <MoreVertical className="w-4 h-4" />
                    {(filterMode !== 'todos' || filterTag) && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 bg-[#151b2e] border-2 border-blue-500 text-white rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5 z-50 max-h-[85vh] overflow-y-auto"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Estado de atención
                  </div>
                  <DropdownMenuItem
                    onClick={() => setFilterMode('todos')}
                    className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer flex items-center justify-between"
                  >
                    <span>Todos ({rawConversations.length})</span>
                    {filterMode === 'todos' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setFilterMode('requiere_atencion')}
                    className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer flex items-center justify-between text-red-400"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      Requiere atención {attentionCount > 0 && `(${attentionCount})`}
                    </span>
                    {filterMode === 'requiere_atencion' && <Check className="w-3.5 h-3.5 text-red-400" />}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setFilterMode('bot_activo')}
                    className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-slate-400" />
                      {assistantName} activa
                    </span>
                    {filterMode === 'bot_activo' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setFilterMode('humano_al_mando')}
                    className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Humano al mando
                    </span>
                    {filterMode === 'humano_al_mando' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setFilterMode('no_leidos')}
                    className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer flex items-center justify-between"
                  >
                    <span>No leídos</span>
                    {filterMode === 'no_leidos' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </DropdownMenuItem>

                  <div className="my-1.5 border-t border-slate-700/60" />

                  <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Filtrar por etiqueta
                  </div>
                  <DropdownMenuItem
                    onClick={() => setFilterTag(null)}
                    className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer flex items-center justify-between"
                  >
                    <span>Todas las etiquetas</span>
                    {!filterTag && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </DropdownMenuItem>

                  {AVAILABLE_TAGS.map((t) => {
                    const isSelected = filterTag === t.id;
                    return (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => setFilterTag(isSelected ? null : t.id)}
                        className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer flex items-center justify-between"
                      >
                        <span className={t.id === 'VIP' ? 'text-[#C5A880] font-semibold' : ''}>{t.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </DropdownMenuItem>
                    );
                  })}

                  {(filterMode !== 'todos' || filterTag) && (
                    <>
                      <div className="my-1.5 border-t border-slate-700/60" />
                      <DropdownMenuItem
                        onClick={() => {
                          setFilterMode('todos');
                          setFilterTag(null);
                        }}
                        className="text-xs rounded-lg focus:bg-blue-500/20 cursor-pointer text-slate-400 hover:text-white justify-center font-medium"
                      >
                        Limpiar todos los filtros
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Chip de filtro activo con botón de remover si hay algún filtro seleccionado */}
            {(filterMode !== 'todos' || filterTag) && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {filterMode !== 'todos' && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-medium">
                    {filterMode === 'requiere_atencion' && 'Atención'}
                    {filterMode === 'bot_activo' && `${assistantName} activa`}
                    {filterMode === 'humano_al_mando' && 'Humano'}
                    {filterMode === 'no_leidos' && 'No leídos'}
                    <button
                      type="button"
                      onClick={() => setFilterMode('todos')}
                      className="hover:text-white ml-0.5"
                      title="Quitar filtro"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {filterTag && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground border border-border font-medium">
                    {AVAILABLE_TAGS.find((t) => t.id === filterTag)?.label || filterTag}
                    <button
                      type="button"
                      onClick={() => setFilterTag(null)}
                      className="hover:text-destructive ml-0.5"
                      title="Quitar etiqueta"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('todos');
                    setFilterTag(null);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                >
                  Restablecer
                </button>
              </div>
            )}
          </div>

          {/* Conversations List */}
          <ScrollArea className="flex-1">
            {conversationsLoading || (searchTerm.trim() && clientsLoading) ? (
              <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                Cargando conversaciones...
              </div>
            ) : !searchTerm.trim() ? (
              /* Modo Normal: Listado de conversaciones */
              filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
                  <p>No se encontraron conversaciones con los filtros actuales.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsNewConvModalOpen(true)}
                    className="mt-2 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Iniciar conversación
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filteredConversations.map(renderConversationItem)}
                </div>
              )
            ) : (
              /* Modo Búsqueda Unificada: Conversaciones + Clientes de la Barbería */
              filteredConversations.length === 0 && matchingClients.length === 0 ? (
                <div className="p-4 space-y-3">
                  {/* Si lo que escribió parece un número no registrado, darle la opción de chatear de inmediato */}
                  {searchPhoneDigits.length >= 7 && !hasConvWithSearchPhone ? (
                    <div>
                      <p className="text-[11px] text-muted-foreground px-1 pb-1.5 font-medium">
                        Número no registrado en el sistema:
                      </p>
                      <button
                        type="button"
                        onClick={() => handleStartConversationWithPhone(searchPhoneDigits)}
                        className="w-full text-left p-3 rounded-xl border border-blue-500/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all flex items-center justify-between gap-3 group shadow-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Phone className="w-4 h-4 text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              Iniciar chat con este nuevo número
                            </p>
                            <p className="text-[11px] text-blue-400 font-sans truncate">
                              +{searchPhoneDigits} (Cliente nuevo de prueba)
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-blue-400 group-hover:text-blue-300 flex items-center gap-1 shrink-0">
                          <Plus className="w-3.5 h-3.5" /> Chatear
                        </span>
                      </button>
                    </div>
                  ) : null}

                  <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                    <SearchX className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-xs">
                      No se encontraron conversaciones ni clientes con &quot;<span className="text-foreground font-semibold">{searchTerm}</span>&quot;.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsNewConvModalOpen(true)}
                      className="mt-1 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Iniciar conversación
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {/* Opción rápida: Si lo que escribió parece un número nuevo no registrado */}
                  {searchPhoneDigits.length >= 7 && !hasConvWithSearchPhone && (
                    <div className="px-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleStartConversationWithPhone(searchPhoneDigits)}
                        className="w-full text-left p-2.5 rounded-xl border border-blue-500/60 bg-blue-500/10 hover:bg-blue-500/20 transition-all flex items-center justify-between gap-3 group shadow-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Phone className="w-4 h-4 text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              Iniciar chat con nuevo número
                            </p>
                            <p className="text-[11px] text-blue-400 font-sans truncate">
                              +{searchPhoneDigits} (No registrado)
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-blue-400 group-hover:text-blue-300 flex items-center gap-1 shrink-0">
                          <Plus className="w-3.5 h-3.5" /> Chatear
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Sección: Conversaciones existentes coincidentes */}
                  {filteredConversations.length > 0 && (
                    <div>
                      <div className="bg-muted/30 px-3 py-1.5 border-b border-border/40 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
                        <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                          Conversaciones ({filteredConversations.length})
                        </span>
                      </div>
                      <div className="divide-y divide-border/40">
                        {filteredConversations.map(renderConversationItem)}
                      </div>
                    </div>
                  )}

                  {/* Sección: Clientes registrados en el sistema */}
                  {matchingClients.length > 0 && (
                    <div className={filteredConversations.length > 0 ? 'mt-2' : ''}>
                      <div className="bg-muted/30 px-3 py-1.5 border-y border-border/40 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
                        <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-400" />
                          Clientes registrados ({matchingClients.length})
                        </span>
                        <span className="text-[10px] text-muted-foreground">Directorio</span>
                      </div>
                      <div className="divide-y divide-border/40">
                        {matchingClients.map((client) => {
                          const cleanPhone = String(client.telefono ?? '').replace(/\D/g, '');
                          const existingConv = rawConversations.find(
                            (c) =>
                              (cleanPhone && String(c.cliente_telefono ?? '').replace(/\D/g, '') === cleanPhone) ||
                              (client.id && c.cliente_id === client.id) ||
                              (cleanPhone && c.id === cleanPhone) ||
                              (client.id && c.id === client.id)
                          );
                          const isSelected = existingConv && existingConv.id === selectedConvId;
                          const isVip = client.nivel === 'VIP' || (client as any).es_vip;

                          return (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => handleStartConversationWithClient(client)}
                              className={`w-full text-left px-3 py-2.5 transition-all flex items-center justify-between gap-2.5 hover:bg-muted/50 select-none group border-l-4 ${
                                isSelected ? 'bg-muted border-l-primary' : 'border-l-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <Avatar className="w-8 h-8 border shrink-0">
                                  <AvatarImage src={client.foto_perfil_url || client.photoURL || client.avatarUrl || client.fotoUrl} />
                                  <AvatarFallback className="bg-muted/40 text-slate-300 font-bold text-xs">
                                    {(client.nombre || 'C').charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-xs truncate text-foreground">
                                      {client.nombre} {client.apellido || ''}
                                    </span>
                                    {isVip && (
                                      <span className="text-[9px] px-1.5 py-0 rounded-full border border-[#C5A880]/40 text-[#C5A880] font-medium shrink-0">
                                        VIP
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground truncate font-sans">
                                    {client.telefono || client.correo || 'Sin teléfono'}
                                  </p>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center">
                                {existingConv ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 group-hover:text-blue-300">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Abrir
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 group-hover:text-blue-400 bg-muted/60 group-hover:bg-blue-500/10 px-2 py-0.5 rounded-lg border border-border/60 group-hover:border-blue-500/30 transition-all">
                                    <MessageSquarePlus className="w-3.5 h-3.5 text-blue-400" />
                                    Iniciar
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </ScrollArea>
        </aside>

        {/* ============================================================ */}
        {/* COLUMNA 2: CHAT ACTIVO Y MENSAJES (CENTRO) */}
        {/* ============================================================ */}
        <main className={`flex-1 flex flex-col bg-background/50 overflow-hidden ${!selectedConvId ? 'hidden md:flex' : 'flex'}`}>
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="h-14 md:h-16 border-b px-3 md:px-4 flex items-center justify-between bg-card/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                  {/* Mobile Back Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedConvId(null)}
                    className="h-8 w-8 -ml-1 md:hidden text-muted-foreground hover:text-foreground shrink-0"
                    title="Volver a la lista de mensajes"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>

                  {/* Toggle Show/Hide Chat List (Desktop) */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsChatListVisible(!isChatListVisible)}
                    className="h-8 w-8 -ml-1 hidden md:flex text-slate-400 hover:text-white hover:bg-white/10 shrink-0"
                    title={isChatListVisible ? "Ocultar lista de chats" : "Mostrar lista de chats"}
                  >
                    {isChatListVisible ? (
                      <PanelLeftClose className="w-4 h-4" />
                    ) : (
                      <PanelLeftOpen className="w-4 h-4" />
                    )}
                  </Button>

                  <Avatar
                    className="w-8 h-8 md:w-9 md:h-9 border shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setIsMobileSheetOpen(true);
                      } else {
                        setShowRightPanel(!showRightPanel);
                      }
                    }}
                  >
                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-xs">
                      {activeConversation.cliente_nombre
                        ? activeConversation.cliente_nombre.slice(0, 2).toUpperCase()
                        : 'CL'}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className="min-w-0 cursor-pointer"
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setIsMobileSheetOpen(true);
                      } else {
                        setShowRightPanel(!showRightPanel);
                      }
                    }}
                    title="Ver/ocultar ficha del cliente"
                  >
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <h2 className="font-semibold text-xs md:text-sm truncate hover:text-blue-400 transition-colors">
                        {activeConversation.cliente_nombre || 'Cliente'}
                      </h2>
                      <span className="text-[10px] md:text-[11px] text-muted-foreground font-mono hidden sm:inline">
                        {activeConversation.cliente_telefono || activeConversation.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <p className="text-[10px] md:text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                        {activeConversation.modo_atencion === 'requiere_atencion' ? (
                          <span className="text-red-400 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5 md:w-3 md:h-3 text-red-400" /> Requiere atención
                          </span>
                        ) : activeConversation.modo_atencion === 'humano_al_mando' ? (
                          <span className="text-blue-400 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Recepcionista
                          </span>
                        ) : (
                          <span className="text-blue-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> {assistantName} activa
                          </span>
                        )}
                      </p>

                      {/* Active Conversation Tags */}
                      {activeConversation.etiquetas?.map((tagId) => {
                        const tInfo = AVAILABLE_TAGS.find((at) => at.id === tagId);
                        return (
                          <span
                            key={tagId}
                            onClick={() => handleToggleTag(tagId)}
                            title="Haz clic para quitar etiqueta"
                            className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded-full border font-medium cursor-pointer hover:opacity-75 ${
                              tInfo ? tInfo.color : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {tInfo ? tInfo.label : tagId}
                            <X className="w-2.5 h-2.5" />
                          </span>
                        );
                      })}

                      {/* Add Tag Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-full border border-dashed border-border/80 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                            title="Gestionar etiquetas"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Tag</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          {AVAILABLE_TAGS.map((t) => {
                            const isAssigned = activeConversation.etiquetas?.includes(t.id);
                            return (
                              <DropdownMenuItem
                                key={t.id}
                                onClick={() => handleToggleTag(t.id)}
                                className="flex items-center justify-between text-xs cursor-pointer"
                              >
                                <span className="font-medium">{t.label}</span>
                                {isAssigned && <Check className="w-3.5 h-3.5 text-primary" />}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>

                {/* Right controls: Probar Recordatorio, Sound Toggle, Tomar Control Switch & Info Panel Toggle */}
                <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0">
                  {/* Quick Test Reminder Button */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSendingDirectReminder}
                    onClick={handleSendDirectReminderTest}
                    className="h-8 text-xs font-semibold px-2.5 gap-1.5 border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-600 transition-colors shrink-0"
                    title="Enviar recordatorio interactivo con los 3 botones a este chat"
                  >
                    {isSendingDirectReminder ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Bell className="h-3.5 w-3.5 text-yellow-500" />
                    )}
                    <span className="hidden sm:inline">Probar Recordatorio</span>
                  </Button>

                  {/* Sound Notifications Toggle */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSoundEnabled(!soundEnabled);
                      toast({
                        title: !soundEnabled ? '🔔 Sonido activado' : '🔕 Sonido silenciado',
                        description: !soundEnabled
                          ? 'Escucharás un timbre cuando lleguen mensajes del cliente.'
                          : 'Sonido de notificaciones desactivado.',
                      });
                    }}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title={soundEnabled ? 'Silenciar timbre' : 'Activar timbre'}
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-blue-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>

                  {/* Bot Takeover Switch */}
                  <div className="flex items-center gap-1.5 md:gap-2 bg-muted/60 px-2 md:px-2.5 py-1 rounded-lg border border-border/50">
                    <div className="flex flex-col text-right">
                      <span className="text-[11px] md:text-xs font-semibold">
                        {activeConversation.modo_atencion === 'humano_al_mando'
                          ? 'Humano'
                          : assistantName}
                      </span>
                      <span className="text-[9px] text-muted-foreground hidden sm:inline">
                        {activeConversation.modo_atencion === 'humano_al_mando'
                          ? 'Pausado'
                          : 'Auto'}
                      </span>
                    </div>
                    <Switch
                      checked={activeConversation.modo_atencion === 'humano_al_mando'}
                      onCheckedChange={handleToggleMode}
                      disabled={isTogglingMode}
                      aria-label="Tomar control de la conversación"
                      className="scale-90 md:scale-100"
                    />
                  </div>

                  {/* Toggle details sidebar / mobile sheet */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 768) {
                        setIsMobileSheetOpen(true);
                      } else {
                        setShowRightPanel(!showRightPanel);
                      }
                    }}
                    className={`h-8 w-8 rounded-lg transition-colors ${
                      showRightPanel
                        ? "text-blue-400 bg-blue-500/15 hover:bg-blue-500/25"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={showRightPanel ? "Ocultar ficha del cliente" : "Ver ficha del cliente"}
                  >
                    <Info className="w-4 h-4 md:w-5 md:h-5" />
                  </Button>

                  {/* Delete Conversation Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenDeleteModal(activeConversation)}
                    disabled={isDeletingConversation}
                    className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 h-8 w-8"
                    title="Eliminar conversación"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Handover Alert Banner */}
              {activeConversation.modo_atencion === 'requiere_atencion' && (
                <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between text-xs text-red-400">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>
                      <strong>Atención requerida:</strong> El cliente tiene una consulta que requiere
                      un recepcionista.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => handleToggleMode(true)}
                  >
                    Atender ahora (Pausar a {assistantName})
                  </Button>
                </div>
              )}

              {/* Message Stream */}
              <div
                ref={chatScrollContainerRef}
                className="flex-1 overflow-y-auto p-4 md:p-6 overscroll-contain"
              >
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-48 text-sm text-muted-foreground gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                    Cargando historial de mensajes...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground gap-2">
                    <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm font-medium">Aún no hay mensajes en esta conversación.</p>
                    <p className="text-xs max-w-xs">
                      Envía un mensaje para comenzar a chatear o espera el próximo mensaje del cliente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 max-w-3xl mx-auto">
                    {messages.map((msg, index) => {
                      const isClient = msg.de === 'cliente';
                      const isBot = msg.de === 'bot';
                      const isStaff = msg.de === 'recepcion';
                      const isSystem = msg.tipo === 'sistema';
                      const isInternalNote = msg.tipo === 'nota_interna';

                      // Format timestamp
                      let timeStr = '';
                      if (msg.timestamp) {
                        const date = msg.timestamp?.toDate
                          ? msg.timestamp.toDate()
                          : new Date(msg.timestamp);
                        timeStr = format(date, 'HH:mm', { locale: es });
                      }

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-2">
                            <span className="text-[11px] bg-muted/70 text-muted-foreground px-3 py-1 rounded-full border border-border/40">
                              {msg.texto}
                            </span>
                          </div>
                        );
                      }

                      // Internal staff note (Private team note)
                      if (isInternalNote) {
                        return (
                          <div key={msg.id} className="flex justify-center my-2 w-full">
                            <div className="w-full max-w-lg rounded-xl p-3 bg-muted/40 border border-border/70 text-xs text-foreground shadow-sm space-y-1.5">
                              <div className="flex items-center justify-between border-b border-border/50 pb-1 font-semibold text-[11px]">
                                <span className="flex items-center gap-1.5 text-blue-400">
                                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                                  Nota Interna • {msg.metadata?.staffName || 'Recepción'}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-normal">{timeStr}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-foreground/90 font-medium">{msg.texto}</p>
                              <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1 text-slate-400">
                                  <EyeOff className="w-3 h-3 text-slate-400" /> Privado: el cliente no ve esta nota
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const prevMsg = index > 0 ? messages[index - 1] : null;
                      const isSameSender = prevMsg && prevMsg.de === msg.de && prevMsg.tipo !== 'nota_interna' && msg.tipo !== 'nota_interna';

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            isClient ? 'items-start' : 'items-end'
                          } ${isSameSender ? 'mt-1' : 'mt-2.5'}`}
                        >
                          {/* Modern WhatsApp-Style Clean Bubble */}
                          <div
                            className={`max-w-[85%] md:max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-xs leading-relaxed whitespace-pre-wrap transition-all relative ${
                              isClient
                                ? 'bg-card border border-border/70 text-foreground rounded-tl-sm'
                                : isBot
                                ? 'bg-[#18223c] text-white border border-blue-500/25 rounded-tr-sm'
                                : 'bg-[#202A49] text-white border border-blue-500/40 rounded-tr-sm'
                            }`}
                          >
                            {/* Attached Media: Voice Audio Player or Image Preview */}
                            {msg.tipo === 'audio' || msg.mediaUrl?.includes('chat_audio') || msg.mediaUrl?.startsWith('data:audio') ? (
                              <div className="mb-2 p-2 rounded-xl bg-background/90 border border-border/60 shadow-xs flex flex-col gap-1.5 min-w-[220px]">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                                  <span className="flex items-center gap-1 font-medium text-blue-400">
                                    <Mic className="w-3.5 h-3.5 text-blue-400" />
                                    Nota de voz
                                  </span>
                                  {msg.metadata?.duration ? (
                                    <span className="text-[10px] font-mono font-semibold">
                                      {Math.floor(msg.metadata.duration / 60)}:{String(msg.metadata.duration % 60).padStart(2, '0')}
                                    </span>
                                  ) : null}
                                </div>
                                <audio
                                  controls
                                  src={msg.mediaUrl}
                                  className="w-full h-8 rounded-lg focus:outline-none"
                                  preload="metadata"
                                />
                              </div>
                            ) : msg.mediaUrl ? (
                              <div className="mb-2 rounded-lg overflow-hidden border border-border/50 bg-black/5">
                                <img
                                  src={msg.mediaUrl}
                                  alt="Archivo adjunto"
                                  className="max-h-60 w-auto object-cover rounded cursor-pointer hover:opacity-95 transition-opacity"
                                  onClick={() => window.open(msg.mediaUrl, '_blank')}
                                />
                              </div>
                            ) : null}

                            <div className="break-words">
                              <FormattedChatText text={msg.texto} />

                              {/* Interactive Action Buttons (Appointment Reminder / Confirmation) */}
                              {msg.metadata?.buttons && msg.metadata.buttons.length > 0 && (
                                <div className="mt-3 pt-2.5 border-t border-border/40">
                                  {msg.metadata.selected_action ? (
                                    <div className="py-1 px-2.5 rounded-lg text-xs font-semibold select-none flex items-center gap-1.5">
                                      {msg.metadata.selected_action === 'confirm' && (
                                        <span className="flex items-center gap-1.5 text-yellow-400">
                                          <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />
                                          Cita confirmada en agenda (Etiqueta Amarilla)
                                        </span>
                                      )}
                                      {msg.metadata.selected_action === 'reschedule' && (
                                        <span className="flex items-center gap-1.5 text-blue-400">
                                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                          Reagendamiento solicitado
                                        </span>
                                      )}
                                      {msg.metadata.selected_action === 'cancel' && (
                                        <span className="flex items-center gap-1.5 text-red-400">
                                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                                          Cita cancelada
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col sm:flex-row flex-wrap gap-1.5 pt-1">
                                      {msg.metadata.buttons.map((btn: any) => {
                                        const isConfirm = btn.action === 'confirm';
                                        const isReschedule = btn.action === 'reschedule';
                                        const isCancel = btn.action === 'cancel';

                                        return (
                                          <button
                                            key={btn.id || btn.action}
                                            type="button"
                                            disabled={isProcessingAction}
                                            onClick={() => handleExecuteAppointmentAction(msg, btn.action)}
                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                                              isConfirm
                                                ? 'bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold border-0 shadow-md active:scale-95'
                                                : isReschedule
                                                ? 'bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/40 active:scale-95'
                                                : 'bg-slate-800/80 hover:bg-slate-700/80 text-red-400 border border-red-500/30 active:scale-95'
                                            }`}
                                          >
                                            {isConfirm && <Check className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />}
                                            {isReschedule && <Calendar className="w-3.5 h-3.5 text-blue-400" />}
                                            {isCancel && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                                            <span>{btn.label}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Legal Links Footer */}
                                  <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center gap-1.5 text-[10px] text-slate-400 select-none">
                                    <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                                    <a
                                      href="/terminos"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:text-slate-200 underline decoration-slate-600/60 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Términos y Condiciones
                                    </a>
                                    <span className="text-slate-600">•</span>
                                    <a
                                      href="/privacidad"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:text-slate-200 underline decoration-slate-600/60 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Aviso de Privacidad
                                    </a>
                                  </div>
                                </div>
                              )}
                              
                              {/* In-bubble subtle timestamp & sender indicator */}
                              <span
                                className={`float-right ml-2.5 mt-1 text-[10px] select-none leading-none inline-flex items-center gap-1 ${
                                  isClient
                                    ? 'text-muted-foreground/70'
                                    : 'text-slate-300/80'
                                }`}
                              >
                                {isBot && <Bot className="w-2.5 h-2.5 text-blue-400 inline" />}
                                {isStaff && <CheckCircle2 className="w-2.5 h-2.5 text-blue-400 inline" />}
                                {isStaff && <span>{msg.metadata?.staffName || 'Recepción'} •</span>}
                                <span>{timeStr}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Typing bubble when assistant is analyzing schedule and responding */}
                    {isProcessingAI && (
                      <div className="flex flex-col items-start animate-in fade-in duration-300">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1 px-1">
                          <Bot className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                          <span className="text-blue-500 font-medium">{assistantName} está consultando la agenda...</span>
                        </div>
                        <div className="bg-primary/10 border border-primary/20 text-foreground rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-1.5 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 rounded-full bg-primary/70 animate-bounce" />
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Message Input Box - Minimalist & Feature-Rich with Drag & Drop */}
              <div
                className={`p-2.5 md:p-3.5 border-t bg-card/60 backdrop-blur-sm shrink-0 transition-all relative ${
                  isDraggingFile ? 'bg-primary/10 ring-2 ring-dashed ring-primary' : ''
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDropFile}
              >
                {/* Drag and drop overlay */}
                {isDraggingFile && (
                  <div className="absolute inset-0 bg-primary/15 backdrop-blur-xs z-20 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary pointer-events-none">
                    <UploadCloud className="w-8 h-8 text-primary animate-bounce" />
                    <span className="text-xs font-semibold text-primary">
                      Suelta la imagen aquí para adjuntarla
                    </span>
                  </div>
                )}

                <div className="max-w-3xl mx-auto space-y-2">
                  {/* Selector de rol de envío y herramientas rápidas */}
                  <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                    <div className="inline-flex p-0.5 rounded-lg bg-muted/80 border border-border/40">
                      {(activeConversation.canal === 'simulador' ||
                        activeConversation.canal === 'web' ||
                        activeConversation.id.startsWith('web') ||
                        activeConversation.id.startsWith('sim') ||
                        activeConversation.cliente_nombre?.toLowerCase().includes('web') ||
                        activeConversation.cliente_nombre?.toLowerCase().includes('prueba')) && (
                        <button
                          type="button"
                          onClick={() => setSendRole('cliente')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-xs font-medium ${
                            sendRole === 'cliente'
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <User className="w-3 h-3 text-blue-500" />
                          <span>Probar (Cliente)</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSendRole('recepcion')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-xs font-medium ${
                          sendRole === 'recepcion'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Scissors className="w-3 h-3 text-blue-400" />
                        <span>Mensaje</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendRole('nota_interna')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-xs font-medium ${
                          sendRole === 'nota_interna'
                            ? 'bg-[#202A49] text-white font-semibold shadow-sm'
                            : 'text-slate-400 hover:text-foreground'
                        }`}
                      >
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>Nota Interna</span>
                      </button>
                    </div>

                    {/* Quick Replies Dropdown & Options */}
                    <div className="flex items-center gap-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground border-border/60"
                          >
                            <Bookmark className="w-3 h-3 text-muted-foreground" />
                            <span>Respuestas Rápidas</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5 space-y-1">
                          {quickRepliesList.map((qr) => (
                            <DropdownMenuItem
                              key={qr.id}
                              className="flex flex-col items-start gap-1 text-xs py-2 px-2.5 cursor-pointer rounded-lg hover:bg-muted/60 transition-colors border border-transparent hover:border-border/50"
                              onClick={() => {
                                setStaffInput(qr.text);
                                if (sendRole === 'nota_interna') setSendRole('recepcion');
                              }}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="font-semibold text-foreground text-xs">{qr.title}</span>
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                                  {qr.category}
                                </Badge>
                              </div>
                              <span className="text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
                                {qr.text.split('\n')[0] || qr.text}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Hidden File Input for Device Photos */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleProcessImageFile(e.target.files[0]);
                          }
                        }}
                      />

                      {sendRole === 'recepcion' && (
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none ml-1">
                          <input
                            type="checkbox"
                            checked={pauseBotOnSend}
                            onChange={(e) => setPauseBotOnSend(e.target.checked)}
                            className="rounded border-muted-foreground/30 accent-primary w-3 h-3"
                          />
                          <span className="hidden sm:inline">Pausar a {assistantName}</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Manual URL input if toggled */}
                  {showImageInput && !attachedImageUrl && (
                    <div className="p-2 rounded-lg bg-muted/40 border flex items-center gap-2 text-xs animate-in fade-in duration-150">
                      <ImageIcon className="w-4 h-4 text-primary shrink-0" />
                      <Input
                        placeholder="Pega la URL web de una imagen (ej: https://...)..."
                        value={attachedImageUrl}
                        onChange={(e) => setAttachedImageUrl(e.target.value)}
                        className="h-7 text-xs bg-background"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2 text-muted-foreground"
                        onClick={() => setShowImageInput(false)}
                      >
                        Cerrar
                      </Button>
                    </div>
                  )}

                  {/* Image Attachment Preview Card */}
                  {(attachedImageUrl || isUploadingImage) && (
                    <div className="p-2 rounded-xl bg-card border border-primary/20 shadow-xs flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isUploadingImage ? (
                          <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <RefreshCw className="w-5 h-5 text-primary animate-spin" />
                          </div>
                        ) : attachedImageUrl ? (
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0 bg-black/10">
                            <img
                              src={attachedImageUrl}
                              alt="Vista previa adjunto"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : null}

                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground text-xs truncate">
                            {isUploadingImage ? 'Cargando imagen...' : 'Imagen adjunta para enviar'}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {isUploadingImage
                              ? 'Procesando archivo...'
                              : 'Se enviará junto con el mensaje o de forma independiente'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isUploadingImage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => {
                              setAttachedImageUrl('');
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            title="Quitar imagen"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSendChatMessage} className="space-y-1.5">
                    {isRecordingAudio ? (
                      <div className="flex items-center justify-between gap-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl animate-in fade-in duration-200">
                        <div className="flex items-center gap-2.5 pl-2">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                          </span>
                          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                            Grabando nota de voz...
                          </span>
                          <span className="text-xs font-mono font-bold bg-rose-500/20 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-md">
                            {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={cancelVoiceRecording}
                            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive gap-1"
                            title="Cancelar grabación"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Cancelar</span>
                          </Button>

                          <Button
                            type="button"
                            onClick={finishAndSendVoiceRecording}
                            className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Enviar Nota</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-end gap-1.5 bg-background border rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm ${
                        sendRole === 'nota_interna'
                          ? 'border-blue-500/50 bg-blue-500/5'
                          : 'border-border/80'
                      }`}>
                        <Textarea
                          ref={chatTextareaRef}
                          onPaste={handlePasteImage}
                          placeholder={
                            sendRole === 'nota_interna'
                              ? 'Escribe una nota interna para el equipo...'
                              : sendRole === 'cliente'
                              ? 'Escribe como cliente de prueba...'
                              : canReply
                              ? 'Escribe un mensaje...'
                              : 'No tienes permiso para responder.'
                          }
                          value={staffInput}
                          onChange={(e) => {
                            setStaffInput(e.target.value);
                            if (chatTextareaRef.current) {
                              chatTextareaRef.current.style.height = 'auto';
                              chatTextareaRef.current.style.height = `${Math.max(38, Math.min(chatTextareaRef.current.scrollHeight, 180))}px`;
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendChatMessage();
                            }
                          }}
                          disabled={(sendRole === 'recepcion' && !canReply) || isSendingStaff || isProcessingAI || isUploadingImage}
                          rows={1}
                          className="min-h-[38px] max-h-[180px] resize-none overflow-y-auto border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2 text-sm bg-transparent shadow-none leading-relaxed transition-[height] duration-75"
                        />

                        {/* 4 Tool Icons: Clip, Cámara, Micrófono, Emojis */}
                        <div className="flex items-center gap-0.5 mb-0.5 shrink-0">
                          {/* 1. Clip - Adjuntar */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                            onClick={() => setShowImageInput(!showImageInput)}
                            disabled={isRecordingAudio}
                            title="Adjuntar enlace o archivo"
                          >
                            <Paperclip className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          </Button>

                          {/* 2. Cámara - Foto */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingImage || isRecordingAudio}
                            title="Tomar o adjuntar foto"
                          >
                            {isUploadingImage ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-gray-500 dark:text-gray-400" />
                            ) : (
                              <Camera className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            )}
                          </Button>

                          {/* 3. Micrófono - Grabar Voz */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                            onClick={startVoiceRecording}
                            disabled={(sendRole === 'recepcion' && !canReply) || isSendingStaff || isProcessingAI || isUploadingImage || isRecordingAudio}
                            title="Grabar nota de voz"
                          >
                            <Mic className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          </Button>

                          {/* 4. Emoji - Emojis */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                                title="Insertar emojis"
                              >
                                <Smile className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-72 p-2.5 rounded-xl z-50 mb-2 border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between pb-1 border-b text-xs">
                                  <span className="font-semibold text-foreground">Emojis</span>
                                  <span className="text-[10px] text-muted-foreground">Click para insertar</span>
                                </div>
                                {EMOJI_CATEGORIES.map((cat) => (
                                  <div key={cat.name} className="space-y-1">
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                      {cat.name}
                                    </span>
                                    <div className="grid grid-cols-6 gap-1">
                                      {cat.emojis.map((emoji, idx) => (
                                        <button
                                          key={idx}
                                          type="button"
                                          className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-muted active:scale-95 transition-all cursor-pointer"
                                          onClick={() => handleInsertEmoji(emoji)}
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>

                        <Button
                          type="submit"
                          size="icon"
                          disabled={
                            (sendRole === 'recepcion' && !canReply) ||
                            (!staffInput.trim() && !attachedImageUrl) ||
                            isSendingStaff ||
                            isProcessingAI ||
                            isUploadingImage
                          }
                          className={`h-8 w-8 rounded-xl shrink-0 shadow-sm flex items-center justify-center mb-0.5 ${
                            sendRole === 'nota_interna'
                              ? 'bg-[#202A49] hover:bg-[#18223c] text-white'
                              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                          }`}
                        >
                          {isSendingStaff || isProcessingAI || isUploadingImage ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    )}

                    {(isRecordingAudio || isProcessingAI || isUploadingImage || sendRole === 'nota_interna' || pauseBotOnSend) && (
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 pt-0.5 animate-in fade-in-50">
                        <span>
                          {isRecordingAudio ? (
                            <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                              <Mic className="w-3 h-3 animate-pulse" />
                              Grabando nota de voz... Pulsa 'Enviar Nota' o 'Cancelar'.
                            </span>
                          ) : isProcessingAI ? (
                            <span className="text-blue-400 font-medium flex items-center gap-1">
                              <Sparkles className="w-3 h-3 animate-spin" />
                              {assistantName} está consultando la agenda...
                            </span>
                          ) : isUploadingImage ? (
                            <span className="text-blue-400 font-medium flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Subiendo archivo de imagen...
                            </span>
                          ) : sendRole === 'nota_interna' ? (
                            <span className="text-blue-400 font-medium flex items-center gap-1">
                              <Lock className="w-3 h-3 text-slate-400" /> Modo Nota Interna activa (Solo visible para el personal)
                            </span>
                          ) : pauseBotOnSend ? (
                            <span className="text-slate-400">Se pausará a {assistantName} al enviar.</span>
                          ) : null}
                        </span>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-3">
              <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center text-muted-foreground">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Selecciona una conversación</h3>
              <p className="text-xs max-w-sm">
                Elige un chat de la lista izquierda para responder, pausar a {assistantName} o revisar el expediente de citas del cliente.
              </p>
              {!isChatListVisible && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsChatListVisible(true)}
                  className="gap-1.5 text-xs mt-2 border-border/70 text-slate-300 hover:text-white"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span>Mostrar lista de chats</span>
                </Button>
              )}
            </div>
          )}
        </main>

        {/* ============================================================ */}
        {/* COLUMNA 3: DETALLES DEL CLIENTE Y CITAS (DERECHA - ESCRITORIO) */}
        {/* ============================================================ */}
        {showRightPanel && activeConversation && (
          <aside className="hidden md:flex w-72 lg:w-80 border-l bg-card/40 flex-col overflow-y-auto shrink-0 transition-all">
            <div className="p-3.5 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                <User className="w-3.5 h-3.5 text-slate-400" /> Ficha del Cliente
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={() => setShowRightPanel(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="p-4">
              <ClientProfileContent
                activeConversation={activeConversation}
                clientDetails={clientDetails}
                loadingClientDetails={loadingClientDetails}
                onOpenAppointmentModal={() => setIsNewAppointmentModalOpen(true)}
                onOpenDetailModal={() => setIsClientDetailModalOpen(true)}
                onRefreshDetails={loadClientDetails}
              />
            </div>
          </aside>
        )}
      </div>

      {/* ============================================================ */}
      {/* SHEET: DETALLES DEL CLIENTE (MÓVIL) */}
      {/* ============================================================ */}
      <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" /> Ficha del Cliente
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            {activeConversation && (
              <ClientProfileContent
                activeConversation={activeConversation}
                clientDetails={clientDetails}
                loadingClientDetails={loadingClientDetails}
                onOpenAppointmentModal={() => {
                  setIsMobileSheetOpen(false);
                  setIsNewAppointmentModalOpen(true);
                }}
                onOpenDetailModal={() => {
                  setIsMobileSheetOpen(false);
                  setIsClientDetailModalOpen(true);
                }}
                onRefreshDetails={loadClientDetails}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ============================================================ */}
      {/* MODAL: SIMULADOR DE PRUEBAS / SANDBOX */}
      {/* ============================================================ */}
      <Dialog open={isSimulatorOpen} onOpenChange={setIsSimulatorOpen}>
        <DialogContent hideCloseButton={true} className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
          {/* Cabecera Oficial VATOS ALFA */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-slate-300 shrink-0" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    Simulador del Asistente Virtual (Sandbox)
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300 mt-0.5">
                    Prueba en vivo cómo interactúa la IA con los clientes y citas sin tocar WhatsApp.
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTriggerSimulatedReminder}
                  className="h-7 text-xs px-2.5 gap-1.5 bg-blue-500/10 border-blue-500/40 text-blue-300 hover:bg-blue-500/20 hover:text-white"
                  title="Simular envío de recordatorio con los 3 botones interactivos"
                >
                  <Bell className="w-3.5 h-3.5 text-blue-400" />
                  Probar Recordatorio
                </Button>

                <button
                  type="button"
                  onClick={() => setIsSimulatorOpen(false)}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Sandbox Config Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/40 border-b text-xs">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Nombre de prueba:
              </label>
              <Input
                value={simName}
                onChange={(e) => setSimName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Teléfono de prueba:
              </label>
              <Input
                value={simPhone}
                onChange={(e) => setSimPhone(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Correo de prueba:
              </label>
              <Input
                value={simEmail}
                onChange={(e) => setSimEmail(e.target.value)}
                placeholder="cliente@ejemplo.com (o vacío)"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Simulator Messages */}
          <div
            ref={simScrollContainerRef}
            className="flex-1 overflow-y-auto p-4 min-h-[300px] max-h-[420px] bg-background/50 overscroll-contain"
          >
            {simMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-center text-muted-foreground gap-3 p-4">
                <Sparkles className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Conversación libre y natural</p>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    Escribe abajo cualquier mensaje tal como lo haría un cliente por WhatsApp (ej. &ldquo;Hola buenas tardes, quiero un corte hoy en la tarde ¿qué horario tienes?&rdquo;).
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {simMessages.map((msg) => {
                  const isClient = msg.de === 'cliente';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isClient ? 'items-end' : 'items-start'
                      }`}
                    >
                      <span className="text-[10px] text-muted-foreground mb-0.5 px-1 font-medium">
                        {isClient ? simName : '💈 Recepción VATOS ALFA'}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                          isClient
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-card border text-card-foreground rounded-tl-sm'
                        }`}
                      >
                        <FormattedChatText text={msg.texto} className="text-xs" />

                        {/* Interactive Buttons in Simulator */}
                        {msg.metadata?.buttons && msg.metadata.buttons.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-border/40">
                            {msg.metadata.selected_action ? (
                              <div className="py-1 px-2 rounded-lg text-[11px] font-semibold select-none flex items-center gap-1.5">
                                {msg.metadata.selected_action === 'confirm' && (
                                  <span className="flex items-center gap-1.5 text-yellow-400">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" />
                                    Cita confirmada en agenda (Etiqueta Amarilla)
                                  </span>
                                )}
                                {msg.metadata.selected_action === 'reschedule' && (
                                  <span className="flex items-center gap-1.5 text-blue-400">
                                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                    Reagendamiento solicitado
                                  </span>
                                )}
                                {msg.metadata.selected_action === 'cancel' && (
                                  <span className="flex items-center gap-1.5 text-red-400">
                                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                                    Cita cancelada
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row flex-wrap gap-1.5 pt-1">
                                {msg.metadata.buttons.map((btn: any) => {
                                  const isConfirm = btn.action === 'confirm';
                                  const isReschedule = btn.action === 'reschedule';
                                  const isCancel = btn.action === 'cancel';

                                  return (
                                    <button
                                      key={btn.id || btn.action}
                                      type="button"
                                      disabled={isSimProcessing}
                                      onClick={() => handleExecuteSimulatorAction(msg, btn.action)}
                                      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all shadow-sm ${
                                        isConfirm
                                          ? 'bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold border-0 shadow-md active:scale-95'
                                          : isReschedule
                                          ? 'bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/40 active:scale-95'
                                          : 'bg-slate-800/80 hover:bg-slate-700/80 text-red-400 border border-red-500/30 active:scale-95'
                                      }`}
                                    >
                                      {isConfirm && <Check className="w-3 h-3 text-slate-950 stroke-[2.5]" />}
                                      {isReschedule && <Calendar className="w-3 h-3 text-blue-400" />}
                                      {isCancel && <XCircle className="w-3 h-3 text-red-400" />}
                                      <span>{btn.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Legal Links Footer */}
                            <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center gap-1.5 text-[9.5px] text-slate-400 select-none">
                              <FileText className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                              <a
                                href="/terminos"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-slate-200 underline decoration-slate-600/60 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Términos y Condiciones
                              </a>
                              <span className="text-slate-600">•</span>
                              <a
                                href="/privacidad"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-slate-200 underline decoration-slate-600/60 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Aviso de Privacidad
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isSimProcessing && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    Revisando agenda y formulando respuesta...
                  </div>
                )}
                <div ref={simMessagesEndRef} />
              </div>
            )}
          </div>

          {/* Simulator Input */}
          <div className="p-3 border-t bg-card/60">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendSimulatorMessage();
              }}
              className="flex items-center gap-2"
            >
              <Input
                placeholder="Escribe como cliente (ej. ¿Hay cita a las 4pm?)..."
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                disabled={isSimProcessing}
                className="text-xs h-9"
              />
              <Button
                type="submit"
                disabled={!simInput.trim() || isSimProcessing}
                size="sm"
                className="h-9 px-3 gap-1 bg-primary text-primary-foreground"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* MODAL: INICIAR CONVERSACIÓN CON CLIENTE EXISTENTE */}
      {/* ============================================================ */}
      <NewConversationModal
        isOpen={isNewConvModalOpen}
        onOpenChange={setIsNewConvModalOpen}
        onClientSelected={(client: Client) => {
          setIsNewConvModalOpen(false);
          handleStartConversationWithClient(client);
        }}
      />

      {/* ============================================================ */}
      {/* MODAL: CREAR CITA EN AGENDA PARA EL CLIENTE ACTIVO */}
      {/* ============================================================ */}
      {isNewAppointmentModalOpen && (
        <Dialog open={isNewAppointmentModalOpen} onOpenChange={setIsNewAppointmentModalOpen}>
          <DialogContent hideCloseButton={true} className="max-w-3xl max-h-[90vh] overflow-hidden p-0 rounded-2xl shadow-2xl border border-slate-800 bg-background flex flex-col">
            {/* Cabecera Oficial VATOS ALFA */}
            <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
              <div className="header-light-beam" aria-hidden="true" />
              <div className="relative z-10 flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-slate-300 shrink-0" />
                  <div>
                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                      Nueva Cita para {activeConversation?.cliente_nombre}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-300 mt-0.5">
                      Agenda directamente en la plataforma para este cliente.
                    </DialogDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewAppointmentModalOpen(false)}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <NewReservationForm
                isOpen={isNewAppointmentModalOpen}
                onOpenChange={setIsNewAppointmentModalOpen}
                onFormSubmit={() => {
                  setIsNewAppointmentModalOpen(false);
                  toast({
                    title: '✅ Cita creada',
                    description: 'La reserva ha sido guardada en la agenda.',
                  });
                }}
                initialData={{
                  customer: clientDetails?.client || {
                    id: activeConversation?.cliente_id || '',
                    nombre: activeConversation?.cliente_nombre || '',
                    apellido: '',
                    correo: '',
                    telefono: activeConversation?.cliente_telefono || '',
                    creado_en: Timestamp.now(),
                  },
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ============================================================ */}
      {/* MODAL: FICHA COMPLETA DEL CLIENTE */}
      {/* ============================================================ */}
      {isClientDetailModalOpen && clientDetails?.client && (
        <ClientDetailModal
          client={clientDetails.client}
          isOpen={isClientDetailModalOpen}
          onOpenChange={setIsClientDetailModalOpen}
          onNewReservation={() => {
            setIsClientDetailModalOpen(false);
            setIsNewAppointmentModalOpen(true);
          }}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL: ASIGNAR / GESTIONAR ETIQUETAS (LONG PRESS) */}
      {/* ============================================================ */}
      {tagModalConv && (
        <Dialog open={!!tagModalConv} onOpenChange={(open) => !open && setTagModalConv(null)}>
          <DialogContent
            hideCloseButton={true}
            className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background"
          >
            {/* Cabecera Oficial VATOS ALFA */}
            <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
              <div className="header-light-beam" aria-hidden="true" />
              <div className="relative z-10 flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                  <Tag className="w-4 h-4 text-slate-300 shrink-0" />
                  <div>
                    <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">
                      Etiquetas de Conversación
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-300 mt-0.5 truncate max-w-[280px]">
                      {tagModalConv.cliente_nombre || 'Cliente'} {tagModalConv.cliente_telefono ? `• ${tagModalConv.cliente_telefono}` : ''}
                    </DialogDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTagModalConv(null)}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Body con opciones de etiquetas */}
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Selecciona las etiquetas que deseas asignar a este chat para clasificar la atención:
              </p>

              <div className="grid grid-cols-1 gap-2 pt-1">
                {AVAILABLE_TAGS.map((tag) => {
                  const currentInState = rawConversations.find((c) => c.id === tagModalConv.id) || tagModalConv;
                  const activeInConv = currentInState?.etiquetas?.includes(tag.id) ?? false;

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleToggleTag(tag.id, currentInState)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs font-medium cursor-pointer ${
                        activeInConv
                          ? 'border-blue-500/70 bg-blue-500/10 text-foreground shadow-xs'
                          : 'border-border/60 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${tag.color}`}>
                          {tag.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {activeInConv ? (
                          <span className="flex items-center gap-1 text-blue-400 text-xs font-semibold">
                            <Check className="w-4 h-4" /> Asignada
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Asignar</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-muted/30 border-t flex justify-end">
              <Button
                type="button"
                variant="alfa"
                size="sm"
                onClick={() => setTagModalConv(null)}
                className="text-xs h-8 px-4"
              >
                Listo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Oficial VATOS ALFA para Eliminar Conversación con Código de Autorización */}
      {conversationToDelete && (
        <Dialog
          open={isDeleteAuthModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsDeleteAuthModalOpen(false);
              setConversationToDelete(null);
              setDeleteAuthCode('');
              setDeleteAuthError('');
            }
          }}
        >
          <DialogContent
            hideCloseButton={true}
            className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background"
          >
            {/* Cabecera Oficial VATOS ALFA */}
            <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
              <div className="header-light-beam" aria-hidden="true" />
              <div className="relative z-10 flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <DialogTitle className="text-base font-bold text-white tracking-wide">
                      Eliminar Conversación
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-300 mt-0.5 truncate max-w-[280px]">
                      {conversationToDelete.cliente_nombre || conversationToDelete.cliente_telefono || 'Conversación'}
                    </DialogDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteAuthModalOpen(false);
                    setConversationToDelete(null);
                    setDeleteAuthCode('');
                    setDeleteAuthError('');
                  }}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Formulario con Código de Autorización */}
            <form onSubmit={handleConfirmDeleteWithCode}>
              <div className="p-4 sm:p-5 space-y-4">
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-red-300">Esta acción es permanente e irreversible</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Se eliminará por completo esta conversación y todo el historial de mensajes de la base de datos.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="delete-auth-code-input"
                      className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5 text-blue-400" />
                      Código de Autorización
                    </label>
                    <span className="text-[10px] text-muted-foreground">Solo personal autorizado</span>
                  </div>

                  <Input
                    id="delete-auth-code-input"
                    type="password"
                    autoFocus
                    placeholder="Ingresa el código PIN..."
                    value={deleteAuthCode}
                    onChange={(e) => {
                      setDeleteAuthCode(e.target.value);
                      if (deleteAuthError) setDeleteAuthError('');
                    }}
                    className={`h-9 text-xs sm:text-sm bg-background border-2 ${
                      deleteAuthError
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-border/60 focus-visible:border-blue-500'
                    }`}
                  />

                  {deleteAuthError && (
                    <p className="text-xs text-red-400 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {deleteAuthError}
                    </p>
                  )}
                </div>
              </div>

              {/* Botones del Modal */}
              <div className="p-3 sm:p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsDeleteAuthModalOpen(false);
                    setConversationToDelete(null);
                    setDeleteAuthCode('');
                    setDeleteAuthError('');
                  }}
                  disabled={isVerifyingDeleteCode || isDeletingConversation}
                  className="text-xs h-8 px-3.5"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isVerifyingDeleteCode || isDeletingConversation || !deleteAuthCode.trim()}
                  className="text-xs h-8 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all shadow-xs disabled:opacity-50"
                >
                  {isVerifyingDeleteCode || isDeletingConversation ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Autorizar y Eliminar
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
