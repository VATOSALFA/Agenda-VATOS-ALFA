'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck,
  Sparkles,
  LineChart,
  DollarSign,
  Send,
  RefreshCw,
  Lock,
  MessageSquare,
  Users,
  AlertCircle,
  Plus,
  Trash2,
  Paperclip,
  X,
  Check,
  FileText,
  Bookmark,
  Bot,
  Scissors,
  Archive,
} from 'lucide-react';
import {
  getCeoExecutiveDashboardSnapshot,
  getCeoSessionMessages,
  processCeoAgentMessage,
  executeApprovedCeoAction,
  rejectCeoActionProposal,
  saveCeoMasterPinAction,
  deleteCeoMemoryAction,
} from '@/lib/actions/ceo-agent';

const ALLOWED_GENERAL_ADMIN_UID = 'JxK6BLZPOBcBpjnuVZPsgmIHbZ12';
const ALLOWED_GENERAL_ADMIN_EMAIL = 'vatosalfa@gmail.com';

const QUICK_EXECUTIVE_PROMPTS = [
  {
    label: 'Estado de Resultados (P&L)',
    prompt:
      'Dame el Estado de Resultados (P&L) completo de este mes comparado con el mes pasado, desglosando ingresos, egresos, utilidad de gerencia, mi utilidad neta real y el rendimiento por cada barbero.',
    icon: DollarSign,
  },
  {
    label: 'Auditoría Forense Anti-Robo',
    prompt:
      'Ejecuta una auditoría forense completa de los últimos 15 días: revisa todas las ventas eliminadas, verifica si se reingresaron o si falta dinero, audita el uso del código 1234, anticipos y cortes de caja.',
    icon: ShieldCheck,
  },
  {
    label: 'Quejas y Voz del Cliente',
    prompt:
      'Analiza el buzón de quejas y opiniones de la App Móvil y las conversaciones recientes de WhatsApp. Dime de qué se quejan los clientes, qué chats requieren atención y qué mejoras debemos aplicar.',
    icon: MessageSquare,
  },
  {
    label: 'Simulador Beatriz y Equipo',
    prompt:
      'Simula financieramente con los números reales de este mes y del mes pasado distintos esquemas para Beatriz (ej. 26% de utilidad vs 55% de comisión) y dime cuál me conviene más como dueño.',
    icon: LineChart,
  },
  {
    label: 'Horas Muertas y Clientes en Riesgo',
    prompt:
      'Analiza las horas muertas de la agenda, los productos con stock bajo y la lista de clientes frecuentes/VIP que llevan más de 35 días sin venir. Propón una estrategia accionable para esta semana.',
    icon: Sparkles,
  },
];

