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
  MoreVertical,
  BarChart3,
  Scissors,
  CalendarCheck,
  PackageSearch,
  ClipboardList,
  ShieldAlert,
  ArrowRightLeft,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

  // Posición arrastrable del botón circular con persistencia en localStorage
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  } | null>(null);

  // Modo de agente (CEO para Dueño, Gerencia para Beatriz) y pestaña activa
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

  // Estado de Janet CEO
  const [ceoLoading, setCeoLoading] = useState(false);
  const [ceoSending, setCeoSending] = useState(false);
  const [ceoSessionId, setCeoSessionId] = useState('');
  const [ceoMessages, setCeoMessages] = useState<FloatingCeoMessage[]>([]);

  // Inputs y autorización
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

  // Inicializar posición arrastrable
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('janet_floating_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          const x = Math.min(Math.max(12, parsed.x), window.innerWidth - 76);
          const y = Math.min(Math.max(12, parsed.y), window.innerHeight - 76);
          setBtnPos({ x, y });
          return;
        }
      }
    } catch (_) {}

    // Posición inicial: costado inferior derecho
    const defaultX = Math.max(12, window.innerWidth - 78);
    const defaultY = Math.max(12, window.innerHeight - 155);
    setBtnPos({ x: defaultX, y: defaultY });
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const curX = btnPos?.x ?? (window.innerWidth - 78);
    const curY = btnPos?.y ?? (window.innerHeight - 155);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: curX,
      origY: curY,
      hasMoved: false,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 5) {
      dragRef.current.hasMoved = true;
    }
    if (dragRef.current.hasMoved) {
      const newX = Math.min(Math.max(12, dragRef.current.origX + dx), window.innerWidth - 72);
      const newY = Math.min(Math.max(12, dragRef.current.origY + dy), window.innerHeight - 72);
      setBtnPos({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const wasMoved = dragRef.current.hasMoved;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (btnPos && wasMoved) {
      try {
        localStorage.setItem('janet_floating_pos', JSON.stringify(btnPos));
      } catch (_) {}
    }
    dragRef.current = null;

    if (!wasMoved) {
      setIsOpen(true);
    }
  };

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
        setActiveTab('chat');
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
          modelChoice: 'pro',
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

    // Modo Janet Gerencia
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
      {/* =========================================================================
          BOTÓN FLOTANTE CIRCULAR ARRASTRABLE (IDÉNTICO A LA APP MÓVIL)
          - Video animado en bucle con fallback a imagen
          - Luz láser continua girando sobre el contorno exacto (idéntico al botón "+" inferior)
          - Doble efecto oficial: láser perimetral continuo + haz de luz oblicuo
          - Sin letreros ni globitos (limpio 100%)
          - Arrastre táctil y ratón para no estorbar en ninguna sección
          ========================================================================= */}
      {!isOpen && btnPos && (
        <div
          style={{
            left: `${btnPos.x}px`,
            top: `${btnPos.y}px`,
            touchAction: 'none',
          }}
          className="fixed z-50 select-none animate-in fade-in zoom-in-90 duration-300"
        >
          {/* Aura azul eléctrica sutil de respiración */}
          <div className="absolute inset-[-6px] rounded-full bg-blue-600/25 blur-sm animate-pulse pointer-events-none" />

          {/* Botón interactivo con el efecto de luz láser oficial Vatos Alfa */}
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="btn-vatos-alfa relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[1.5px] border-none overflow-hidden inline-flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_14px_rgba(59,130,246,0.35)] hover:scale-105 active:scale-95 transition-transform cursor-grab active:cursor-grabbing outline-none select-none z-10"
            title={
              isGeneralOwner
                ? 'Janet CEO · Arrastra para mover o toca para abrir'
                : 'Janet Gerencia · Arrastra para mover o toca para abrir'
            }
          >
            {/* 1. Haz de luz láser que recorre el contorno exterior exacto (idéntico a Button alfa y botón +) */}
            <span
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none animate-conic-laser z-0"
              aria-hidden="true"
            />

            {/* 2. Cuerpo interior del botón (degradado navy profundo) */}
            <span className="relative z-[1] inline-flex items-center justify-center w-full h-full text-white overflow-hidden select-none pointer-events-none rounded-full bg-gradient-to-b from-[#18223c] to-[#0d1424]">
              {/* 3. Haz de luz oblicuo que viaja periódicamente de izquierda a derecha */}
              <span
                className="absolute inset-0 w-1/2 h-full -skew-x-20 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-btn-light-sweep pointer-events-none z-[2]"
                aria-hidden="true"
              />

              {/* 4. Avatar de Janet en video en bucle sin letreros ni globitos */}
              <span className="relative z-10 w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-slate-950">
                <video
                  src="/janet-avatar.mp4"
                  poster="/janet-avatar.png"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover select-none pointer-events-none"
                  draggable={false}
                />
              </span>
            </span>
          </button>
        </div>
      )}

      {/* =========================================================================
          PANEL DE JANET: PANTALLA COMPLETA EN CELULAR Y TABLET, FLOTANTE EN DESKTOP
          ========================================================================= */}
      {isOpen && (
        <div
          className={cn(
            'fixed z-[100] bg-background flex flex-col transition-all duration-200 overflow-hidden',
            // En móvil o si está expandido: 100% Pantalla Completa
            isExpanded
              ? 'inset-0 w-full h-[100dvh] rounded-none border-none'
              : 'inset-0 w-full h-[100dvh] rounded-none sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[470px] sm:h-[690px] sm:max-h-[90vh] sm:rounded-2xl sm:border-2 sm:border-blue-500 sm:shadow-[0_20px_50px_rgba(32,42,73,0.55)]'
          )}
        >
          {/* CABECERA OFICIAL VATOS ALFA LIMPIA */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-3.5 py-3 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full gap-2">
              {/* Avatar en video + Título */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-8 h-8 rounded-full overflow-hidden p-[1.5px] bg-gradient-to-tr from-blue-500 to-[#C5A880] shrink-0">
                  <video
                    src="/janet-avatar.mp4"
                    poster="/janet-avatar.png"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full rounded-full object-cover select-none pointer-events-none"
                    draggable={false}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                      {activeAgentMode === 'ceo' && isGeneralOwner
                        ? 'Janet CEO'
                        : 'Janet Gerencia'}
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[9px] border-[#C5A880]/50 text-[#C5A880] bg-[#162038]/80 px-1.5 py-0 font-sans"
                    >
                      {activeAgentMode === 'ceo' && isGeneralOwner ? 'Dirección' : 'Sucursal'}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-slate-300 truncate">
                    {activeAgentMode === 'ceo' && isGeneralOwner
                      ? 'Estado de Resultados, Auditoría Forense y Estrategia'
                      : 'Horarios de Barberos, Citas, Ventas e Inventario'}
                  </p>
                </div>
              </div>

              {/* Controles de Cabecera: Pestañas + Menú de 3 Puntos + Cerrar */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Selector rápido Chat vs Insumos */}
                <div className="flex items-center bg-black/25 rounded-lg p-0.5 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveTab('chat')}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-semibold transition-colors',
                      activeTab === 'chat'
                        ? 'bg-[#202A49] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('recordatorios')}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center gap-1',
                      activeTab === 'recordatorios'
                        ? 'bg-[#202A49] text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    )}
                  >
                    <Bell className="h-2.5 w-2.5 text-[#C5A880]" />
                    <span>Insumos</span>
                    {pendingBadgeCount > 0 && (
                      <span className="text-[10px] text-[#C5A880] font-sans font-bold">
                        ({pendingBadgeCount})
                      </span>
                    )}
                  </button>
                </div>

                {/* MENÚ DE TRES PUNTITOS (AGRUPA TODAS LAS OPCIONES LIMPIAMENTE) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                      title="Opciones y comandos rápidos"
                      aria-label="Más opciones"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64 bg-[#10172b] border-2 border-blue-500 text-white rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.22)] p-1.5 z-[110]"
                  >
                    {/* Cambio de Modo (Exclusivo Dueño) */}
                    {isGeneralOwner && (
                      <>
                        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                          Modo de Asistente
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setActiveAgentMode('ceo');
                            setActiveTab('chat');
                          }}
                          className={cn(
                            'rounded-lg text-xs font-semibold cursor-pointer',
                            activeAgentMode === 'ceo' && 'bg-blue-600/30 text-[#C5A880]'
                          )}
                        >
                          <Sparkles className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                          <span>Modo Janet CEO (Dirección)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setActiveAgentMode('gerencia');
                            setActiveTab('chat');
                          }}
                          className={cn(
                            'rounded-lg text-xs font-semibold cursor-pointer',
                            activeAgentMode === 'gerencia' && 'bg-blue-600/30 text-blue-300'
                          )}
                        >
                          <ArrowRightLeft className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Modo Janet Gerencia (Bety)</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-800" />
                        <DropdownMenuItem asChild className="rounded-lg text-xs font-semibold cursor-pointer">
                          <Link href="/ceo" onClick={() => setIsOpen(false)}>
                            <ExternalLink className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                            <span>Abrir Sala Ejecutiva Completa (/ceo)</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-800" />
                      </>
                    )}

                    {/* Acciones Rápidas en Lista Ordenada */}
                    <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                      Acciones Rápidas
                    </DropdownMenuLabel>

                    {activeAgentMode === 'ceo' && isGeneralOwner ? (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Dame el Estado de Resultados (P&L) de este mes hasta hoy con mi utilidad neta real y el reparto de gerencia.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <BarChart3 className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                          <span>Consultar Estado de Resultados</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Haz una auditoría forense de los últimos 14 días: ventas eliminadas, uso del código 1234 y cortes de caja.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <ShieldAlert className="mr-2 h-3.5 w-3.5 text-red-400" />
                          <span>Auditoría Forense Anti-Robo</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Envía una consigna a Janet Gerencia para recordar a Beatriz hacer inventario físico de productos y revisar insumos de barbería.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <ClipboardList className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Recordar Inventario a Bety</span>
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              '¿Cómo vamos hoy en la sucursal? Dime el resumen de citas del día, cuáles faltan por confirmar y las ventas cobradas hoy.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <ClipboardList className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Resumen del Día de Sucursal</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setInputPrompt(
                              'Bloquéale el horario a [Nombre del barbero] mañana de 10:00 a 14:00 por motivo de '
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <Scissors className="mr-2 h-3.5 w-3.5 text-slate-300" />
                          <span>Cerrar Horario de Barbero</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setInputPrompt(
                              'Habilítale un horario especial a [Nombre del barbero] el día [YYYY-MM-DD] de 10:00 a 15:00'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <CalendarCheck className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                          <span>Habilitar Horario Especial</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Revisa el inventario de productos y mis recordatorios pendientes de insumos para decirme qué hace falta pedir o contar.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <PackageSearch className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Checar Stock e Insumos</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Maximizar / Minimizar en Desktop */}
                <button
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="hidden sm:flex h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 items-center justify-center transition-colors"
                  title={isExpanded ? 'Contraer ventana' : 'Ampliar a pantalla completa'}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Botón Cerrar */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                  title="Cerrar asistente"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* =====================================================================
              CUERPO DEL ASISTENTE: PESTAÑA INSUMOS / RECORDATORIOS
              ===================================================================== */}
          {activeTab === 'recordatorios' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Formulario rápido para agregar recordatorio */}
              <div className="p-3 rounded-xl border border-border/60 bg-muted/15 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    {isGeneralOwner
                      ? 'Dejar consigna para Beatriz'
                      : 'Nuevo recordatorio operativo'}
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

              {/* Lista de recordatorios de sucursal */}
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
                    Todo al día. No hay recordatorios pendientes.
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
                            className="text-[9px] px-1.5 py-0 border-border/60 text-muted-foreground uppercase"
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
                        className="h-7 px-2.5 rounded-lg border border-border/60 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-blue-500 flex items-center gap-1 shrink-0 transition-colors"
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
            /* =====================================================================
               CUERPO DEL ASISTENTE: PESTAÑA CHAT (LIMPIO Y AMPLIO)
               ===================================================================== */
            <>
              {/* Historial de Mensajes */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {activeAgentMode === 'ceo' && isGeneralOwner ? (
                  ceoMessages.length === 0 ? (
                    <div className="p-4 rounded-xl border border-border/60 bg-muted/15 text-xs space-y-2">
                      <p className="font-bold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-[#C5A880]" />
                        <span>Janet CEO a tu servicio</span>
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        Pregúntame sobre el Estado de Resultados, pídemelo auditar cualquier movimiento de recepción o envíale consignas operativas a Beatriz. Usa el menú de 3 puntitos para comandos rápidos.
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
                      Tu copiloto operativo de sucursal. Pídeme gestionar horarios de barberos, consultar o cancelar citas y ventas, o toca el menú de 3 puntitos para acciones rápidas.
                    </p>
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

                      {/* Tarjeta de Confirmación Operativa */}
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
              <div className="p-3 border-t border-border/60 bg-background flex items-center gap-2 shrink-0">
                <Input
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder={
                    activeAgentMode === 'ceo' && isGeneralOwner
                      ? 'Escribe una orden para Janet CEO...'
                      : 'Escribe tu solicitud a Janet...'
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
                  className="btn-vatos-alfa h-9 px-3.5 rounded-xl font-bold shrink-0"
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
