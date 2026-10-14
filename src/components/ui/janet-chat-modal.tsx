'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bot,
  Send,
  X,
  Sparkles,
  MapPin,
  Calendar,
  CreditCard,
  User,
  RotateCcw,
  Scissors,
  CheckCircle2,
  Check,
  ExternalLink,
  FileText,
  Phone,
  XCircle,
} from 'lucide-react';
import {
  sendWebCustomerMessage,
  getWebConversationMessages,
} from '@/lib/actions/ai-agent';
import { handleClientAppointmentAction } from '@/lib/actions/conversation-actions';

interface JanetChatModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  branchName?: string;
  branchAddress?: string;
  onNavigateToBooking?: () => void;
}

interface ChatMsg {
  id: string;
  conversation_id: string;
  de: 'cliente' | 'bot' | 'recepcion';
  texto: string;
  timestamp: string;
  tipo?: string;
  mediaUrl?: string | null;
  metadata?: any;
}

const STORAGE_CONV_KEY = 'vatos_web_conv_id';
const STORAGE_NAME_KEY = 'vatos_web_client_name';
const STORAGE_PHONE_KEY = 'vatos_web_client_phone';

const QUICK_SUGGESTIONS = [
  {
    icon: Calendar,
    label: 'Disponibilidad hoy',
    prompt: '¿Tienen citas disponibles para hoy y en qué horarios?',
  },
  {
    icon: MapPin,
    label: 'Ubicación y cómo llegar',
    prompt: '¿Dónde está ubicada la sucursal y qué referencias tienen para llegar?',
  },
  {
    icon: Scissors,
    label: 'Servicios y precios',
    prompt: '¿Cuáles son sus servicios más populares y qué precios tienen?',
  },
  {
    icon: CreditCard,
    label: 'Métodos de pago',
    prompt: '¿Qué formas de pago aceptan en la sucursal?',
  },
  {
    icon: User,
    label: 'Hablar con recepción',
    prompt: 'Hola, me gustaría hablar con un recepcionista humano por favor.',
  },
];