function formatMxn(val: number | undefined | null): string {
  const n = Number(val || 0);
  const abs = Math.abs(n).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

const SUBAGENT_LABELS: Record<string, string> = {
  subagente_cfo_estado_resultados: 'Subagente CFO (P&L)',
  subagente_cfo_simulador_financiero: 'Simulador Financiero CFO',
  subagente_auditor_forense_antirobo: 'Subagente Auditor Forense',
  subagente_voz_cliente_y_chats: 'Subagente Voz del Cliente',
  subagente_coo_operaciones_agenda_inventario: 'Subagente COO Operaciones',
  subagente_cmo_clientes_y_lealtad: 'Subagente CMO Lealtad',
  guardar_memoria_estrategica_ceo: 'Memoria Estratégica',
  proponer_accion_ejecutiva_ceo: 'Propuesta Ejecutiva',
};

export default function JanetCeoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [snapshot, setSnapshot] = useState<any>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState<boolean>(true);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [modelChoice, setModelChoice] = useState<'pro' | 'flash'>('pro');

  // Adjunto multimodal (estado de cuenta, recibo, captura)
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | undefined>(undefined);
  const [attachmentName, setAttachmentName] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Modal de Aprobación con PIN Maestro
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [masterPinInput, setMasterPinInput] = useState<string>('');
  const [isExecutingProposal, setIsExecutingProposal] = useState<boolean>(false);

  // Modal de Configuración de PIN Maestro
  const [isPinConfigOpen, setIsPinConfigOpen] = useState<boolean>(false);
  const [newMasterPin, setNewMasterPin] = useState<string>('');
  const [isSavingPin, setIsSavingPin] = useState<boolean>(false);

  const isAuthorizedGeneralAdmin =
    Boolean(user) &&
    user?.role === 'Administrador general' &&
    (user?.uid === ALLOWED_GENERAL_ADMIN_UID ||
      user?.email?.toLowerCase() === ALLOWED_GENERAL_ADMIN_EMAIL);

  useEffect(() => {
    if (!authLoading && (!user || !isAuthorizedGeneralAdmin)) {
      router.replace('/agenda');
    }
  }, [authLoading, user, isAuthorizedGeneralAdmin, router]);

  const loadDashboard = async (keepSession = true) => {
    if (!user || !isAuthorizedGeneralAdmin) return;
    setLoadingSnapshot(true);
    try {
      const idToken = await user.getIdToken();
      const res = await getCeoExecutiveDashboardSnapshot(idToken);
      if (res.success) {
        setSnapshot(res);
        if (!keepSession && res.sesiones?.length > 0 && !activeSessionId) {
          const firstSessionId = res.sesiones[0].id;
          setActiveSessionId(firstSessionId);
          const msgsRes = await getCeoSessionMessages(idToken, firstSessionId);
          if (msgsRes.success) setMessages(msgsRes.messages);
        }
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error de Seguridad o Conexión',
        description: err?.message || 'No se pudo cargar la bóveda de Janet CEO.',
      });
    } finally {
      setLoadingSnapshot(false);
    }
  };

  useEffect(() => {
    if (isAuthorizedGeneralAdmin) {
      loadDashboard(false);
    }
  }, [isAuthorizedGeneralAdmin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSelectSession = async (sessionId: string) => {
    if (!user) return;
    setActiveSessionId(sessionId);
    try {
      const idToken = await user.getIdToken();
      const res = await getCeoSessionMessages(idToken, sessionId);
      if (res.success) {
        setMessages(res.messages);
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al cargar sesión',
        description: err?.message,
      });
    }
  };

  const handleNewSession = () => {
    setActiveSessionId(undefined);
    setMessages([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Archivo demasiado grande',
        description: 'El archivo debe pesar menos de 6 MB.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachmentDataUrl(reader.result);
        setAttachmentName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText ?? inputMessage).trim();
    if (!textToSend || isSending || !user) return;

    const currentAttachment = attachmentDataUrl;
    const currentAttachmentName = attachmentName;

    if (!customText) setInputMessage('');
    setAttachmentDataUrl(undefined);
    setAttachmentName(undefined);

    const optimisticUserMsg = {
      id: `temp-${Date.now()}`,
      rol: 'user',
      contenido: textToSend,
      adjuntoNombre: currentAttachmentName || null,
      creado_en: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setIsSending(true);

    try {
      const idToken = await user.getIdToken();
      const res = await processCeoAgentMessage({
        idToken,
        sessionId: activeSessionId,
        userMessage: textToSend,
        modelChoice,
        attachmentDataUrl: currentAttachment,
        attachmentName: currentAttachmentName,
      });

      if (res.success) {
        setActiveSessionId(res.sessionId);
        setMessages((prev) => [
          ...prev,
          {
            id: res.messageId,
            rol: 'assistant',
            contenido: res.reply,
            modelo: res.modelUsed,
            subagentes: res.subagentsInvoked,
            creado_en: new Date().toISOString(),
          },
        ]);
        loadDashboard(true);
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al consultar a Janet CEO',
        description: err?.message || 'Intenta nuevamente.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleApproveProposal = async () => {
    if (!selectedProposal || !masterPinInput.trim() || !user) return;
    setIsExecutingProposal(true);
    try {
      const idToken = await user.getIdToken();
      const res = await executeApprovedCeoAction({
        idToken,
        proposalId: selectedProposal.id,
        masterPin: masterPinInput,
      });

      if (res.success) {
        toast({
          title: 'Acción Ejecutiva Aplicada',
          description: res.message,
        });
        setSelectedProposal(null);
        setMasterPinInput('');
        loadDashboard(true);
      } else {
        toast({
          variant: 'destructive',
          title: 'Autorización Rechazada',
          description: res.message,
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error de ejecución',
        description: err?.message,
      });
    } finally {
      setIsExecutingProposal(false);
    }
  };

  const handleRejectProposal = async (proposalId: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await rejectCeoActionProposal({ idToken, proposalId });
      toast({
        title: 'Propuesta descartada',
        description: 'La propuesta ha sido archivada sin cambios en el sistema.',
      });
      loadDashboard(true);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message,
      });
    }
  };

  const handleSaveMasterPin = async () => {
    if (!user || !newMasterPin.trim()) return;
    setIsSavingPin(true);
    try {
      const idToken = await user.getIdToken();
      const res = await saveCeoMasterPinAction({ idToken, newPin: newMasterPin });
      if (res.success) {
        toast({
          title: 'PIN Maestro Actualizado',
          description: res.message,
        });
        setIsPinConfigOpen(false);
        setNewMasterPin('');
        loadDashboard(true);
      } else {
        toast({
          variant: 'destructive',
          title: 'PIN inválido',
          description: res.message,
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message,
      });
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await deleteCeoMemoryAction({ idToken, memoryId });
      loadDashboard(true);
    } catch (_) {}
  };

  if (authLoading || !isAuthorizedGeneralAdmin) {
    return null;
  }

  const finActual = snapshot?.finanzasMesActual;
  const finAnterior = snapshot?.finanzasMesAnterior;
  const radar = snapshot?.radarOperativo;
  const pendingProposals = (snapshot?.propuestas || []).filter(
    (p: any) => p.estado === 'pendiente_aprobacion'
  );

  const ingresosActual = finActual?.ingresosTotalesConsolidados || 0;
  const ingresosPrev = finAnterior?.ingresosTotalesConsolidados || 0;
  const utilidadNetaActual = finActual?.utilidades?.utilidadNetaTotalConsolidada || 0;
  const margenActual = finActual?.utilidades?.margenNetoPorcentaje || 0;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4 font-sans">
      {/* CABECERA EJECUTIVA OFICIAL VATOS ALFA */}
      <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-3.5 sm:p-5 rounded-2xl border border-[#2d3a60]/60 shadow-xl relative overflow-hidden">
        <div className="header-light-beam" aria-hidden="true" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-[#C5A880] shrink-0" />
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-white">
                JANET CEO — Dirección General & Inteligencia Financiera
              </h1>
              <Badge className="bg-[#C5A880]/15 text-[#C5A880] border border-[#C5A880]/40 text-[10px] px-2 py-0 h-4 font-semibold">
                Bóveda Exclusiva Dueño
              </Badge>
            </div>
            <p className="text-xs text-slate-300 hidden sm:block">
              Consejera ejecutiva con acceso al 100% de finanzas, Estado de Resultados, auditoría forense anti-robo, voz del cliente y estrategia de VATOS ALFA.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Selector de Cerebro Gemini */}
            <div className="inline-flex items-center rounded-xl bg-black/30 border border-white/10 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setModelChoice('pro')}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-semibold transition-colors text-[11px]',
                  modelChoice === 'pro'
                    ? 'bg-[#202A49] text-[#C5A880] border border-[#C5A880]/40'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                Gemini 2.5 Pro (CEO)
              </button>
              <button
                type="button"
                onClick={() => setModelChoice('flash')}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-semibold transition-colors text-[11px]',
                  modelChoice === 'flash'
                    ? 'bg-[#202A49] text-blue-400 border border-blue-500/40'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                Flash (Rápido)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsPinConfigOpen(true)}
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 flex items-center gap-1.5 transition-colors"
              title="Configurar PIN Maestro de Dirección"
            >
              <Lock className="h-3.5 w-3.5 text-[#C5A880]" />
              <span className="hidden sm:inline">PIN Maestro</span>
            </button>

            <button
              type="button"
              onClick={() => loadDashboard(true)}
              disabled={loadingSnapshot}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              title="Actualizar Radar Ejecutivo"
            >
              <RefreshCw className={cn('h-4 w-4', loadingSnapshot && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      {/* RADAR EJECUTIVO: 4 TARJETAS KPI COMPACTAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <Card className="border border-border/60 bg-card/60 shadow-xs">
          <CardContent className="p-2.5 sm:p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                Ingresos ({snapshot?.mesActualNombre || 'Mes Actual'})
              </span>
              <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/70 shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-base sm:text-xl font-bold tracking-tight text-foreground font-sans">
                {loadingSnapshot ? '...' : formatMxn(ingresosActual)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 mt-0.5 hidden sm:block truncate font-sans">
              Mes anterior: {formatMxn(ingresosPrev)} ({finActual?.totalTickets || 0} ventas)
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/60 shadow-xs">
          <CardContent className="p-2.5 sm:p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                Utilidad Neta Dueño
              </span>
              <LineChart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-400 shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={cn(
                  'text-base sm:text-xl font-bold tracking-tight font-sans',
                  utilidadNetaActual < 0 ? 'text-red-400' : 'text-blue-400'
                )}
              >
                {loadingSnapshot ? '...' : formatMxn(utilidadNetaActual)}
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground font-sans">
                ({margenActual.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 mt-0.5 hidden sm:block truncate font-sans">
              Subtotal: {formatMxn(finActual?.utilidades?.subtotalUtilidadServicios)} | Gerencia: {formatMxn(finActual?.utilidades?.comisionGerenciaTotal)}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/60 shadow-xs">
          <CardContent className="p-2.5 sm:p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                Monitor Anti-Robo (15d)
              </span>
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C5A880] shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-base sm:text-xl font-bold tracking-tight text-foreground font-sans">
                {loadingSnapshot ? '...' : `${radar?.ventasEliminadas15Dias ?? 0} eliminadas`}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 mt-0.5 hidden sm:block truncate">
              Auditoría forense activa en tiempo real
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/60 shadow-xs">
          <CardContent className="p-2.5 sm:p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                Quejas App / Alertas
              </span>
              <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/70 shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={cn(
                  'text-base sm:text-xl font-bold tracking-tight font-sans',
                  (radar?.quejasPendientesCount || 0) > 0 ? 'text-red-400' : 'text-foreground'
                )}
              >
                {loadingSnapshot ? '...' : `${radar?.quejasPendientesCount ?? 0} quejas`}
              </span>
              <span className="text-[11px] text-muted-foreground font-sans">
                • {radar?.productosStockBajo ?? 0} stock bajo
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 mt-0.5 hidden sm:block truncate">
              {radar?.chatsEsperandoHumano ?? 0} chats solicitando atención humana
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AREA DE TRABAJO PRINCIPAL: CHAT EJECUTIVO (IZQUIERDA) + BÓVEDA Y TABLAS (DERECHA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* COLUMNA PRINCIPAL (8 COLS): CHAT CON JANET CEO */}
        <div className="lg:col-span-8 flex flex-col">
          <Card className="border border-border/60 bg-card/80 shadow-md flex flex-col h-[640px] overflow-hidden rounded-2xl">
            {/* Barra de acciones rápidas y sesiones */}
            <div className="p-2.5 sm:p-3 border-b border-border/60 bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-[#C5A880] shrink-0" />
                <span className="text-xs font-bold text-foreground">
                  Sala de Consejo Directivo
                </span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  • 5 Subagentes Conectados
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewSession}
                className="h-7 px-2.5 text-[11px] rounded-lg border-border/60"
              >
                <Plus className="h-3.5 w-3.5 mr-1 text-slate-400" />
                Nueva Consulta
              </Button>
            </div>

            {/* Botones de Comandos Ejecutivos Rápidos */}
            <div className="px-3 py-2 border-b border-border/40 bg-background/40 flex items-center gap-1.5 overflow-x-auto">
              {QUICK_EXECUTIVE_PROMPTS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={isSending}
                    onClick={() => handleSendMessage(item.prompt)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-muted/30 hover:bg-[#202A49] hover:text-white border border-border/60 transition-colors cursor-pointer"
                  >
                    <Icon className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Lista de Mensajes */}
            <ScrollArea className="flex-1 p-3 sm:p-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4 space-y-3">
                  <Sparkles className="h-7 w-7 text-[#C5A880]" />
                  <div className="space-y-1 max-w-lg">
                    <h3 className="text-sm sm:text-base font-bold text-foreground">
                      Bienvenido a tu Dirección General, Alejandro
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Pregúntame cualquier dato financiero, Estado de Resultados, simulación de sueldos/comisiones, auditoría de movimientos sospechosos en recepción, quejas de clientes o estrategias para crecer VATOS ALFA.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {messages.map((msg) => {
                    const isUser = msg.rol === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex flex-col',
                          isUser ? 'items-end' : 'items-start'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[92%] sm:max-w-[85%] rounded-2xl p-3 sm:p-3.5 text-xs sm:text-sm leading-relaxed',
                            isUser
                              ? 'bg-[#202A49] text-white border border-blue-500/30'
                              : 'bg-muted/30 text-foreground border border-border/60'
                          )}
                        >
                          {!isUser && (
                            <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-border/40">
                              <span className="text-[11px] font-bold text-[#C5A880] flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-[#C5A880]" />
                                JANET CEO
                              </span>
                              {msg.modelo && (
                                <span className="text-[10px] text-muted-foreground">
                                  {msg.modelo}
                                </span>
                              )}
                            </div>
                          )}

                          {msg.adjuntoNombre && (
                            <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/20 text-[11px] text-slate-300">
                              <FileText className="h-3.5 w-3.5 text-slate-400" />
                              <span>{msg.adjuntoNombre}</span>
                            </div>
                          )}

                          <div className="whitespace-pre-wrap break-words font-sans">
                            {msg.contenido}
                          </div>

                          {!isUser && Array.isArray(msg.subagentes) && msg.subagentes.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                Subagentes consultados:
                              </span>
                              {msg.subagentes.map((sa: string) => (
                                <Badge
                                  key={sa}
                                  variant="outline"
                                  className="text-[10px] py-0 h-4 border-[#C5A880]/40 text-[#C5A880]"
                                >
                                  {SUBAGENT_LABELS[sa] || sa}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isSending && (
                    <div className="flex items-start">
                      <div className="rounded-2xl p-3 bg-muted/30 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#C5A880]" />
                        <span>
                          Janet CEO está coordinando a sus subagentes financieros y de auditoría...
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Barra inferior de entrada de mensaje */}
            <div className="p-2.5 sm:p-3 border-t border-border/60 bg-background/80 space-y-2">
              {attachmentName && (
                <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-muted/40 border border-border/60 text-xs">
                  <span className="flex items-center gap-1.5 truncate text-foreground">
                    <Paperclip className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    {attachmentName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentDataUrl(undefined);
                      setAttachmentName(undefined);
                    }}
                    className="text-slate-400 hover:text-white p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 w-9 rounded-xl border border-border/60 text-slate-400 hover:text-foreground hover:bg-muted/40 flex items-center justify-center shrink-0 transition-colors"
                  title="Adjuntar captura o estado de cuenta"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Pregúntale a Janet CEO sobre finanzas, auditoría, barberos, quejas o estrategias..."
                  className="min-h-[38px] max-h-[110px] py-2 text-xs sm:text-sm rounded-xl resize-none"
                  rows={1}
                />

                <Button
                  variant="alfa"
                  disabled={isSending || !inputMessage.trim()}
                  onClick={() => handleSendMessage()}
                  className="h-9 px-4 rounded-xl text-xs font-bold shrink-0"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5 text-slate-200" />
                  Enviar
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* COLUMNA DERECHA (4 COLS): PROPUESTAS EJECUTIVAS, RENDIMIENTO BARBEROS Y MEMORIA */}
        <div className="lg:col-span-4 space-y-4">
          {/* 1. PROPUESTAS EJECUTIVAS PENDIENTES DE APROBACIÓN */}
          <Card className="border border-border/60 bg-card/60 shadow-xs">
            <CardHeader className="p-3 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#C5A880]" />
                  Propuestas Ejecutivas
                </CardTitle>
                <Badge variant="outline" className="text-[10px] py-0 h-4 font-sans">
                  {pendingProposals.length} pendientes
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2.5">
              {pendingProposals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Cuando Janet CEO proponga un cambio en precios, promociones o comisiones, aparecerá aquí para tu autorización con PIN Maestro.
                </p>
              ) : (
                pendingProposals.map((prop: any) => (
                  <div
                    key={prop.id}
                    className="p-2.5 rounded-xl border border-[#C5A880]/40 bg-muted/20 space-y-2 text-xs"
                  >
                    <div className="font-bold text-foreground">{prop.tituloPropuesta}</div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {prop.justificacionEstrategica}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                      <div className="p-1.5 rounded bg-background/60 border border-border/40">
                        <span className="text-[10px] text-muted-foreground block">Antes:</span>
                        <span className="font-semibold text-foreground">{prop.resumenAntes}</span>
                      </div>
                      <div className="p-1.5 rounded bg-background/60 border border-blue-500/30">
                        <span className="text-[10px] text-blue-400 block">Después:</span>
                        <span className="font-semibold text-foreground">{prop.resumenDespues}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="alfa"
                        size="sm"
                        onClick={() => setSelectedProposal(prop)}
                        className="flex-1 h-7 text-[11px] rounded-lg"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Autorizar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRejectProposal(prop.id)}
                        className="h-7 px-2.5 text-[11px] rounded-lg"
                      >
                        Descartar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* 2. TABLA COMPACTA: RENDIMIENTO POR BARBERO (MES ACTUAL) */}
          <Card className="border border-border/60 bg-card/60 shadow-xs overflow-hidden">
            <CardHeader className="p-3 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <Scissors className="h-3.5 w-3.5 text-slate-400" />
                  Producción por Barbero (Mes Actual)
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                    <TableHead className="py-1 px-3 text-xs font-semibold">Barbero</TableHead>
                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Serv.</TableHead>
                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Ingreso</TableHead>
                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Margen Casa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(finActual?.rendimientoPorBarbero || []).length === 0 ? (
                    <TableRow className="h-9">
                      <TableCell colSpan={4} className="py-1.5 px-3 text-xs text-center text-muted-foreground">
                        {loadingSnapshot ? 'Calculando producción...' : 'Sin registros en el periodo'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (finActual?.rendimientoPorBarbero || []).map((b: any) => (
                      <TableRow
                        key={b.id}
                        className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40"
                      >
                        <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">
                          {b.nombre}
                        </TableCell>
                        <TableCell className="py-1.5 px-3 text-xs text-right font-sans">
                          {b.serviciosRealizados}
                        </TableCell>
                        <TableCell className="py-1.5 px-3 text-xs font-semibold text-foreground text-right font-sans">
                          {formatMxn(b.ingresosGenerados)}
                        </TableCell>
                        <TableCell className="py-1.5 px-3 text-xs font-medium text-blue-400 text-right font-sans">
                          {formatMxn(b.margenBrutoParaBarberia)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 3. BÓVEDA DE MEMORIA ESTRATÉGICA */}
          <Card className="border border-border/60 bg-card/60 shadow-xs">
            <CardHeader className="p-3 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <Bookmark className="h-3.5 w-3.5 text-[#C5A880]" />
                  Memoria Estratégica de Janet CEO
                </CardTitle>
                <span className="text-[10px] text-muted-foreground font-sans">
                  {(snapshot?.memorias || []).length} activas
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2 max-h-48 overflow-y-auto">
              {(snapshot?.memorias || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Pídele a Janet CEO que recuerde cualquier meta mensual o decisión administrativa y quedará guardada aquí.
                </p>
              ) : (
                (snapshot?.memorias || []).map((m: any) => (
                  <div
                    key={m.id}
                    className="p-2 rounded-lg bg-muted/20 border border-border/40 flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground block truncate">
                        {m.titulo}
                      </span>
                      <span className="text-[11px] text-muted-foreground line-clamp-2">
                        {m.detalle}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(m.id)}
                      className="text-slate-400 hover:text-white p-1 shrink-0"
                      title="Archivar memoria"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* 4. HISTORIAL DE SESIONES EJECUTIVAS */}
          {(snapshot?.sesiones || []).length > 0 && (
            <Card className="border border-border/60 bg-card/60 shadow-xs">
              <CardHeader className="p-3 pb-2 border-b border-border/40">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5 text-slate-400" />
                  Consultas Ejecutivas Recientes
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1 max-h-40 overflow-y-auto">
                {(snapshot?.sesiones || []).map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSession(s.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-lg text-xs truncate transition-colors',
                      activeSessionId === s.id
                        ? 'bg-[#202A49] text-white font-semibold'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                    )}
                  >
                    {s.titulo || 'Sesión Ejecutiva'}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* MODAL OFICIAL DE AUTORIZACIÓN DE PROPUESTA EJECUTIVA */}
      <Dialog
        open={Boolean(selectedProposal)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProposal(null);
            setMasterPinInput('');
          }
        }}
      >
        <DialogContent
          hideCloseButton={true}
          className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background flex flex-col"
        >
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-[#C5A880] shrink-0" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    Autorizar Acción Ejecutiva
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300 mt-0.5">
                    Confirmación criptográfica exclusiva de Dirección General
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProposal(null)}
                className="p-1 text-slate-300 hover:text-white transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
            <div className="p-3 rounded-xl bg-muted/30 border border-border/60 space-y-1.5">
              <div className="font-bold text-foreground">
                {selectedProposal?.tituloPropuesta}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedProposal?.justificacionEstrategica}
              </p>
              <div className="pt-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Antes: <strong>{selectedProposal?.resumenAntes}</strong>
                </span>
                <span className="text-blue-400">
                  Nuevo: <strong>{selectedProposal?.resumenDespues}</strong>
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground block">
                Ingresa tu PIN Maestro o Código de Dirección:
              </label>
              <Input
                type="password"
                value={masterPinInput}
                onChange={(e) => setMasterPinInput(e.target.value)}
                placeholder="••••"
                className="text-center tracking-widest font-sans text-base h-10 rounded-xl"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setSelectedProposal(null)}
                className="rounded-xl text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                variant="alfa"
                disabled={isExecutingProposal || !masterPinInput.trim()}
                onClick={handleApproveProposal}
                className="rounded-xl text-xs h-9 px-4"
              >
                {isExecutingProposal ? 'Ejecutando...' : 'Autorizar y Ejecutar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL OFICIAL PARA CONFIGURAR PIN MAESTRO */}
      <Dialog open={isPinConfigOpen} onOpenChange={setIsPinConfigOpen}>
        <DialogContent
          hideCloseButton={true}
          className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background flex flex-col"
        >
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[#C5A880] shrink-0" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    PIN Maestro de Dirección General
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300 mt-0.5">
                    Protege la ejecución de cambios con una llave exclusiva
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPinConfigOpen(false)}
                className="p-1 text-slate-300 hover:text-white transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Este PIN se cifra con SHA-256 en servidor y se solicita únicamente cuando autorizas a Janet CEO a modificar precios, comisiones o promociones. Tras 3 intentos fallidos, se bloquea automáticamente por 15 minutos.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground block">
                Nuevo PIN Maestro (4 a 8 dígitos numéricos):
              </label>
              <Input
                type="password"
                value={newMasterPin}
                onChange={(e) => setNewMasterPin(e.target.value)}
                placeholder="Ej. 849201"
                className="text-center tracking-widest font-sans text-base h-10 rounded-xl"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsPinConfigOpen(false)}
                className="rounded-xl text-xs h-9"
              >
                Cancelar
              </Button>
              <Button
                variant="alfa"
                disabled={isSavingPin || newMasterPin.trim().length < 4}
                onClick={handleSaveMasterPin}
                className="rounded-xl text-xs h-9 px-4"
              >
                {isSavingPin ? 'Cifrando...' : 'Guardar PIN Maestro'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
