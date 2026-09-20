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
} from 'firebase/firestore';
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
} from 'lucide-react';

// Modals & Actions
import { NewConversationModal } from '@/components/admin/conversations/new-conversation-modal';
import { NewReservationForm } from '@/components/reservations/new-reservation-form';
import { ClientDetailModal } from '@/components/clients/client-detail-modal';
import {
  processAgentMessage,
  sendStaffMessage,
  toggleConversationMode,
  markConversationAsRead,
  getClientDetailsForChat,
  exportClientsToVCard,
  updateConversationTags,
  sendInternalStaffNote,
  confirmReservationByStaff,
  deleteConversation,
} from '@/lib/actions/ai-agent';
import type { Conversation, ChatMessage, Client } from '@/lib/types';

const AVAILABLE_TAGS = [
  { id: 'VIP', label: '⭐ VIP', color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30' },
  { id: 'Anticipo Pendiente', label: '⏳ Anticipo Pendiente', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  { id: 'Por Confirmar', label: '📅 Por Confirmar', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
  { id: 'Nuevo', label: '🌱 Nuevo', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  { id: 'Queja', label: '⚠️ Queja', color: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' },
  { id: 'Seguimiento', label: '🔍 Seguimiento', color: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30' },
];

const QUICK_REPLIES = [
  {
    id: 'ubicacion',
    title: '📍 Ubicación y Google Maps',
    category: 'Información',
    text: '¡Hola! Estamos ubicados en *Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro, Qro.* (sobre Av. Cerro Sombrerete). Abrimos de lunes a sábado de 10:00 AM a 9:00 PM y domingos de 10:00 AM a 8:00 PM. Aquí puedes vernos en Google Maps: https://maps.google.com/?q=Av+Cerro+Sombrerete+1001+Cipreses+Queretaro ¡Contamos con cajones de estacionamiento al frente!',
  },
  {
    id: 'datos_banco',
    title: '💳 Pago con Mercado Pago / SPEI',
    category: 'Pagos',
    text: 'Con gusto te comparto nuestras opciones oficiales de pago en VATOS ALFA:\n• Pasarela segura: *Mercado Pago* (acepta tarjetas de crédito, débito y transferencia electrónica SPEI).\n• Beneficiario: *VATOS ALFA Barber Shop*\nPor favor compártenos tu comprobante o captura de pantalla por este chat para registrarlo en tu expediente. ¡Muchas gracias!',
  },
  {
    id: 'en_atencion',
    title: '⏳ En atención (Mensaje de espera)',
    category: 'Cortesía',
    text: '¡Hola! Disculpa la demora, en este momento estamos terminando de atender a un cliente en silla. En 5 minutitos te atendemos con mucho gusto.',
  },
  {
    id: 'tolerancia',
    title: '⏰ Tolerancia de 10 minutos',
    category: 'Políticas',
    text: 'Te recordamos amablemente que contamos con una *tolerancia máxima de 10 minutos* para el inicio de tu cita. Si requieres algún cambio o cancelación, con gusto te apoyamos con al menos 2 horas de anticipación.',
  },
  {
    id: 'pregunta_confirmar',
    title: '✅ Preguntar Confirmación',
    category: 'Citas',
    text: '¡Hola! Te escribimos de VATOS ALFA para recordarte tu cita programada. ¿Nos confirmas tu asistencia por favor respondiendo con *Confirmar*, *Reagendar* o *Cancelar*? ¡Muchas gracias!',
  },
  {
    id: 'cita_confirmada',
    title: '💈 Cita Confirmada',
    category: 'Citas',
    text: '¡Excelente! Te confirmamos que tu cita ha quedado debidamente programada en nuestra agenda. ¡Te esperamos con gusto en VATOS ALFA!',
  },
];

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

    // 2. Match links: markdown [label](url) OR raw URLs (https?://...)
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let linkMatch: RegExpExecArray | null;

    const renderTextWithFormatting = (subText: string, keyPrefix: string) => {
      // Regex matching **bold**, *bold*, and _italic_
      const formatRegex = /(\*\*([^*]+?)\*\*|\*([^*\s][^*]*?[^*\s]|[^*])\*|_([^_]+?)_)/g;
      const nodes: React.ReactNode[] = [];
      let formatLastIdx = 0;
      let fmtMatch: RegExpExecArray | null;

      while ((fmtMatch = formatRegex.exec(subText)) !== null) {
        if (fmtMatch.index > formatLastIdx) {
          nodes.push(subText.substring(formatLastIdx, fmtMatch.index));
        }

        const boldText = fmtMatch[2] || fmtMatch[3];
        const italicText = fmtMatch[4];

        if (boldText) {
          nodes.push(
            <strong key={`${keyPrefix}-b-${fmtMatch.index}`} className="font-semibold text-foreground">
              {boldText}
            </strong>
          );
        } else if (italicText) {
          nodes.push(
            <em key={`${keyPrefix}-i-${fmtMatch.index}`} className="italic text-foreground">
              {italicText}
            </em>
          );
        }

        formatLastIdx = formatRegex.lastIndex;
      }

      if (formatLastIdx < subText.length) {
        nodes.push(subText.substring(formatLastIdx));
      }

      return nodes;
    };

    while ((linkMatch = linkRegex.exec(cleaned)) !== null) {
      if (linkMatch.index > lastIndex) {
        parts.push(...renderTextWithFormatting(cleaned.substring(lastIndex, linkMatch.index), `txt-${lastIndex}`));
      }

      const markdownLabel = linkMatch[1];
      const markdownUrl = linkMatch[2];
      const rawUrl = linkMatch[3];
      const targetUrl = markdownUrl || rawUrl;
      const displayLabel = markdownLabel || rawUrl;

      parts.push(
        <a
          key={`link-${linkMatch.index}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 break-all transition-colors cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{displayLabel}</span>
          <ExternalLink className="w-3 h-3 inline-block shrink-0" />
        </a>
      );

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
              <span className="text-primary font-bold select-none text-xs mt-0.5">•</span>
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
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const clientObj = clientDetails?.client;
  const metrics = clientDetails?.metrics || {
    total: clientObj?.citas_totales || 0,
    asistidas: clientObj?.citas_asistidas || 0,
    canceladas: clientObj?.citas_canceladas || 0,
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
          <Phone className="w-3 h-3" />
          {activeConversation.cliente_telefono || activeConversation.id}
        </p>

        {activeConversation.cliente_telefono && (
          <a
            href={`https://wa.me/${activeConversation.cliente_telefono.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium"
          >
            <ExternalLink className="w-3 h-3" /> Abrir WhatsApp Web
          </a>
        )}

        {onOpenDetailModal && clientObj && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8 gap-1.5 mt-3 border-border/70 hover:bg-accent"
            onClick={onOpenDetailModal}
          >
            <FileText className="w-3.5 h-3.5 text-primary" />
            Ver Ficha Completa
          </Button>
        )}
      </div>

      {/* Action: Quick Create Appointment */}
      <Button
        className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow text-xs h-9"
        size="sm"
        onClick={onOpenAppointmentModal}
      >
        <Calendar className="w-3.5 h-3.5" />
        Agendar Cita en la Agenda
      </Button>

      {/* VIP Intelligence / Historical Memory */}
      {(clientDetails?.frequentBarber || clientDetails?.frequentService) && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1.5">
          <span className="font-semibold text-[11px] text-primary flex items-center gap-1 uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-amber-500" /> Preferencias del Cliente
          </span>
          {clientDetails.frequentBarber && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <Scissors className="w-3 h-3 text-primary" /> Barbero habitual:
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
                <Star className="w-3 h-3 text-amber-500" /> Servicio favorito:
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
              <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">
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
                  const isConfirmed = app.confirmada_por_cliente || app.estado === 'confirmada';

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
                            isAttended
                              ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
                              : isCancelled
                              ? 'border-destructive/40 text-destructive bg-destructive/10'
                              : 'border-amber-500/40 text-amber-600 bg-amber-500/10'
                          }`}
                        >
                          {app.estado}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground truncate">{app.servicio}</p>
                      <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground/80">
                        <span className="flex items-center gap-1">
                          <Scissors className="w-3 h-3" />
                          {app.professionalNames || app.barbero_nombre || 'Barbero'}
                        </span>
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Confirmada WhatsApp
                          </span>
                        ) : !isCancelled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={confirmingId === app.id}
                            className="h-5 text-[9px] px-1.5 gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => handleConfirmReservation(app.id)}
                          >
                            {confirmingId === app.id ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Check className="w-2.5 h-2.5" />
                            )}
                            Confirmar
                          </Button>
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
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          <span className="font-semibold block mb-1">Notas del cliente:</span>
          <p>{clientObj.notas}</p>
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

  // Local state
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [staffInput, setStaffInput] = useState<string>('');
  const [isSendingStaff, setIsSendingStaff] = useState<boolean>(false);
  const [isTogglingMode, setIsTogglingMode] = useState<boolean>(false);
  const [sendRole, setSendRole] = useState<'cliente' | 'recepcion' | 'nota_interna'>('cliente');
  const [pauseBotOnSend, setPauseBotOnSend] = useState<boolean>(false);
  const [isProcessingAI, setIsProcessingAI] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [attachedImageUrl, setAttachedImageUrl] = useState<string>('');
  const [showImageInput, setShowImageInput] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Audio voice recording state & refs
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Cleanup audio tracks and timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
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
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(false);

  // Modals
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState<boolean>(false);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState<boolean>(false);
  const [isClientDetailModalOpen, setIsClientDetailModalOpen] = useState<boolean>(false);
  const [isExportingVCard, setIsExportingVCard] = useState<boolean>(false);

  // Simulator Modal State
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [simInput, setSimInput] = useState<string>('');
  const [simPhone, setSimPhone] = useState<string>('5214421234567');
  const [simName, setSimName] = useState<string>('Cliente de Prueba');
  const [simMessages, setSimMessages] = useState<ChatMessage[]>([]);
  const [isSimProcessing, setIsSimProcessing] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const simMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const simScrollContainerRef = useRef<HTMLDivElement>(null);
  const activeConvRef = useRef<Conversation | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const isSimInitialLoadRef = useRef<boolean>(true);

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

  // Select first conversation if none selected (desktop only to preserve mobile chat list experience)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      if (!selectedConvId && filteredConversations.length > 0) {
        setSelectedConvId(filteredConversations[0].id);
      }
    }
  }, [filteredConversations, selectedConvId]);

  // Reset initial load flag when conversation changes so it opens instantly at bottom
  useEffect(() => {
    isInitialLoadRef.current = true;
  }, [selectedConvId]);

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

  // Toggle tag on active conversation
  const handleToggleTag = async (tagId: string) => {
    if (!activeConversation) return;
    const currentTags = activeConversation.etiquetas || [];
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];
    try {
      const res = await updateConversationTags({
        conversationId: activeConversation.id,
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
          title: checked ? '👤 Recepción al mando' : '💈 Sofía Activa',
          description: checked
            ? 'Sofía ha sido pausada. Ahora tú tienes el control de las respuestas.'
            : 'Sofía responderá automáticamente las dudas y citas del cliente.',
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

  const handleDeleteConversation = async (convId: string) => {
    if (!window.confirm('¿Deseas eliminar esta conversación y todo su historial de mensajes? Esta acción es permanente.')) {
      return;
    }

    setIsDeletingConversation(true);
    try {
      const res = await deleteConversation(convId);
      if (res.success) {
        toast({
          title: 'Conversación eliminada',
          description: 'La conversación y todos sus mensajes fueron eliminados con éxito.',
        });
        setSelectedConvId(null);
      } else {
        toast({
          title: 'Error al eliminar',
          description: res.error || 'No se pudo eliminar la conversación.',
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

  // Permission Guard
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="w-16 h-16 text-amber-500 mb-4" />
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
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <MessageSquare className="w-4 h-4 md:w-4.5 md:h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold tracking-tight truncate">Mensajes</h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sofía AI
              </span>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Mobile Secondary Actions (Dropdown) */}
          <div className="flex sm:hidden items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setIsSimulatorOpen(true)} className="gap-2 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Simulador de Pruebas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportVCard} disabled={isExportingVCard} className="gap-2 text-xs">
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  Exportar Contactos (.vcf)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              onClick={() => setIsNewConvModalOpen(true)}
              className="h-8 px-2.5 gap-1 bg-primary hover:bg-primary/90 text-primary-foreground shadow text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo</span>
            </Button>
          </div>

          {/* Desktop Actions */}
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSimulatorOpen(true)}
              className="h-8 gap-1.5 border-primary/30 hover:border-primary text-primary hover:bg-primary/10 transition-colors shadow-sm text-xs font-medium"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              <span>Simulador de Pruebas</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportVCard}
              disabled={isExportingVCard}
              className="h-8 gap-1.5 text-muted-foreground hover:text-foreground text-xs"
            >
              {isExportingVCard ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Exportar (.vcf)</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setIsNewConvModalOpen(true)}
              className="h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Chat</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace (3 Columns) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ============================================================ */}
        {/* COLUMNA 1: LISTA DE CONVERSACIONES (IZQUIERDA) */}
        {/* ============================================================ */}
        <aside className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-card/30 shrink-0 ${selectedConvId ? 'hidden md:flex' : 'flex'}`}>
          {/* Search & Filter header */}
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-background/70"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => {
                  setFilterMode('todos');
                  setFilterTag(null);
                }}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  filterMode === 'todos' && !filterTag
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                Todos ({rawConversations.length})
              </button>

              <button
                onClick={() => setFilterMode('requiere_atencion')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                  filterMode === 'requiere_atencion'
                    ? 'bg-amber-500 text-white'
                    : attentionCount > 0
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Atención {attentionCount > 0 && `(${attentionCount})`}
              </button>

              <button
                onClick={() => setFilterMode('bot_activo')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                  filterMode === 'bot_activo'
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                <Bot className="w-3 h-3" />
                Sofía Activa
              </button>

              <button
                onClick={() => setFilterMode('humano_al_mando')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                  filterMode === 'humano_al_mando'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                <User className="w-3 h-3" />
                Humano
              </button>

              <button
                onClick={() => setFilterMode('no_leidos')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  filterMode === 'no_leidos'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted'
                }`}
              >
                No leídos
              </button>
            </div>

            {/* Quick Tag Filter Bar */}
            <div className="flex flex-wrap items-center gap-1 pt-1 text-[11px]">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold flex items-center gap-0.5 shrink-0 mr-1">
                <Tag className="w-2.5 h-2.5" /> Tags:
              </span>
              {AVAILABLE_TAGS.map((t) => {
                const isActive = filterTag === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilterTag(isActive ? null : t.id)}
                    className={`px-2 py-0.5 rounded-md border text-[10px] font-medium transition-all ${
                      isActive
                        ? 'bg-foreground text-background font-bold shadow-sm ring-1 ring-foreground/20'
                        : `${t.color} hover:opacity-90`
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
              {filterTag && (
                <button
                  type="button"
                  onClick={() => setFilterTag(null)}
                  className="px-1.5 py-0.5 rounded-md text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Conversations List */}
          <ScrollArea className="flex-1">
            {conversationsLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                Cargando conversaciones...
              </div>
            ) : filteredConversations.length === 0 ? (
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
                {filteredConversations.map((conv) => {
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
                      onClick={() => setSelectedConvId(conv.id)}
                      className={`w-full text-left p-3.5 transition-all flex items-start gap-3 hover:bg-muted/50 ${
                        isSelected
                          ? 'bg-muted border-l-4 border-l-primary'
                          : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <Avatar className="w-10 h-10 border shrink-0 mt-0.5">
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                          {conv.cliente_nombre ? conv.cliente_nombre.slice(0, 2).toUpperCase() : 'CL'}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-semibold text-sm truncate text-foreground">
                            {conv.cliente_nombre || 'Cliente'}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {timeDisplay}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground truncate mb-1.5">
                          {conv.ultimo_mensaje || 'Conversación iniciada'}
                        </p>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isAttention && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-600 text-white font-medium gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" /> Requiere atención
                            </Badge>
                          )}
                          {isHuman && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1">
                              <User className="w-2.5 h-2.5" /> Humano
                            </Badge>
                          )}
                          {!isAttention && !isHuman && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10 gap-1">
                              <Bot className="w-2.5 h-2.5" /> Sofía activa
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
                      </div>
                    </button>
                  );
                })}
              </div>
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

                  <Avatar
                    className="w-8 h-8 md:w-9 md:h-9 border shrink-0 cursor-pointer"
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setIsMobileSheetOpen(true);
                      } else {
                        setShowRightPanel(true);
                      }
                    }}
                  >
                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-xs">
                      {activeConversation.cliente_nombre
                        ? activeConversation.cliente_nombre.slice(0, 2).toUpperCase()
                        : 'CL'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <h2 className="font-semibold text-xs md:text-sm truncate">
                        {activeConversation.cliente_nombre || 'Cliente'}
                      </h2>
                      <span className="text-[10px] md:text-[11px] text-muted-foreground font-mono hidden sm:inline">
                        {activeConversation.cliente_telefono || activeConversation.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <p className="text-[10px] md:text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                        {activeConversation.modo_atencion === 'requiere_atencion' ? (
                          <span className="text-amber-500 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5 md:w-3 md:h-3" /> Requiere atención
                          </span>
                        ) : activeConversation.modo_atencion === 'humano_al_mando' ? (
                          <span className="text-emerald-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Recepcionista
                          </span>
                        ) : (
                          <span className="text-blue-500 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Sofía activa
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
                        <DropdownMenuContent align="start" className="w-48">
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

                {/* Right controls: Sound Toggle, Tomar Control Switch & Info Panel Toggle */}
                <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0">
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
                      <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                          : 'Sofía'}
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
                    className="text-muted-foreground hover:text-foreground h-8 w-8"
                    title="Ver ficha del cliente"
                  >
                    <Info className="w-4 h-4 md:w-5 md:h-5" />
                  </Button>

                  {/* Delete Conversation Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteConversation(activeConversation.id)}
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
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>
                      <strong>Atención requerida:</strong> El cliente tiene una consulta que requiere
                      un recepcionista.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => handleToggleMode(true)}
                  >
                    Atender ahora (Pausar a Sofía)
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
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {messages.map((msg) => {
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
                          <div key={msg.id} className="flex justify-center my-2.5 w-full">
                            <div className="w-full max-w-lg rounded-xl p-3 bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 shadow-sm space-y-1.5">
                              <div className="flex items-center justify-between border-b border-amber-500/20 pb-1 font-semibold text-[11px]">
                                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                  <Lock className="w-3.5 h-3.5" />
                                  Nota Interna de Personal • {msg.metadata?.staffName || 'Recepción'}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-normal">{timeStr}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-foreground/90 font-medium">{msg.texto}</p>
                              <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1 text-amber-600/80 dark:text-amber-400/80">
                                  <EyeOff className="w-3 h-3" /> Privado: el cliente no ve esta nota
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            isClient ? 'items-start' : 'items-end'
                          }`}
                        >
                          {/* Sender identity badge */}
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1 px-1">
                            {isClient && (
                              <>
                                <User className="w-3 h-3 text-muted-foreground" />
                                <span>{activeConversation.cliente_nombre || 'Cliente'}</span>
                              </>
                            )}
                            {isBot && (
                              <>
                                <Bot className="w-3 h-3 text-blue-500" />
                                <span className="text-blue-500 font-medium">Sofía</span>
                              </>
                            )}
                            {isStaff && (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-500 font-medium">
                                  {msg.metadata?.staffName || 'Recepción'}
                                </span>
                              </>
                            )}
                            <span>•</span>
                            <span>{timeStr}</span>
                          </div>

                          {/* Bubble */}
                          <div
                            className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed whitespace-pre-wrap ${
                              isClient
                                ? 'bg-card border text-card-foreground rounded-tl-sm'
                                : isBot
                                ? 'bg-primary/10 border border-primary/20 text-foreground rounded-tr-sm'
                                : 'bg-emerald-500/15 border border-emerald-500/30 text-foreground rounded-tr-sm'
                            }`}
                          >
                            {/* Attached Media: Voice Audio Player or Image Preview */}
                            {msg.tipo === 'audio' || msg.mediaUrl?.includes('chat_audio') || msg.mediaUrl?.startsWith('data:audio') ? (
                              <div className="mb-2 p-2.5 rounded-xl bg-background/90 border border-border/60 shadow-xs flex flex-col gap-1.5 min-w-[220px]">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                                  <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                    <Mic className="w-3.5 h-3.5" />
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
                            <FormattedChatText text={msg.texto} />
                          </div>
                        </div>
                      );
                    })}

                    {/* Typing bubble when Sofía is analyzing schedule and responding */}
                    {isProcessingAI && (
                      <div className="flex flex-col items-start animate-in fade-in duration-300">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1 px-1">
                          <Bot className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                          <span className="text-blue-500 font-medium">Sofía está consultando la agenda...</span>
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
                      <button
                        type="button"
                        onClick={() => setSendRole('recepcion')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-xs font-medium ${
                          sendRole === 'recepcion'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Scissors className="w-3 h-3 text-emerald-500" />
                        <span>Recepción</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendRole('nota_interna')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-xs font-medium ${
                          sendRole === 'nota_interna'
                            ? 'bg-amber-500 text-white font-semibold shadow-sm'
                            : 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Nota Interna</span>
                      </button>
                    </div>

                    {/* Quick Replies Dropdown & Attachment */}
                    <div className="flex items-center gap-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground border-border/60"
                          >
                            <Bookmark className="w-3 h-3 text-primary" />
                            <span>Respuestas Rápidas</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
                          {QUICK_REPLIES.map((qr) => (
                            <DropdownMenuItem
                              key={qr.id}
                              className="flex flex-col items-start gap-0.5 text-xs py-2 cursor-pointer"
                              onClick={() => {
                                setStaffInput(qr.text);
                                if (sendRole === 'nota_interna') setSendRole('recepcion');
                              }}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="font-semibold text-foreground">{qr.title}</span>
                                <Badge variant="secondary" className="text-[9px] py-0 px-1">
                                  {qr.category}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground line-clamp-1">{qr.text}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Emoji Picker Popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground border-border/60"
                            title="Insertar emojis en el mensaje"
                          >
                            <Smile className="w-3.5 h-3.5 text-amber-500" />
                            <span className="hidden sm:inline">Emojis</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-2.5 shadow-xl rounded-xl z-50">
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

                      {/* Voice Recording Button */}
                      <Button
                        type="button"
                        variant={isRecordingAudio ? 'destructive' : 'ghost'}
                        size="sm"
                        className={`h-7 px-2 text-[11px] gap-1.5 border border-transparent hover:border-border/60 ${
                          isRecordingAudio ? 'bg-rose-600 text-white animate-pulse' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={startVoiceRecording}
                        disabled={(sendRole === 'recepcion' && !canReply) || isSendingStaff || isProcessingAI || isUploadingImage || isRecordingAudio}
                        title="Grabar nota de voz con el micrófono"
                      >
                        <Mic className={`w-3.5 h-3.5 ${isRecordingAudio ? 'text-white animate-bounce' : 'text-rose-500'}`} />
                        <span className="hidden sm:inline">
                          {isRecordingAudio ? 'Grabando...' : 'Grabar Voz'}
                        </span>
                      </Button>

                      {/* Hidden File Input for Device Files */}
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

                      {/* Attach image button from device */}
                      <Button
                        type="button"
                        variant={attachedImageUrl || isUploadingImage ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/60"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingImage || isRecordingAudio}
                        title="Adjuntar imagen del dispositivo (o pegar con Ctrl+V / arrastrar)"
                      >
                        {isUploadingImage ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-primary" />
                        )}
                        <span className="hidden sm:inline">
                          {isUploadingImage ? 'Subiendo...' : 'Adjuntar Imagen'}
                        </span>
                      </Button>

                      {/* Toggle URL input optionally */}
                      <Button
                        type="button"
                        variant={showImageInput ? 'secondary' : 'ghost'}
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowImageInput(!showImageInput)}
                        disabled={isRecordingAudio}
                        title="Ingresar enlace URL de imagen"
                      >
                        <Paperclip className="w-3 h-3 text-muted-foreground" />
                      </Button>

                      {sendRole === 'recepcion' && (
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={pauseBotOnSend}
                            onChange={(e) => setPauseBotOnSend(e.target.checked)}
                            className="rounded border-muted-foreground/30 accent-primary w-3 h-3"
                          />
                          <span className="hidden sm:inline">Pausar a Sofía</span>
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
                            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Enviar Nota</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-end gap-1.5 bg-background border rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm ${
                        sendRole === 'nota_interna'
                          ? 'border-amber-500/50 bg-amber-500/5'
                          : 'border-border/80'
                      }`}>
                        <Textarea
                          ref={chatTextareaRef}
                          onPaste={handlePasteImage}
                          placeholder={
                            sendRole === 'nota_interna'
                              ? 'Escribe una nota interna para el equipo (oculta para el cliente)...'
                              : sendRole === 'cliente'
                              ? 'Escribe como cliente (ej: "¿Tienen citas hoy?" o "Confirmar")...'
                              : canReply
                              ? 'Escribe una respuesta como recepcionista (o pega/arrastra una imagen)...'
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
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
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

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                      <span>
                        {isRecordingAudio ? (
                          <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                            <Mic className="w-3 h-3 animate-pulse" />
                            Grabando nota de voz en vivo... Pulsa 'Enviar Nota' al terminar o 'Cancelar'.
                          </span>
                        ) : isProcessingAI ? (
                          <span className="text-primary font-medium flex items-center gap-1">
                            <Sparkles className="w-3 h-3 animate-spin" />
                            Sofía está consultando la agenda...
                          </span>
                        ) : isUploadingImage ? (
                          <span className="text-primary font-medium flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Subiendo archivo de imagen...
                          </span>
                        ) : sendRole === 'nota_interna' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Modo Nota Interna activa (Solo visible para el personal)
                          </span>
                        ) : sendRole === 'cliente' ? (
                          <span className="text-emerald-500 font-medium">Modo simulación de cliente activo</span>
                        ) : (
                          <span>{pauseBotOnSend ? 'Se pausará a Sofía al enviar.' : 'Respuesta manual de recepción.'}</span>
                        )}
                      </span>
                      <span className="hidden sm:inline">Enter para enviar • Shift+Enter nueva línea • Pega (Ctrl+V) o arrastra imágenes</span>
                    </div>
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
                Elige un chat de la lista izquierda para responder, pausar a Sofía o revisar el expediente de citas del cliente.
              </p>
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
                <User className="w-3.5 h-3.5 text-primary" /> Ficha del Cliente
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
              <User className="w-4 h-4 text-primary" /> Ficha del Cliente
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b bg-card/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">
                    Simulador del Asistente Virtual (Sandbox)
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Prueba en vivo cómo interactúa la IA con los clientes, consulta de agenda y citas sin tocar WhatsApp.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Sandbox Config Row */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 border-b text-xs">
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
          </div>

          {/* Simulator Messages */}
          <div
            ref={simScrollContainerRef}
            className="flex-1 overflow-y-auto p-4 min-h-[300px] max-h-[420px] bg-background/50 overscroll-contain"
          >
            {simMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-center text-muted-foreground gap-3 p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Sparkles className="w-6 h-6" />
                </div>
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
        onClientSelected={async (client: Client) => {
          setIsNewConvModalOpen(false);
          const cleanPhone = (client.telefono || '').replace(/\D/g, '');
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
        }}
      />

      {/* ============================================================ */}
      {/* MODAL: CREAR CITA EN AGENDA PARA EL CLIENTE ACTIVO */}
      {/* ============================================================ */}
      {isNewAppointmentModalOpen && (
        <Dialog open={isNewAppointmentModalOpen} onOpenChange={setIsNewAppointmentModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva Cita para {activeConversation?.cliente_nombre}</DialogTitle>
              <DialogDescription>
                Agenda directamente en la plataforma para este cliente.
              </DialogDescription>
            </DialogHeader>
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
    </div>
  );
}