export function JanetChatModal({
  isOpen,
  onOpenChange,
  branchName = 'Sucursal Sombrerete',
  branchAddress = 'Av. Sombrerete 1001, Col. Cipreses, Querétaro',
  onNavigateToBooking,
}: JanetChatModalProps) {
  const [conversationId, setConversationId] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [showProfileDrawer, setShowProfileDrawer] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [modoAtencion, setModoAtencion] = useState<string>('bot_activo');
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Inicializar ID de conversación persistente y datos guardados
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let storedId = localStorage.getItem(STORAGE_CONV_KEY);
    if (!storedId) {
      storedId = `web_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem(STORAGE_CONV_KEY, storedId);
    }
    setConversationId(storedId);

    const storedName = localStorage.getItem(STORAGE_NAME_KEY) || '';
    const storedPhone = localStorage.getItem(STORAGE_PHONE_KEY) || '';
    setClientName(storedName);
    setClientPhone(storedPhone);
  }, []);

  // Cargar mensajes de la conversación
  const loadMessages = useCallback(
    async (convId: string, isSilent = false) => {
      if (!convId) return;
      if (!isSilent) setIsLoadingMessages(true);
      try {
        const res = await getWebConversationMessages({ conversationId: convId });
        if (res.success && res.messages) {
          setMessages(res.messages);
          if (res.modo_atencion) {
            setModoAtencion(res.modo_atencion);
          }
        }
      } catch (err) {
        console.error('Error cargando mensajes de chat:', err);
      } finally {
        if (!isSilent) setIsLoadingMessages(false);
      }
    },
    []
  );

  // Auto-scroll al fondo
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    }, 50);
  };

  // Modo Próximamente activo: omitir polling innecesario al abrir
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isTyping, isOpen]);

  // Manejar envío de mensaje
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !conversationId || isTyping) return;

    setInputText('');

    const tempId = `temp_${Date.now()}`;
    const newMsg: ChatMsg = {
      id: tempId,
      conversation_id: conversationId,
      de: 'cliente',
      texto: text,
      timestamp: new Date().toISOString(),
      tipo: 'texto',
    };

    // Actualización optimista en UI
    setMessages((prev) => [...prev, newMsg]);
    setIsTyping(true);
    scrollToBottom();

    try {
      const res = await sendWebCustomerMessage({
        conversationId,
        userMessage: text,
        clientName: clientName.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
      });

      if (res.success && res.replied && res.botReply) {
        const botMsg: ChatMsg = {
          id: `bot_${Date.now()}`,
          conversation_id: conversationId,
          de: 'bot',
          texto: res.botReply,
          timestamp: new Date().toISOString(),
          tipo: 'texto',
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        // Refrescar mensajes de Firestore por si recepción tomó el control
        await loadMessages(conversationId, true);
      }
    } catch (error) {
      console.error('Error al enviar mensaje a Janet:', error);
      const errorMsg: ChatMsg = {
        id: `err_${Date.now()}`,
        conversation_id: conversationId,
        de: 'bot',
        texto: 'Hubo una breve interrupción en la conexión. Por favor reintenta tu mensaje o contáctanos por llamada directa.',
        timestamp: new Date().toISOString(),
        tipo: 'texto',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
      scrollToBottom();
    }
  };

  // Reiniciar conversación si el cliente lo desea
  const handleResetConversation = () => {
    if (typeof window === 'undefined') return;
    const newId = `web_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    localStorage.setItem(STORAGE_CONV_KEY, newId);
    setConversationId(newId);
    setMessages([]);
    setModoAtencion('bot_activo');
  };

  // Ejecutar acción de cita desde el botón interactivo (Confirmar, Reagendar, Cancelar)
  const handleExecuteClientAction = async (msg: ChatMsg, action: 'confirm' | 'reschedule' | 'cancel') => {
    if (!msg.metadata?.reservation_id || isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      const res = await handleClientAppointmentAction({
        conversationId: msg.conversation_id || conversationId,
        messageId: msg.id,
        reservationId: msg.metadata.reservation_id,
        action,
        clientName: clientName || undefined,
      });

      if (res.success) {
        // Actualizar mensaje en la vista inmediatamente
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? {
                  ...m,
                  metadata: {
                    ...(m.metadata || {}),
                    selected_action: action,
                    answered_at: new Date().toISOString(),
                  },
                }
              : m
          )
        );
        // Recargar mensajes para mostrar la respuesta inmediata de Janet
        await loadMessages(conversationId, true);
        scrollToBottom();
      }
    } catch (err) {
      console.error('Error al ejecutar acción de cita:', err);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Guardar datos de perfil del cliente
  const handleSaveProfile = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_NAME_KEY, clientName.trim());
      localStorage.setItem(STORAGE_PHONE_KEY, clientPhone.trim());
    }
    setShowProfileDrawer(false);
  };

  const formatMessageTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderFormattedMessage = (text: string) => {
    if (!text) return null;

    let cleaned = text.replace(/\(\s*(\$\d+(?:\.\d+)?(?:\s*MXN)?)\s*\)/g, '$1');
    cleaned = cleaned.replace(/\(\s*([^)\n]*?\$\d+[^)\n]*?)\s*\)/g, '$1');

    // Auto-link location/address to Google Maps if no link already exists
    if (
      !cleaned.includes('http') &&
      (cleaned.toLowerCase().includes('ubicación') ||
        cleaned.toLowerCase().includes('ubicacion') ||
        cleaned.toLowerCase().includes('dirección') ||
        cleaned.toLowerCase().includes('direccion'))
    ) {
      cleaned = cleaned.replace(
        /(?:Ubicación|Ubicacion|Dirección|Direccion):\*?\s*(.+)$/im,
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

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let linkMatch: RegExpExecArray | null;

    const renderWithPin = (strNode: string, key: string) => {
      if (!strNode.includes('📍')) return strNode;
      return strNode.split(/(📍)/g).map((p, i) =>
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

    const formatBold = (str: string, keyPrefix: string) => {
      const boldRegex = /(\*\*([^*]+?)\*\*|\*([^*\s][^*]*?[^*\s]|[^*])\*|_([^_]+?)_)/g;
      const subParts: React.ReactNode[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;
      while ((match = boldRegex.exec(str)) !== null) {
        if (match.index > lastIdx) {
          subParts.push(renderWithPin(str.substring(lastIdx, match.index), `${keyPrefix}-t-${lastIdx}`));
        }
        const boldText = match[2] || match[3];
        const italicText = match[4];
        if (boldText) {
          subParts.push(
            <strong key={`${keyPrefix}-b-${match.index}`} className="font-bold text-inherit">
              {renderWithPin(boldText, `${keyPrefix}-b-${match.index}`)}
            </strong>
          );
        } else if (italicText) {
          subParts.push(
            <em key={`${keyPrefix}-i-${match.index}`} className="italic text-inherit">
              {renderWithPin(italicText, `${keyPrefix}-i-${match.index}`)}
            </em>
          );
        }
        lastIdx = boldRegex.lastIndex;
      }
      if (lastIdx < str.length) {
        subParts.push(renderWithPin(str.substring(lastIdx), `${keyPrefix}-end`));
      }
      return subParts;
    };

    const hasPinOnLine = text.includes('📍');

    while ((linkMatch = linkRegex.exec(cleaned)) !== null) {
      if (linkMatch.index > lastIndex) {
        parts.push(...formatBold(cleaned.substring(lastIndex, linkMatch.index), `txt-${lastIndex}`));
      }

      const markdownLabel = linkMatch[1];
      const markdownUrl = linkMatch[2];
      const rawUrl = linkMatch[3];
      const targetUrl = markdownUrl || rawUrl;
      const displayLabel = markdownLabel || rawUrl;

      const isMercadoPago = targetUrl.includes('mercadopago') || targetUrl.includes('mpago');
      const isGoogleMaps =
        targetUrl.includes('maps.google') ||
        targetUrl.includes('goo.gl/maps') ||
        targetUrl.includes('maps.app.goo.gl');

      if (isMercadoPago) {
        parts.push(
          <span key={`link-${linkMatch.index}`} className="block my-2">
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <CreditCard className="w-3.5 h-3.5 shrink-0" />
              <span>{markdownLabel || 'Pagar Anticipo en Mercado Pago →'}</span>
            </a>
          </span>
        );
      } else if (isGoogleMaps) {
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
            className="inline-flex items-center gap-1 font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all transition-colors cursor-pointer"
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
      parts.push(...formatBold(cleaned.substring(lastIndex), `txt-${lastIndex}`));
    }

    return parts;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="w-[92vw] sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-[0_10px_35px_rgba(59,130,246,0.22)] border-2 border-blue-500 bg-[#0c1222] text-slate-100 flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <Bot className="h-5 w-5 text-blue-400 shrink-0" />
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 leading-none">
                  Janet • Asistente Virtual IA
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-300 mt-1 leading-none">
                  {branchName} • Próximamente
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* CUERPO: PRÓXIMAMENTE DISPONIBLE */}
        <div className="p-5 sm:p-6 space-y-4 bg-[#090d18] text-center">
          <div className="flex items-center justify-center gap-2">
            <Bot className="h-8 w-8 text-blue-400" />
            <Sparkles className="h-5 w-5 text-[#C5A880]" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-blue-400 border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 rounded-full">
              Próximamente Disponible
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white">
              Janet estará lista muy pronto
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
              Estamos afinando los últimos detalles de <strong className="text-white">Janet</strong>, nuestra asistente virtual con Inteligencia Artificial para atenderte 24/7.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#10172b]/80 p-3.5 text-left space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Muy pronto podrás:
            </p>
            <ul className="space-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>Consultar horarios disponibles y agendar por chat en segundos</span>
              </li>
              <li className="flex items-center gap-2">
                <Scissors className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>Resolver dudas sobre servicios, paquetes y precios</span>
              </li>
              <li className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>Conectarte directamente con recepción de la sucursal</span>
              </li>
            </ul>
          </div>

          <div className="pt-1 flex flex-col sm:flex-row gap-2">
            {onNavigateToBooking && (
              <Button
                type="button"
                variant="alfa"
                onClick={() => {
                  onOpenChange(false);
                  onNavigateToBooking();
                }}
                className="flex-1 h-10 text-xs font-bold"
              >
                <Calendar className="h-4 w-4 mr-1.5" />
                Agendar Cita en Línea
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 text-xs border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              Entendido
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
