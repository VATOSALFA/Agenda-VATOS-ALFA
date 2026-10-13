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

  // Cargar mensajes al abrir y configurar polling activo
  useEffect(() => {
    if (!isOpen || !conversationId) return;

    loadMessages(conversationId);
    scrollToBottom('auto');

    // Foco en input al abrir
    setTimeout(() => {
      inputRef.current?.focus();
    }, 250);

    // Polling cada 4.5 segundos para sincronizar respuestas de recepción
    pollingTimerRef.current = setInterval(() => {
      loadMessages(conversationId, true);
    }, 4500);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [isOpen, conversationId, loadMessages]);

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
        className="w-[94vw] sm:max-w-lg p-0 overflow-hidden rounded-2xl shadow-[0_10px_35px_rgba(59,130,246,0.22)] border-2 border-blue-500 bg-[#0c1222] text-slate-100 flex flex-col h-[85vh] max-h-[680px]"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-3.5 sm:p-4 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          {/* Haz de luz oblicuo animado */}
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              {/* Bare Icon Janet con indicador de estado en vivo */}
              <div className="relative flex items-center justify-center">
                <Bot className="h-6 w-6 text-blue-400" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </span>
              </div>

              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 leading-none">
                  Janet • Asistente Virtual
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-300 mt-1 leading-none flex items-center gap-1">
                  <span>{branchName}</span>
                  <span>•</span>
                  <span className="text-blue-300 font-medium">
                    {modoAtencion === 'humano_al_mando' ? 'Recepción Humana en vivo' : 'En línea • 24/7'}
                  </span>
                </DialogDescription>
              </div>
            </div>

            {/* Acciones de Cabecera: Personalizar nombre, Reiniciar, Cerrar */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowProfileDrawer(!showProfileDrawer)}
                className="p-1.5 text-slate-300 hover:text-white transition-colors"
                title={clientName ? `Identificado como ${clientName}` : 'Personalizar tu nombre'}
                aria-label="Perfil"
              >
                <User className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleResetConversation}
                className="p-1.5 text-slate-300 hover:text-white transition-colors"
                title="Comenzar nueva conversación"
                aria-label="Reiniciar chat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1.5 text-slate-300 hover:text-white transition-colors ml-1"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Drawer opcional para que el cliente ingrese su nombre y teléfono */}
        {showProfileDrawer && (
          <div className="bg-[#131b32] border-b border-slate-700/60 p-3 flex flex-col gap-2 shrink-0 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Personaliza tu atención</span>
              <button
                type="button"
                onClick={() => setShowProfileDrawer(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cerrar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Tu nombre (ej. Carlos Mendoza)"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="h-8 text-xs bg-slate-900/80 border-slate-700 text-white"
              />
              <Input
                placeholder="Tu WhatsApp / Celular (opcional)"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                className="h-8 text-xs bg-slate-900/80 border-slate-700 text-white"
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="default"
                onClick={handleSaveProfile}
                className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
              >
                Guardar
              </Button>
            </div>
          </div>
        )}

        {/* CUERPO DEL CHAT / MENSAJES */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 bg-[#090d18]">
          {/* Mensaje de bienvenida inicial de Janet */}
          <div className="flex items-start gap-2.5 max-w-[90%]">
            <Bot className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm text-xs sm:text-sm space-y-1.5 leading-relaxed">
              <p className="font-semibold text-blue-300 flex items-center gap-1.5 text-xs">
                Janet • VATOS ALFA
              </p>
              <p>
                ¡Hola! Bienvenido a <span className="font-semibold text-white">VATOS ALFA Barber Shop</span> 💈.
              </p>
              <p className="text-slate-300">
                Puedo ayudarte en tiempo real a consultar horarios disponibles, resolver dudas de servicios y precios, o conectarte directamente con recepción.
              </p>
              <div className="pt-1 text-[10px] text-slate-400 text-right">
                {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* Historial de mensajes */}
          {messages.map((msg) => {
            const isClient = msg.de === 'cliente';
            const isReception = msg.de === 'recepcion';

            if (isClient) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[85%] sm:max-w-[78%] shadow-sm text-xs sm:text-sm leading-relaxed">
                    <div className="whitespace-pre-line break-words">{renderFormattedMessage(msg.texto)}</div>
                    <div className="text-[10px] text-blue-200/80 text-right mt-1">
                      {formatMessageTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex items-start gap-2.5 max-w-[90%] sm:max-w-[82%]">
                {isReception ? (
                  <User className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                ) : (
                  <Bot className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                )}
                <div
                  className={`rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm text-xs sm:text-sm space-y-1 leading-relaxed ${
                    isReception
                      ? 'bg-slate-800 border border-blue-500/50 text-slate-100'
                      : 'bg-slate-800/90 text-slate-100 border border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-blue-300">
                    <span>{isReception ? 'Recepción VATOS ALFA' : 'Janet • Asistente Virtual'}</span>
                    {isReception && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-normal">
                        Personal
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-line break-words text-slate-200">{renderFormattedMessage(msg.texto)}</div>

                  {/* Interactive Buttons for Appointment Reminders */}
                  {msg.metadata?.buttons && msg.metadata.buttons.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-700/60">
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
                                onClick={() => handleExecuteClientAction(msg, btn.action)}
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
                      <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center gap-1.5 text-[10px] text-slate-400 select-none">
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

                  <div className="text-[10px] text-slate-400 text-right pt-0.5">
                    {formatMessageTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Indicador de escribiendo */}
          {isTyping && (
            <div className="flex items-center gap-2 max-w-[80%]">
              <Bot className="h-5 w-5 text-blue-400 shrink-0" />
              <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-sm px-3.5 py-2 text-xs text-slate-300 flex items-center gap-2">
                <span>Janet está escribiendo</span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                </span>
              </div>
            </div>
          )}

          {/* Sugerencias rápidas cuando la conversación apenas inicia */}
          {messages.length === 0 && !isTyping && (
            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Preguntas frecuentes:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map((item, idx) => {
                  const IconComp = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(item.prompt)}
                      className="flex items-center gap-1.5 text-xs bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 hover:text-white border border-slate-700/60 rounded-xl px-2.5 py-1.5 transition-all text-left"
                    >
                      <IconComp className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* BARRA INFERIOR / ENTRADA DE MENSAJES */}
        <div className="p-3 bg-[#0d1424] border-t border-[#1e2a4a] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <Input
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                modoAtencion === 'humano_al_mando'
                  ? 'Escribe tu mensaje a recepción...'
                  : 'Pregunta a Janet sobre citas, servicios o dudas...'
              }
              disabled={isTyping}
              className="flex-1 h-10 bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 rounded-xl text-xs sm:text-sm focus-visible:ring-1 focus-visible:ring-blue-500"
            />
            <Button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="h-10 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition-colors disabled:opacity-40"
              title="Enviar mensaje"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {/* Pie informativo discreto */}
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/60 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-blue-400" />
              Conectado directamente a la agenda
            </span>
            {onNavigateToBooking && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onNavigateToBooking();
                }}
                className="text-blue-400 hover:underline font-medium"
              >
                Abrir Agendador Web →
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
