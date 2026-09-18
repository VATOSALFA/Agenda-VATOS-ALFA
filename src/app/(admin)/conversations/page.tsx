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
} from 'firebase/firestore';
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
  Info,
  SlidersHorizontal,
  X,
  History,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

// Modals & Actions
import { NewConversationModal } from '@/components/admin/conversations/new-conversation-modal';
import { NewReservationForm } from '@/components/reservations/new-reservation-form';
import {
  processAgentMessage,
  sendStaffMessage,
  toggleConversationMode,
  markConversationAsRead,
  getClientDetailsForChat,
  exportClientsToVCard,
} from '@/lib/actions/ai-agent';
import type { Conversation, ChatMessage, Client } from '@/lib/types';

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

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'todos' | 'requiere_atencion' | 'bot_activo' | 'humano_al_mando' | 'no_leidos'>('todos');

  // Right sidebar details
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [loadingClientDetails, setLoadingClientDetails] = useState<boolean>(false);
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);

  // Modals
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState<boolean>(false);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState<boolean>(false);
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

  // Sort and filter conversations
  const filteredConversations = useMemo(() => {
    let list = [...rawConversations];

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (c) =>
          c.cliente_nombre?.toLowerCase().includes(q) ||
          c.cliente_telefono?.includes(q) ||
          c.ultimo_mensaje?.toLowerCase().includes(q) ||
          c.id?.toLowerCase().includes(q)
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
  }, [rawConversations, searchTerm, filterMode]);

  // Selected conversation object
  const activeConversation = useMemo(() => {
    return rawConversations.find((c) => c.id === selectedConvId) || null;
  }, [rawConversations, selectedConvId]);

  // Count attention required
  const attentionCount = useMemo(() => {
    return rawConversations.filter((c) => c.modo_atencion === 'requiere_atencion').length;
  }, [rawConversations]);

  // Select first conversation if none selected
  useEffect(() => {
    if (!selectedConvId && filteredConversations.length > 0) {
      setSelectedConvId(filteredConversations[0].id);
    }
  }, [filteredConversations, selectedConvId]);

  // Real-time messages listener for selected conversation
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
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ChatMessage[];
        setMessages(list);
        setMessagesLoading(false);

        // Mark as read if has unread
        if (activeConversation && (activeConversation.mensajes_no_leidos || 0) > 0) {
          markConversationAsRead({ conversationId: selectedConvId });
        }
      },
      (error) => {
        console.error('Error fetching messages:', error);
        setMessagesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, selectedConvId, activeConversation]);

  // Load client details when conversation changes
  useEffect(() => {
    if (!activeConversation?.cliente_telefono) {
      setClientDetails(null);
      return;
    }

    setLoadingClientDetails(true);
    getClientDetailsForChat({ phone: activeConversation.cliente_telefono })
      .then((res) => {
        if (res.success) {
          setClientDetails(res);
        }
      })
      .finally(() => {
        setLoadingClientDetails(false);
      });
  }, [activeConversation?.cliente_telefono]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    simMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simMessages]);

  // Send Staff message
  const handleSendStaffMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!staffInput.trim() || !selectedConvId || isSendingStaff) return;

    if (!canReply) {
      toast({
        title: 'Sin permisos',
        description: 'No cuentas con el permiso "atender_chats" para responder.',
        variant: 'destructive',
      });
      return;
    }

    const text = staffInput.trim();
    setStaffInput('');
    setIsSendingStaff(true);

    try {
      const res = await sendStaffMessage({
        conversationId: selectedConvId,
        messageText: text,
        staffName: user?.displayName || user?.email || 'Recepcionista',
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
          title: checked ? '👤 Recepción al mando' : '🤖 Asistente Virtual Activo',
          description: checked
            ? 'El bot ha sido pausado. Ahora tú tienes el control de las respuestas.'
            : 'El bot responderá automáticamente las dudas y citas del cliente.',
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
    <div className="flex flex-col h-[calc(100vh-4.25rem)] -m-4 md:-m-6 overflow-hidden bg-background">
      {/* Top Header Bar */}
      <header className="h-16 border-b px-4 md:px-6 flex items-center justify-between bg-card/60 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight">Centro de Mensajes & WhatsApp</h1>
              <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                AI Recepcionista
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Gestión inteligente de conversaciones, citas automatizadas y supervisión de WhatsApp
            </p>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2">
          {/* Simulator Trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSimulatorOpen(true)}
            className="gap-2 border-primary/30 hover:border-primary text-primary hover:bg-primary/10 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="hidden sm:inline">Simulador de Pruebas</span>
          </Button>

          {/* Export vCard */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportVCard}
            disabled={isExportingVCard}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            {isExportingVCard ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Exportar Contactos (.vcf)</span>
          </Button>

          {/* New Conversation */}
          <Button
            size="sm"
            onClick={() => setIsNewConvModalOpen(true)}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Chat</span>
          </Button>
        </div>
      </header>

      {/* Main Workspace (3 Columns) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ============================================================ */}
        {/* COLUMNA 1: LISTA DE CONVERSACIONES (IZQUIERDA) */}
        {/* ============================================================ */}
        <aside className="w-full md:w-80 lg:w-96 border-r flex flex-col bg-card/30 shrink-0">
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
                onClick={() => setFilterMode('todos')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  filterMode === 'todos'
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
                Bot Activo
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
                              <Bot className="w-2.5 h-2.5" /> Bot activo
                            </Badge>
                          )}

                          {conv.canal === 'simulador' && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 opacity-70">
                              Simulador
                            </Badge>
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
        <main className="flex-1 flex flex-col bg-background/50 overflow-hidden">
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b px-4 flex items-center justify-between bg-card/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="w-9 h-9 border shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary font-bold text-xs">
                      {activeConversation.cliente_nombre
                        ? activeConversation.cliente_nombre.slice(0, 2).toUpperCase()
                        : 'CL'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-sm truncate">
                        {activeConversation.cliente_nombre || 'Cliente'}
                      </h2>
                      <Badge variant="outline" className="text-[11px] font-normal py-0">
                        {activeConversation.cliente_telefono || activeConversation.id}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                      {activeConversation.modo_atencion === 'requiere_atencion' ? (
                        <span className="text-amber-500 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> El cliente solicitó atención de recepción
                        </span>
                      ) : activeConversation.modo_atencion === 'humano_al_mando' ? (
                        <span className="text-emerald-500 font-medium flex items-center gap-1">
                          <User className="w-3 h-3" /> Recepcionista atendiendo el chat
                        </span>
                      ) : (
                        <span className="text-blue-500 font-medium flex items-center gap-1">
                          <Bot className="w-3 h-3" /> Asistente virtual activo y respondiendo
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Right controls: Tomar Control Switch & Info Panel Toggle */}
                <div className="flex items-center gap-3">
                  {/* Bot Takeover Switch */}
                  <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-lg border border-border/50">
                    <div className="flex flex-col text-right">
                      <span className="text-xs font-semibold">
                        {activeConversation.modo_atencion === 'humano_al_mando'
                          ? 'Modo Humano'
                          : 'Bot Activo'}
                      </span>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        {activeConversation.modo_atencion === 'humano_al_mando'
                          ? 'Bot pausado'
                          : 'Respuesta auto'}
                      </span>
                    </div>
                    <Switch
                      checked={activeConversation.modo_atencion === 'humano_al_mando'}
                      onCheckedChange={handleToggleMode}
                      disabled={isTogglingMode}
                      aria-label="Tomar control de la conversación"
                    />
                  </div>

                  {/* Toggle details sidebar */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowRightPanel(!showRightPanel)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Ver ficha del cliente"
                  >
                    <Info className="w-5 h-5" />
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
                    Atender ahora (Pausar Bot)
                  </Button>
                </div>
              )}

              {/* Message Stream */}
              <ScrollArea className="flex-1 p-4 md:p-6">
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
                                <span className="text-blue-500 font-medium">Asistente Virtual (AI)</span>
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
                            {msg.texto}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Message Input Box */}
              <div className="p-3 md:p-4 border-t bg-card/60 backdrop-blur-sm shrink-0">
                <form onSubmit={handleSendStaffMessage} className="max-w-3xl mx-auto space-y-2">
                  <div className="flex items-end gap-2">
                    <Textarea
                      placeholder={
                        canReply
                          ? 'Escribe una respuesta como recepcionista...'
                          : 'No tienes permiso para responder en este chat.'
                      }
                      value={staffInput}
                      onChange={(e) => setStaffInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendStaffMessage();
                        }
                      }}
                      disabled={!canReply || isSendingStaff}
                      rows={2}
                      className="resize-none text-sm bg-background/80"
                    />
                    <Button
                      type="submit"
                      disabled={!canReply || !staffInput.trim() || isSendingStaff}
                      className="h-10 px-4 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow"
                    >
                      {isSendingStaff ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                    <span className="flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Al responder manualmente, tomarás el control del chat automáticamente.
                    </span>
                    <span>Presiona Enter para enviar, Shift+Enter para salto de línea</span>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-3">
              <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center text-muted-foreground">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Selecciona una conversación</h3>
              <p className="text-xs max-w-sm">
                Elige un chat de la lista izquierda para responder, pausar el bot o revisar el expediente de citas del cliente.
              </p>
            </div>
          )}
        </main>

        {/* ============================================================ */}
        {/* COLUMNA 3: DETALLES DEL CLIENTE Y CITAS (DERECHA) */}
        {/* ============================================================ */}
        {showRightPanel && activeConversation && (
          <aside className="w-80 lg:w-88 border-l bg-card/40 flex flex-col overflow-y-auto shrink-0 transition-all">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> Ficha del Cliente
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setShowRightPanel(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-5">
              {/* Profile Card */}
              <div className="flex flex-col items-center text-center p-4 rounded-xl bg-background/60 border border-border/50">
                <Avatar className="w-16 h-16 border-2 border-primary/20 mb-3">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                    {activeConversation.cliente_nombre
                      ? activeConversation.cliente_nombre.slice(0, 2).toUpperCase()
                      : 'CL'}
                  </AvatarFallback>
                </Avatar>
                <h4 className="font-bold text-base text-foreground">
                  {activeConversation.cliente_nombre || 'Cliente sin registrar'}
                </h4>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Phone className="w-3 h-3" />
                  {activeConversation.cliente_telefono || activeConversation.id}
                </p>

                {activeConversation.cliente_telefono && (
                  <a
                    href={`https://wa.me/${activeConversation.cliente_telefono.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium"
                  >
                    <ExternalLink className="w-3 h-3" /> Abrir WhatsApp Web
                  </a>
                )}
              </div>

              {/* Action: Quick Create Appointment */}
              <Button
                className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow"
                size="sm"
                onClick={() => setIsNewAppointmentModalOpen(true)}
              >
                <Calendar className="w-4 h-4" />
                Agendar Cita en la Agenda
              </Button>

              {/* Client Metrics */}
              {clientDetails?.client && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-background/60 border text-center">
                    <span className="text-muted-foreground block text-[10px]">Citas Totales</span>
                    <span className="font-bold text-base text-foreground">
                      {clientDetails.client.citas_totales || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background/60 border text-center">
                    <span className="text-muted-foreground block text-[10px]">Asistidas</span>
                    <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                      {clientDetails.client.citas_asistidas || 0}
                    </span>
                  </div>
                </div>
              )}

              {/* Appointments History */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-muted-foreground" />
                    Historial de Citas
                  </span>
                  {loadingClientDetails && (
                    <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </div>

                {clientDetails?.recentAppointments?.length > 0 ? (
                  <div className="space-y-2">
                    {clientDetails.recentAppointments.map((app: any) => (
                      <div
                        key={app.id}
                        className="p-3 rounded-lg bg-background/70 border text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {app.fecha} • {app.hora_inicio}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] py-0 ${
                              app.estado === 'confirmada'
                                ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
                                : app.estado === 'cancelada'
                                ? 'border-destructive/40 text-destructive bg-destructive/10'
                                : 'border-border text-muted-foreground'
                            }`}
                          >
                            {app.estado}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground truncate">{app.servicio}</p>
                        <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
                          <Scissors className="w-3 h-3" />
                          {app.professionalNames || app.barbero_nombre || 'Barbero'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic py-2">
                    No hay citas registradas para este número.
                  </p>
                )}
              </div>

              {/* Client Notes */}
              {clientDetails?.client?.notas && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                  <span className="font-semibold block mb-1">Notas del cliente:</span>
                  <p>{clientDetails.client.notas}</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

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

          {/* Sample Prompts */}
          <div className="px-4 py-2 bg-background border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            <span className="text-[11px] text-muted-foreground font-medium shrink-0">Pruebas rápidas:</span>
            {[
              '¡Hola! ¿Qué servicios tienen?',
              '¿Cuánto cuesta un corte de cabello?',
              '¿Qué barberos tienen disponibles?',
              '¿Tienen horario disponible para mañana?',
              '¿Cuáles son mis próximas citas?',
              'Quiero hablar con recepción',
            ].map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendSimulatorMessage(prompt)}
                disabled={isSimProcessing}
                className="px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-[11px] text-foreground font-normal shrink-0 border transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Simulator Messages */}
          <ScrollArea className="flex-1 p-4 min-h-[260px] max-h-[380px] bg-background/50">
            {simMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-2">
                <Bot className="w-10 h-10 text-primary/40" />
                <p className="text-xs">
                  Haz clic en alguna de las pruebas rápidas arriba o escribe un mensaje abajo como si fueras un cliente.
                </p>
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
                      <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                        {isClient ? simName : '🤖 VATOS ALFA Bot'}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                          isClient
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-card border text-card-foreground rounded-tl-sm shadow-sm'
                        }`}
                      >
                        {msg.texto}
                      </div>
                    </div>
                  );
                })}
                {isSimProcessing && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    El Asistente Virtual está pensando y consultando la agenda...
                  </div>
                )}
                <div ref={simMessagesEndRef} />
              </div>
            )}
          </ScrollArea>

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
          const cleanPhone = (client.telefono || '').replace(/\D/g, '');
          const convId = cleanPhone || client.id;
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
    </div>
  );
}
