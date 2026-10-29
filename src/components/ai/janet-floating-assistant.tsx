'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  Send,
  X,
  Maximize2,
  Minimize2,
  Loader2,
  Calendar,
  Clock,
  Archive,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  Bell,
  Plus,
  KeyRound,
  Lock,
  Check,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getGerenciaDashboardSnapshot,
  processGerenciaAgentMessage,
  executeApprovedGerenciaAction,
  rejectGerenciaActionProposal,
  toggleGerenciaReminderAction,
  createGerenciaReminderAction,
  type GerenciaChatMessage,
  type GerenciaReminderItem,
} from '@/lib/actions/gerencia-agent';
import {
  getCeoExecutiveDashboardSnapshot,
  getCeoSessionMessages,
  processCeoAgentMessage,
  executeApprovedCeoAction,
} from '@/lib/actions/ceo-agent';

interface FloatingCeoMessage {
  id: string;
  rol: 'user' | 'assistant';
  contenido: string;
  creado_en: string;
  subagentes?: string[];
  propuestaAccion?: {
    id: string;
    tituloPropuesta: string;
    justificacionEstrategica: string;
    estado: string;
  } | null;
}

export function JanetFloatingAssistant() {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const { toast } = useToast();

  const isGeneralOwner =
    user?.role === 'Administrador general' &&
    (user?.uid === 'JxK6BLZPOBcBpjnuVZPsgmIHbZ12' ||
      user?.email?.toLowerCase() === 'vatosalfa@gmail.com');

  const isBranchManager = user?.role === 'Administrador local';
  const canUseAssistant = isGeneralOwner || isBranchManager;

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // El Administrador General puede usar Janet CEO por defecto o cambiar a "Modo Gerencia (Bety)" para supervisar
  const [activeAgentMode, setActiveAgentMode] = useState<'ceo' | 'gerencia'>('gerencia');
  const [activeTab, setActiveTab] = useState<'chat' | 'recordatorios'>('chat');

  // Estado de Janet Gerencia
  const [gerenciaLoading, setGerenciaLoading] = useState(false);
  const [gerenciaSending, setGerenciaSending] = useState(false);
  const [gerenciaSessionId, setGerenciaSessionId] = useState('');
  const [gerenciaMessages, setGerenciaMessages] = useState<GerenciaChatMessage[]>([]);
  const [gerenciaReminders, setGerenciaReminders] = useState<GerenciaReminderItem[]>([]);
  const [gerenciaStockAlerts, setGerenciaStockAlerts] = useState<
    Array<{ id: string; nombre: string; stock: number; min: number }>
  >([]);
  const [gerenciaKpis, setGerenciaKpis] = useState({
    citasActivasHoy: 0,
    citasSinConfirmarHoy: 0,
    ventasHoyCount: 0,
    ventasHoyTotal: 0,
    alertasStockCount: 0,
    recordatoriosPendientesCount: 0,
  });

  // Estado de Janet CEO (cuando el Administrador General usa el botón flotante)
  const [ceoLoading, setCeoLoading] = useState(false);
  const [ceoSending, setCeoSending] = useState(false);
  const [ceoSessionId, setCeoSessionId] = useState('');
  const [ceoMessages, setCeoMessages] = useState<FloatingCeoMessage[]>([]);
  const [ceoModelChoice, setCeoModelChoice] = useState<'pro' | 'flash'>('pro');

  // Inputs compartidos
  const [inputPrompt, setInputPrompt] = useState('');
  const [proposalAuthCodeMap, setProposalAuthCodeMap] = useState<Record<string, string>>({});
  const [executingPropId, setExecutingPropId] = useState<string | null>(null);

  // Nuevo recordatorio rápido
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderCat, setNewReminderCat] = useState<
    'inventario' | 'insumos' | 'equipo' | 'operacion_general'
  >('insumos');
  const [addingReminder, setAddingReminder] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGeneralOwner) {
      setActiveAgentMode('ceo');
    } else {
      setActiveAgentMode('gerencia');
    }
  }, [isGeneralOwner]);

  const getFreshToken = useCallback(async () => {
    const auth = getAuth();
    const current = auth.currentUser;
    if (!current) throw new Error('Sesión no disponible.');
    return await current.getIdToken(false);
  }, []);

  const loadGerenciaData = useCallback(async () => {
    if (!canUseAssistant) return;
    try {
      setGerenciaLoading(true);
      const token = await getFreshToken();
      const snap = await getGerenciaDashboardSnapshot(token);
      setGerenciaKpis(snap.kpisDia);
      setGerenciaReminders(snap.recordatorios || []);
      setGerenciaStockAlerts(snap.alertasStock || []);
      setGerenciaSessionId(snap.sesionActivaId || '');
      setGerenciaMessages(snap.mensajesRecientes || []);
    } catch (err: any) {
      console.error('Error cargando Janet Gerencia:', err);
    } finally {
      setGerenciaLoading(false);
    }
  }, [canUseAssistant, getFreshToken]);

  const loadCeoData = useCallback(async () => {
    if (!isGeneralOwner) return;
    try {
      setCeoLoading(true);
      const token = await getFreshToken();
      const snap = await getCeoExecutiveDashboardSnapshot(token);
      const latestSessionId = snap.sesiones?.[0]?.id || '';
      setCeoSessionId(latestSessionId);
      if (latestSessionId) {
        const msgsRes = await getCeoSessionMessages(token, latestSessionId);
        setCeoMessages((msgsRes.messages || []) as FloatingCeoMessage[]);
      }
    } catch (err: any) {
      console.error('Error cargando Janet CEO flotante:', err);
    } finally {
      setCeoLoading(false);
    }
  }, [isGeneralOwner, getFreshToken]);

  // Cargar resumen inicial para mostrar badge de recordatorios a Beatriz o datos al Admin
  useEffect(() => {
    if (!authLoading && canUseAssistant) {
      loadGerenciaData();
      if (isGeneralOwner) {
        loadCeoData();
      }
    }
  }, [authLoading, canUseAssistant, isGeneralOwner, loadGerenciaData, loadCeoData]);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, gerenciaMessages, ceoMessages, activeTab, activeAgentMode]);

  if (authLoading || !canUseAssistant) {
    return null;
  }

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? inputPrompt).trim();
    if (!text) return;

    if (activeAgentMode === 'ceo' && isGeneralOwner) {
      if (ceoSending) return;
      try {
        setCeoSending(true);
        if (!overrideText) setInputPrompt('');

        const tempMsg: FloatingCeoMessage = {
          id: `temp_${Date.now()}`,
          rol: 'user',
          contenido: text,
          creado_en: new Date().toISOString(),
        };
        setCeoMessages((prev) => [...prev, tempMsg]);

        const token = await getFreshToken();
        const res = await processCeoAgentMessage({
          idToken: token,
          sessionId: ceoSessionId || undefined,
          userMessage: text,
          modelChoice: ceoModelChoice,
        });

        setCeoSessionId(res.sessionId);
        setCeoMessages((prev) => [
          ...prev,
          {
            id: res.messageId,
            rol: 'assistant',
            contenido: res.reply,
            creado_en: new Date().toISOString(),
            subagentes: res.subagentsInvoked,
          },
        ]);
        // Si Janet CEO envió una consigna a gerencia, refrescar recordatorios
        if (res.subagentsInvoked?.includes('enviar_consigna_a_gerencia_sucursal')) {
          loadGerenciaData();
        }
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error en Janet CEO',
          description: err?.message || 'No se pudo procesar tu instrucción.',
        });
      } finally {
        setCeoSending(false);
      }
      return;
    }

    // Modo Janet Gerencia (Beatriz o Supervisión)
    if (gerenciaSending) return;
    try {
      setGerenciaSending(true);
      setActiveTab('chat');
      if (!overrideText) setInputPrompt('');

      const tempMsg: GerenciaChatMessage = {
        id: `temp_${Date.now()}`,
        rol: 'user',
        contenido: text,
        creado_en: new Date().toISOString(),
      };
      setGerenciaMessages((prev) => [...prev, tempMsg]);

      const token = await getFreshToken();
      const res = await processGerenciaAgentMessage({
        idToken: token,
        sessionId: gerenciaSessionId || undefined,
        userMessage: text,
      });

      setGerenciaSessionId(res.sessionId);
      setGerenciaMessages((prev) => [...prev, res.message]);
      loadGerenciaData();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error en Janet Gerencia',
        description: err?.message || 'No se pudo procesar la solicitud operativa.',
      });
    } finally {
      setGerenciaSending(false);
    }
  };

  const handleApproveGerenciaProposal = async (propId: string, tipoAccion: string) => {
    const code = proposalAuthCodeMap[propId] || '';
    if (tipoAccion === 'eliminar_venta' && !code.trim()) {
      toast({
        variant: 'destructive',
        title: 'Código requerido',
        description: 'Ingresa tu código de autorización para eliminar la venta.',
      });
      return;
    }

    try {
      setExecutingPropId(propId);
      const token = await getFreshToken();
      const res = await executeApprovedGerenciaAction({
        idToken: token,
        propuestaId: propId,
        authCode: code,
      });

      if (!res.success) {
        toast({
          variant: 'destructive',
          title: 'No se pudo ejecutar',
          description: res.message,
        });
        return;
      }

      toast({
        title: 'Operación Aplicada',
        description: res.message,
      });

      setGerenciaMessages((prev) =>
        prev.map((m) =>
          m.propuestaAccion?.id === propId
            ? {
                ...m,
                propuestaAccion: {
                  ...m.propuestaAccion,
                  estado: 'ejecutada',
                },
              }
            : m
        )
      );
      loadGerenciaData();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message || 'Error al ejecutar la operación.',
      });
    } finally {
      setExecutingPropId(null);
    }
  };

  const handleRejectGerenciaProposal = async (propId: string) => {
    try {
      setExecutingPropId(propId);
      const token = await getFreshToken();
      await rejectGerenciaActionProposal({ idToken: token, propuestaId: propId });
      setGerenciaMessages((prev) =>
        prev.map((m) =>
          m.propuestaAccion?.id === propId
            ? {
                ...m,
                propuestaAccion: {
                  ...m.propuestaAccion,
                  estado: 'rechazada',
                },
              }
            : m
        )
      );
    } catch (_) {
    } finally {
      setExecutingPropId(null);
    }
  };

  const handleApproveCeoProposal = async (propId: string) => {
    const pin = proposalAuthCodeMap[propId] || '';
    if (!pin.trim()) {
      toast({
        variant: 'destructive',
        title: 'PIN Maestro Requerido',
        description: 'Ingresa tu PIN Maestro Ejecutivo para autorizar el cambio.',
      });
      return;
    }

    try {
      setExecutingPropId(propId);
      const token = await getFreshToken();
      const res = await executeApprovedCeoAction({
        idToken: token,
        proposalId: propId,
        masterPin: pin,
      });

      if (!res.success) {
        toast({
          variant: 'destructive',
          title: 'Autorización rechazada',
          description: res.message,
        });
        return;
      }

      toast({
        title: 'Acción Ejecutiva Aplicada',
        description: res.message,
      });

      setCeoMessages((prev) =>
        prev.map((m) =>
          m.propuestaAccion?.id === propId
            ? {
                ...m,
                propuestaAccion: {
                  ...m.propuestaAccion,
                  estado: 'ejecutada',
                },
              }
            : m
        )
      );
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message || 'Error al aplicar propuesta ejecutiva.',
      });
    } finally {
      setExecutingPropId(null);
    }
  };

  const handleCompleteReminder = async (reminderId: string) => {
    try {
      const token = await getFreshToken();
      await toggleGerenciaReminderAction({
        idToken: token,
        reminderId,
        completed: true,
      });
      setGerenciaReminders((prev) => prev.filter((r) => r.id !== reminderId));
      setGerenciaKpis((prev) => ({
        ...prev,
        recordatoriosPendientesCount: Math.max(0, prev.recordatoriosPendientesCount - 1),
      }));
      toast({
        title: 'Pendiente completado',
        description: 'El recordatorio fue marcado como realizado.',
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el recordatorio.',
      });
    }
  };

  const handleAddQuickReminder = async () => {
    if (!newReminderTitle.trim() || addingReminder) return;
    try {
      setAddingReminder(true);
      const token = await getFreshToken();
      await createGerenciaReminderAction({
        idToken: token,
        categoria: newReminderCat,
        titulo: newReminderTitle.trim(),
        detalle: 'Recordatorio operativo registrado desde el asistente de sucursal.',
      });
      setNewReminderTitle('');
      await loadGerenciaData();
      toast({
        title: 'Recordatorio guardado',
        description: 'Se agregó a tu lista de pendientes de sucursal.',
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el recordatorio.',
      });
    } finally {
      setAddingReminder(false);
    }
  };

  const pendingBadgeCount =
    gerenciaKpis.recordatoriosPendientesCount + gerenciaKpis.alertasStockCount;

  return (
    <>
      {/* BOTÓN FLOTANTE DE JANET (SIEMPRE DISPONIBLE EN LA SESIÓN DE BETY Y DEL ADMIN GENERAL) */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="btn-vatos-alfa rounded-2xl px-4 py-2.5 shadow-[0_10px_30px_rgba(32,42,73,0.55)] border border-[#C5A880]/50 flex items-center gap-2.5 text-white hover:scale-[1.02] transition-transform cursor-pointer"
            title={
              isGeneralOwner
                ? 'Abrir Asistente Flotante Janet CEO / Gerencia'
                : 'Abrir Asistente Janet Gerencia'
            }
          >
            <Sparkles className="h-4 w-4 text-[#C5A880] shrink-0" />
            <div className="text-left">
              <div className="text-xs font-bold tracking-wide leading-none flex items-center gap-1.5">
                <span>{isGeneralOwner ? 'Janet CEO' : 'Janet Gerencia'}</span>
                {pendingBadgeCount > 0 && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#202A49] text-[#C5A880] border border-[#C5A880]/60 font-sans">
                    {pendingBadgeCount}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-300 leading-tight mt-0.5 hidden sm:block">
                {isGeneralOwner ? 'Dirección y Supervisión' : 'Asistente de Sucursal'}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* PANEL FLOTANTE DESPLEGABLE */}
      {isOpen && (
        <div
          className={cn(
            'fixed z-50 bg-background border-2 border-blue-500 rounded-2xl shadow-[0_15px_45px_rgba(32,42,73,0.45)] overflow-hidden flex flex-col transition-all duration-200',
            isExpanded
              ? 'inset-3 sm:inset-6'
              : 'bottom-3 right-3 left-3 sm:left-auto sm:w-[430px] h-[82vh] sm:h-[630px]'
          )}
        >
          {/* CABECERA OFICIAL VATOS ALFA */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-3.5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="h-4 w-4 text-[#C5A880] shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                      {activeAgentMode === 'ceo' && isGeneralOwner
                        ? 'JANET CEO · Dirección'
                        : 'JANET GERENCIA · Sucursal'}
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-[#C5A880]/50 text-[#C5A880] bg-[#162038]/80 px-1.5 py-0"
                    >
                      {activeAgentMode === 'ceo' && isGeneralOwner ? 'CEO Exclusiva' : 'Soporte Bety'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate">
                    {activeAgentMode === 'ceo' && isGeneralOwner
                      ? 'Finanzas, Auditoría Forense y Estrategia'
                      : 'Horarios de Barberos, Citas, Ventas e Inventario'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isGeneralOwner && pathname !== '/ceo' && (
                  <Link
                    href="/ceo"
                    onClick={() => setIsOpen(false)}
                    className="h-7 px-2 rounded-lg text-[10px] font-semibold text-[#C5A880] hover:text-white hover:bg-white/10 border border-[#C5A880]/30 flex items-center gap-1 transition-colors"
                    title="Ir a la Sala Ejecutiva Completa (/ceo)"
                  >
                    <span>Sala CEO</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="h-7 w-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                  title={isExpanded ? 'Contraer ventana' : 'Ampliar ventana'}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                  title="Minimizar asistente"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* BARRA SUPERIOR DE MODO (PARA EL DUEÑO) Y PESTAÑAS DE GERENCIA */}
          <div className="bg-muted/30 border-b border-border/60 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
            {isGeneralOwner ? (
              <div className="flex items-center gap-1 bg-background border border-border/60 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveAgentMode('ceo');
                    setActiveTab('chat');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
                    activeAgentMode === 'ceo'
                      ? 'bg-[#202A49] text-[#C5A880]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Janet CEO (Dueño)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAgentMode('gerencia')}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors',
                    activeAgentMode === 'gerencia'
                      ? 'bg-[#202A49] text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Janet Gerencia (Bety)
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-sans">
                <span>
                  Citas hoy: <strong className="text-foreground">{gerenciaKpis.citasActivasHoy}</strong>
                </span>
                <span>·</span>
                <span>
                  Caja hoy:{' '}
                  <strong className="text-foreground">
                    ${formatMoney(gerenciaKpis.ventasHoyTotal)}
                  </strong>
                </span>
              </div>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors',
                  activeTab === 'chat'
                    ? 'bg-[#202A49] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('recordatorios')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1',
                  activeTab === 'recordatorios'
                    ? 'bg-[#202A49] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Bell className="h-3 w-3 text-[#C5A880]" />
                <span>Insumos/Stock</span>
                {pendingBadgeCount > 0 && (
                  <span className="text-[10px] font-bold text-[#C5A880] font-sans">
                    ({pendingBadgeCount})
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* CONTENIDO PRINCIPAL: PESTAÑA RECORDATORIOS E INVENTARIO */}
          {activeTab === 'recordatorios' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Formulario rápido para agregar recordatorio (para Bety o consigna del Admin) */}
              <div className="p-2.5 rounded-xl border border-border/60 bg-muted/15 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    {isGeneralOwner
                      ? 'Dejar consigna o recordatorio para Beatriz'
                      : 'Nuevo recordatorio de sucursal'}
                  </span>
                  <select
                    value={newReminderCat}
                    onChange={(e) => setNewReminderCat(e.target.value as any)}
                    className="text-[11px] bg-background border border-border/60 rounded-lg px-2 py-1 text-foreground"
                  >
                    <option value="insumos">Insumos Barbería</option>
                    <option value="inventario">Conteo Inventario</option>
                    <option value="equipo">Equipo / Barberos</option>
                    <option value="operacion_general">Operación General</option>
                  </select>
                </div>
                <div className="flex gap-1.5">
                  <Input
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                    placeholder="Ej. Comprar navajas, papel cuello y hacer inventario..."
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddQuickReminder();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddQuickReminder}
                    disabled={addingReminder || !newReminderTitle.trim()}
                    className="btn-vatos-alfa h-8 px-3 rounded-lg text-xs font-bold shrink-0"
                  >
                    {addingReminder ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Lista de recordatorios activos de Beatriz */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#C5A880]" />
                    <span>Recordatorios Pendientes ({gerenciaReminders.length})</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        'Janet, revisa el inventario de productos y dime qué tenemos con stock bajo o agotado y qué recordatorios tengo pendientes.'
                      )
                    }
                    className="text-[11px] font-semibold text-blue-400 hover:underline"
                  >
                    Pedir reporte a Janet
                  </button>
                </div>

                {gerenciaReminders.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 rounded-xl border border-border/50 text-center">
                    Todo al día. No hay recordatorios pendientes por ahora.
                  </p>
                ) : (
                  gerenciaReminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="p-2.5 rounded-xl border border-border/60 bg-background flex items-start justify-between gap-2.5"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-border/60 text-muted-foreground uppercase"
                          >
                            {rem.categoria}
                          </Badge>
                          <span className="text-[10px] text-[#C5A880] font-medium">
                            {rem.origen}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground">{rem.titulo}</p>
                        {rem.detalle && (
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {rem.detalle}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCompleteReminder(rem.id)}
                        className="h-7 px-2 rounded-lg border border-border/60 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-blue-500 flex items-center gap-1 shrink-0 transition-colors"
                        title="Marcar como realizado"
                      >
                        <Check className="h-3.5 w-3.5 text-blue-400" />
                        <span>Listo</span>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Alertas de Stock de Productos */}
              <div className="space-y-2 pt-1">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5 text-slate-400" />
                  <span>Productos por Contar / Resurtir ({gerenciaStockAlerts.length})</span>
                </h4>
                {gerenciaStockAlerts.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2.5 rounded-xl border border-border/50">
                    Todos los productos activos tienen stock saludable.
                  </p>
                ) : (
                  <div className="divide-y divide-border/50 rounded-xl border border-border/60 overflow-hidden">
                    {gerenciaStockAlerts.map((prod) => (
                      <div
                        key={prod.id}
                        className="py-2 px-3 flex items-center justify-between text-xs bg-background"
                      >
                        <span className="font-medium text-foreground truncate pr-2">
                          {prod.nombre}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-semibold shrink-0 font-sans',
                            prod.stock <= 0 ? 'text-red-400' : 'text-blue-400'
                          )}
                        >
                          Stock: {prod.stock} (Mín: {prod.min})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* CONTENIDO PRINCIPAL: PESTAÑA CHAT (JANET GERENCIA O JANET CEO) */
            <>
              {/* Botones de Acción Rápida según el Modo */}
              <div className="px-3 py-2 border-b border-border/50 bg-muted/10 flex items-center gap-1.5 overflow-x-auto shrink-0">
                {activeAgentMode === 'ceo' && isGeneralOwner ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        handleSend(
                          'Dame el Estado de Resultados (P&L) de este mes hasta hoy con mi utilidad neta real y el reparto de gerencia.'
                        )
                      }
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/60 bg-background hover:border-blue-500 text-foreground whitespace-nowrap transition-colors"
                    >
                      Estado de Resultados
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSend(
                          'Haz una auditoría forense de los últimos 14 días: ventas eliminadas, uso del código 1234 y cortes de caja.'
                        )
                      }
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/60 bg-background hover:border-blue-500 text-foreground whitespace-nowrap transition-colors"
                    >
                      Auditoría Anti-Robo
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSend(
                          'Envía una consigna a Janet Gerencia para recordar a Beatriz hacer inventario físico de productos y revisar insumos de barbería.'
                        )
                      }
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/60 bg-background hover:border-blue-500 text-foreground whitespace-nowrap transition-colors"
                    >
                      Recordar Inventario a Bety
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        handleSend(
                          '¿Cómo vamos hoy en la sucursal? Dime el resumen de citas del día, cuáles faltan por confirmar y las ventas cobradas hoy.'
                        )
                      }
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/60 bg-background hover:border-blue-500 text-foreground whitespace-nowrap transition-colors"
                    >
                      Resumen de Hoy
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setInputPrompt(
                          'Bloquéale el horario a [Nombre del barbero] mañana de 10:00 a 14:00 por motivo de '
                        )
                      }
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/60 bg-background hover:border-blue-500 text-foreground whitespace-nowrap transition-colors"
                    >
                      Cerrar Horario Barbero
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setInputPrompt(
                          'Habilítale un horario especial a [Nombre del barbero] el día [YYYY-MM-DD] de 10:00 a 15:00'
                        )
                      }
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/60 bg-background hover:border-blue-500 text-foreground whitespace-nowrap transition-colors"
                    >
                      Habilitar Horario Especial
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSend(
                          'Revisa el inventario de productos y mis recordatorios pendientes de insumos para decirme qué hace falta pedir o contar.'
                        )
                      }
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/60 bg-background hover:border-blue-500 text-foreground whitespace-nowrap transition-colors"
                    >
                      Checar Stock e Insumos
                    </button>
                  </>
                )}
              </div>

              {/* Historial de Mensajes */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {activeAgentMode === 'ceo' && isGeneralOwner ? (
                  ceoMessages.length === 0 ? (
                    <div className="p-4 rounded-xl border border-border/60 bg-muted/15 text-xs space-y-2">
                      <p className="font-bold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-[#C5A880]" />
                        <span>Janet CEO lista en cualquier pantalla</span>
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        Pregúntame sobre el Estado de Resultados, pídeme auditar cualquier movimiento de recepción o envíale recordatorios directos a Beatriz.
                      </p>
                    </div>
                  ) : (
                    ceoMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex flex-col gap-1.5',
                          msg.rol === 'user' ? 'items-end' : 'items-start'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap',
                            msg.rol === 'user'
                              ? 'bg-[#202A49] text-white border border-blue-500/30'
                              : 'bg-muted/30 text-foreground border border-border/60'
                          )}
                        >
                          {msg.contenido}
                        </div>

                        {msg.propuestaAccion && (
                          <div className="w-full max-w-[94%] rounded-xl border-2 border-blue-500 bg-background p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-foreground">
                                {msg.propuestaAccion.tituloPropuesta}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {msg.propuestaAccion.estado}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {msg.propuestaAccion.justificacionEstrategica}
                            </p>
                            {msg.propuestaAccion.estado === 'pendiente_aprobacion' && (
                              <div className="flex items-center gap-1.5 pt-1">
                                <Input
                                  type="password"
                                  placeholder="PIN Maestro..."
                                  value={proposalAuthCodeMap[msg.propuestaAccion.id] || ''}
                                  onChange={(e) =>
                                    setProposalAuthCodeMap((prev) => ({
                                      ...prev,
                                      [msg.propuestaAccion!.id]: e.target.value,
                                    }))
                                  }
                                  className="h-8 text-xs"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveCeoProposal(msg.propuestaAccion!.id)}
                                  disabled={executingPropId === msg.propuestaAccion.id}
                                  className="btn-vatos-alfa h-8 px-3 text-xs font-bold shrink-0"
                                >
                                  Autorizar
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )
                ) : gerenciaMessages.length === 0 ? (
                  <div className="p-4 rounded-xl border border-border/60 bg-muted/15 text-xs space-y-2">
                    <p className="font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-[#C5A880]" />
                      <span>Hola Bety, soy Janet Gerencia</span>
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Estoy aquí para ayudarte con la operación de la sucursal sin que pierdas tiempo:
                    </p>
                    <ul className="space-y-1 text-[11px] text-muted-foreground list-disc pl-4">
                      <li>
                        <strong>Horarios de barberos:</strong> Dime <em>&quot;Bloquéale mañana a Lalo de 10:00 a 14:00&quot;</em> o <em>&quot;Habilita horario especial a Ivon&quot;</em>.
                      </li>
                      <li>
                        <strong>Soporte a recepción:</strong> Pídeme consultar cualquier venta o cita, o cancelar una reserva / eliminar una venta duplicada indicando el motivo.
                      </li>
                      <li>
                        <strong>Inventario e insumos:</strong> En la pestaña <strong>Insumos/Stock</strong> te recuerdo qué productos contar y qué insumos pedir.
                      </li>
                    </ul>
                  </div>
                ) : (
                  gerenciaMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex flex-col gap-1.5',
                        msg.rol === 'user' ? 'items-end' : 'items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap',
                          msg.rol === 'user'
                            ? 'bg-[#202A49] text-white border border-blue-500/30'
                            : 'bg-muted/30 text-foreground border border-border/60'
                        )}
                      >
                        {msg.contenido}
                      </div>

                      {/* TARJETA DE CONFIRMACIÓN OPERATIVA (CANCELAR CITA / ELIMINAR VENTA) */}
                      {msg.propuestaAccion && (
                        <div className="w-full max-w-[95%] rounded-xl border-2 border-blue-500 bg-background p-3 space-y-2 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {msg.propuestaAccion.tituloPropuesta}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {msg.propuestaAccion.estado === 'ejecutada'
                                ? 'Aplicada'
                                : msg.propuestaAccion.estado === 'rechazada'
                                ? 'Cancelada'
                                : 'Confirmar'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {msg.propuestaAccion.justificacionOperativa}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-[11px] p-2 rounded-lg bg-muted/20 border border-border/50">
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Actual:</span>
                              <span className="font-medium text-foreground">
                                {msg.propuestaAccion.resumenAntes}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Resultado:</span>
                              <span className="font-medium text-blue-400">
                                {msg.propuestaAccion.resumenDespues}
                              </span>
                            </div>
                          </div>

                          {msg.propuestaAccion.estado === 'pendiente_aprobacion' && (
                            <div className="space-y-2 pt-1">
                              {msg.propuestaAccion.tipoAccion === 'eliminar_venta' && (
                                <Input
                                  type="password"
                                  placeholder="Código de autorización (ej. 1234)..."
                                  value={proposalAuthCodeMap[msg.propuestaAccion.id] || ''}
                                  onChange={(e) =>
                                    setProposalAuthCodeMap((prev) => ({
                                      ...prev,
                                      [msg.propuestaAccion!.id]: e.target.value,
                                    }))
                                  }
                                  className="h-8 text-xs"
                                />
                              )}
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleRejectGerenciaProposal(msg.propuestaAccion!.id)
                                  }
                                  disabled={executingPropId === msg.propuestaAccion.id}
                                  className="h-8 text-xs rounded-lg"
                                >
                                  Descartar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleApproveGerenciaProposal(
                                      msg.propuestaAccion!.id,
                                      msg.propuestaAccion!.tipoAccion
                                    )
                                  }
                                  disabled={executingPropId === msg.propuestaAccion.id}
                                  className="btn-vatos-alfa h-8 px-3 text-xs font-bold rounded-lg"
                                >
                                  {executingPropId === msg.propuestaAccion.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    'Confirmar y Aplicar'
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {(gerenciaSending || ceoSending) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#C5A880]" />
                    <span>Janet está procesando la solicitud...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Barra de Entrada de Mensaje */}
              <div className="p-2.5 border-t border-border/60 bg-background flex items-center gap-2 shrink-0">
                <Input
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder={
                    activeAgentMode === 'ceo' && isGeneralOwner
                      ? 'Escribe una orden para Janet CEO...'
                      : 'Pídele a Janet bloquear un horario, revisar una venta o cita...'
                  }
                  className="h-9 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => handleSend()}
                  disabled={(gerenciaSending || ceoSending) || !inputPrompt.trim()}
                  className="btn-vatos-alfa h-9 px-3 rounded-xl font-bold shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
