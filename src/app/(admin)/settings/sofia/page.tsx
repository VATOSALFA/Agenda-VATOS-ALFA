'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/firebase-auth-context';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Bot,
  Sparkles,
  Calendar,
  CreditCard,
  AlertTriangle,
  Save,
  RefreshCw,
  HelpCircle,
  ShieldAlert,
  SlidersHorizontal,
  Bell,
  Check,
  XCircle,
  Tag,
  MapPin,
  ExternalLink,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  Building,
  Crown,
  Users,
  ShieldCheck,
  Briefcase,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface SofiaSettings {
  // 1. Janeth Clientes (App Móvil, Web y WhatsApp)
  assistantName: string;
  assistantRole: string;
  tone: 'calido_profesional' | 'casual_barbershop' | 'formal_ejecutivo';
  customInstructions: string;

  minReservationBuffer: number;
  maxDaysInFuture: number;
  autoCreateAppointments: boolean;

  requireDeposit: boolean;
  depositMinAmount: number;
  depositPercentage: number;
  bankName: string;
  bankAccountHolder: string;
  bankClabe: string;
  depositInstructions: string;

  botActive: boolean;
  responseSchedule: '24_7' | 'horario_comercial';
  takeoverKeywords: string;

  punctualityToleranceMinutes: number;
  minChildAge: number;
  addressReferences: string;

  // Recordatorios y Confirmaciones Automáticas en Chat
  autoChatReminders?: boolean;
  chatReminderMinutesBefore?: number;
  chatReminderTemplate?: string;
  chatConfirmationTemplate?: string;
  chatButtonConfirmText?: string;
  chatButtonRescheduleText?: string;
  chatButtonCancelText?: string;

  // 2. Janeth Administradora (Copiloto Operativo de Sucursal — Beatriz)
  gerenciaActive?: boolean;
  gerenciaName?: string;
  gerenciaRole?: string;
  gerenciaCustomInstructions?: string;
  gerenciaAllowAgenda?: boolean;
  gerenciaAllowAuthCodes?: boolean;
  gerenciaAllowClients?: boolean;
  gerenciaAllowSchedules?: boolean;
  gerenciaAllowInventory?: boolean;
  gerenciaAllowServicesAndCash?: boolean;

  // 3. Janeth CEO (Dirección General, Finanzas CFO y Auditoría Forense)
  ceoActive?: boolean;
  ceoName?: string;
  ceoRole?: string;
  ceoCustomInstructions?: string;
  ceoAllowFinancials?: boolean;
  ceoAllowSimulator?: boolean;
  ceoAllowForensicAudit?: boolean;
  ceoAllowClientVoice?: boolean;
  ceoAllowFullBranchControl?: boolean;
}

const defaultSofiaSettings: SofiaSettings = {
  // Janeth Clientes
  assistantName: 'Janeth',
  assistantRole: 'Recepcionista Humana de Barbería',
  tone: 'calido_profesional',
  customInstructions:
    'Ofrece siempre una experiencia de bienvenida cálida. Recuerda a los clientes que contamos con cajones de estacionamiento al frente y que si traen niños atendemos desde los 3 años. Limita la información estrictamente a las citas, servicios, horarios y saldo de lealtad del propio cliente.',
  minReservationBuffer: 30,
  maxDaysInFuture: 14,
  autoCreateAppointments: true,
  requireDeposit: true,
  depositMinAmount: 190,
  depositPercentage: 50,
  bankName: 'Mercado Pago',
  bankAccountHolder: 'VATOS ALFA Barber Shop',
  bankClabe: '',
  depositInstructions:
    'Puedes pagar con tarjeta o por transferencia SPEI directa dentro del enlace de Mercado Pago con confirmación automática instantánea.',
  botActive: true,
  responseSchedule: '24_7',
  takeoverKeywords:
    'humano, humana, persona, recepcionista, recepcion, gerente, queja, hablar con alguien, asesor, operador, atencion humana, persona real',
  punctualityToleranceMinutes: 5,
  minChildAge: 3,
  addressReferences:
    'Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro. Contamos con cajones de estacionamiento al frente.',

  autoChatReminders: true,
  chatReminderMinutesBefore: 120,
  chatReminderTemplate:
    '¡Hola *{nombre}*, te recordamos tu cita en Vatos Alfa! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n✂️ *Servicio(s):* {servicios}\n📍 *Ubicación:* {ubicacion}\n\nPor favor confirma tu asistencia presionando una opción abajo:',
  chatConfirmationTemplate:
    '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n✂️ *Servicio(s):* {servicios}\n📍 *Ubicación:* {ubicacion}\n\nTe esperamos 5 minutos antes. ¡Muchas gracias por tu preferencia en Vatos Alfa!\n\n📄 [Términos y Condiciones](/terminos) • [Aviso de Privacidad](/privacidad)',
  chatButtonConfirmText: 'Confirmar Asistencia',
  chatButtonRescheduleText: 'Reagendar',
  chatButtonCancelText: 'Cancelar',

  // Janeth Administradora
  gerenciaActive: true,
  gerenciaName: 'Janeth Administradora',
  gerenciaRole: 'Copiloto Operativo de Administración de Sucursal',
  gerenciaCustomInstructions:
    'Interactúas directamente con Beatriz Elizarraga Casas (Administradora del Local). Tienes plenas facultades operativas equivalentes a su perfil: agendar y editar citas, generar códigos temporales de 4 dígitos para exentar anticipos, gestionar horarios de barberos, consultar clientes por teléfono o nombre, actualizar stock de inventario y consultar arqueos de caja e indicadores de barberos en modo lectura. No tienes acceso al Estado de Resultados privado del dueño ni a declaraciones fiscales.',
  gerenciaAllowAgenda: true,
  gerenciaAllowAuthCodes: true,
  gerenciaAllowClients: true,
  gerenciaAllowSchedules: true,
  gerenciaAllowInventory: true,
  gerenciaAllowServicesAndCash: true,

  // Janeth CEO
  ceoActive: true,
  ceoName: 'Janeth CEO',
  ceoRole: 'Directora General Adjunta (CEO), CFO y Auditora Forense',
  ceoCustomInstructions:
    'Hablas única y exclusivamente con el dueño y Administrador General de VATOS ALFA. Tienes plenos poderes ejecutivos y operativos: Estado de Resultados (P&L) real, cálculo de impuestos RESICO, simulador financiero, auditoría forense anti-robo (ventas eliminadas, uso de códigos y cortes de caja), análisis de voz del cliente y control absoluto de la sucursal, agenda, clientes e inventario.',
  ceoAllowFinancials: true,
  ceoAllowSimulator: true,
  ceoAllowForensicAudit: true,
  ceoAllowClientVoice: true,
  ceoAllowFullBranchControl: true,
};

function FormattedPreviewText({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <div className="space-y-1 leading-relaxed text-slate-200">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1.5" />;

        const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        const renderSubText = (str: string, keyPrefix: string) => {
          const boldRegex = /(\*\*([^*]+?)\*\*|\*([^*\s][^*]*?[^*\s]|[^*])\*)/g;
          const subNodes: React.ReactNode[] = [];
          let lastFmt = 0;
          let fmtMatch: RegExpExecArray | null;

          const renderWithPin = (t: string, k: string) => {
            if (!t.includes('📍')) return t;
            return t.split(/(📍)/g).map((p, i) =>
              p === '📍' ? (
                <MapPin
                  key={`${k}-p-${i}`}
                  className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20 inline shrink-0 mr-1 align-[-2px]"
                />
              ) : (
                p
              )
            );
          };

          while ((fmtMatch = boldRegex.exec(str)) !== null) {
            if (fmtMatch.index > lastFmt) {
              subNodes.push(renderWithPin(str.substring(lastFmt, fmtMatch.index), `${keyPrefix}-t-${lastFmt}`));
            }
            const b = fmtMatch[2] || fmtMatch[3];
            subNodes.push(
              <strong key={`${keyPrefix}-b-${fmtMatch.index}`} className="font-bold text-inherit">
                {renderWithPin(b, `${keyPrefix}-b-${fmtMatch.index}`)}
              </strong>
            );
            lastFmt = boldRegex.lastIndex;
          }
          if (lastFmt < str.length) {
            subNodes.push(renderWithPin(str.substring(lastFmt), `${keyPrefix}-end`));
          }
          return subNodes;
        };

        while ((match = linkRegex.exec(trimmed)) !== null) {
          if (match.index > lastIndex) {
            parts.push(...renderSubText(trimmed.substring(lastIndex, match.index), `txt-${idx}-${lastIndex}`));
          }
          const label = match[1];
          const url = match[2];
          parts.push(
            <a
              key={`link-${idx}-${match.index}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-2 break-all transition-colors cursor-pointer group"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{label}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-80 inline shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </a>
          );
          lastIndex = linkRegex.lastIndex;
        }

        if (lastIndex < trimmed.length) {
          parts.push(...renderSubText(trimmed.substring(lastIndex), `txt-${idx}-${lastIndex}`));
        }

        return <div key={idx} className="break-words">{parts}</div>;
      })}
    </div>
  );
}

const TONE_LABELS: Record<string, string> = {
  calido_profesional: 'Cálido y Profesional',
  casual_barbershop: 'Casual y Cercano',
  formal_ejecutivo: 'Formal y Directo',
};

type AssistantTab = 'clientes' | 'administradora' | 'ceo';
type ClientSubTab = 'identidad' | 'operacion' | 'anticipos' | 'recordatorios';
type EditableTextField =
  | 'customInstructions'
  | 'chatReminderTemplate'
  | 'chatConfirmationTemplate'
  | 'addressReferences'
  | 'gerenciaCustomInstructions'
  | 'ceoCustomInstructions';

function SofiaSettingsContent() {
  const { db } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');

  // Soporta las 3 pestañas principales y mantiene compatibilidad si un enlace antiguo apunta a sub-pestañas
  const resolveAssistantTab = (param: string | null): AssistantTab => {
    if (param === 'administradora') return 'administradora';
    if (param === 'ceo') return 'ceo';
    return 'clientes';
  };

  const resolveClientSubTab = (param: string | null): ClientSubTab => {
    if (param === 'operacion' || param === 'anticipos' || param === 'recordatorios') {
      return param;
    }
    return 'identidad';
  };

  const [assistantTab, setAssistantTab] = useState<AssistantTab>(() => resolveAssistantTab(tabParam));
  const [clientSubTab, setClientSubTab] = useState<ClientSubTab>(() => resolveClientSubTab(tabParam));

  useEffect(() => {
    setAssistantTab(resolveAssistantTab(tabParam));
    if (tabParam === 'identidad' || tabParam === 'operacion' || tabParam === 'anticipos' || tabParam === 'recordatorios') {
      setClientSubTab(tabParam);
    }
  }, [tabParam]);

  const handleAssistantTabChange = (nextTab: AssistantTab) => {
    setAssistantTab(nextTab);
    router.replace(`/settings/sofia?tab=${nextTab}`, { scroll: false });
  };

  const [settings, setSettings] = useState<SofiaSettings>(defaultSofiaSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isToneOpen, setIsToneOpen] = useState<boolean>(false);

  const [editorModal, setEditorModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    field: EditableTextField;
    value: string;
    supportsTags?: boolean;
  }>({
    open: false,
    title: '',
    description: '',
    field: 'customInstructions',
    value: '',
    supportsTags: false,
  });

  const openEditorModal = (
    title: string,
    description: string,
    field: EditableTextField,
    supportsTags: boolean = false
  ) => {
    setEditorModal({
      open: true,
      title,
      description,
      field,
      value: (settings[field] as string) || '',
      supportsTags,
    });
  };

  // Secciones colapsables de Janeth Clientes
  const [isAgendamientoOpen, setIsAgendamientoOpen] = useState<boolean>(false);
  const [isModoOperacionOpen, setIsModoOperacionOpen] = useState<boolean>(false);
  const [isAnticiposOpen, setIsAnticiposOpen] = useState<boolean>(false);
  const [isFaqsOpen, setIsFaqsOpen] = useState<boolean>(false);
  const [isRecordatoriosAutoOpen, setIsRecordatoriosAutoOpen] = useState<boolean>(false);
  const [isBotonesInteractivosOpen, setIsBotonesInteractivosOpen] = useState<boolean>(false);
  const [isPlantillaConfirmacionOpen, setIsPlantillaConfirmacionOpen] = useState<boolean>(false);

  // Secciones colapsables de Janeth Administradora y Janeth CEO
  const [isGerenciaPermisosOpen, setIsGerenciaPermisosOpen] = useState<boolean>(false);
  const [isCeoSubagentesOpen, setIsCeoSubagentesOpen] = useState<boolean>(false);

  useEffect(() => {
    async function loadSettings() {
      if (!db) return;
      try {
        const docRef = doc(db, 'settings', 'sofia');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setSettings({
            ...defaultSofiaSettings,
            ...data,
            assistantName: data?.assistantName && data.assistantName !== 'Janet' ? data.assistantName : 'Janeth',
            gerenciaActive: data?.gerenciaActive ?? true,
            ceoActive: data?.ceoActive ?? true,
          });
        }
      } catch (err) {
        console.error('Error al cargar configuración del Asistente:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [db]);

  const handleSave = async (e?: React.FormEvent, customData?: SofiaSettings) => {
    if (e) e.preventDefault();
    if (!db) return;

    const dataToSave = customData || settings;
    setIsSaving(true);
    try {
      const docRef = doc(db, 'settings', 'sofia');
      await setDoc(docRef, dataToSave, { merge: true });

      toast({
        title: '¡Configuración Guardada!',
        description: 'Los cambios de las asistentes Janeth se aplicaron en tiempo real.',
      });
    } catch (error: any) {
      console.error('Error al guardar configuración del asistente:', error);
      toast({
        title: 'Error al guardar',
        description: error.message || 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = <K extends keyof SofiaSettings>(key: K, value: SofiaSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleQuickToggleActive = async (
    field: 'botActive' | 'gerenciaActive' | 'ceoActive',
    val: boolean,
    label: string
  ) => {
    const updated = { ...settings, [field]: val };
    setSettings(updated);
    if (!db) return;
    try {
      await setDoc(doc(db, 'settings', 'sofia'), { [field]: val }, { merge: true });
      toast({
        title: val ? `${label} Activada` : `${label} en Pausa`,
        description: val
          ? `${label} está operando normalmente en producción.`
          : `${label} ha sido pausada temporalmente mientras realizas ajustes.`,
      });
    } catch (err: any) {
      console.error('Error al cambiar estado de asistente:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2.5 text-muted-foreground">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-xs font-medium">Cargando configuración de Asistente Janeth...</span>
      </div>
    );
  }

  const currentHeaderInfo = {
    clientes: {
      title: 'JANETH CLIENTES',
      subtitle: 'Atención en App Móvil, Sitio Web y WhatsApp (exclusivo información del propio cliente)',
      active: settings.botActive ?? true,
      toggleField: 'botActive' as const,
      label: 'Janeth Clientes',
    },
    administradora: {
      title: 'JANETH ADMINISTRADORA',
      subtitle: 'Copiloto operativo de sucursal para Beatriz Elizarraga Casas (Administración Local)',
      active: settings.gerenciaActive ?? true,
      toggleField: 'gerenciaActive' as const,
      label: 'Janeth Administradora',
    },
    ceo: {
      title: 'JANETH CEO',
      subtitle: 'Dirección General, CFO Finanzas, Simulador y Auditoría Forense (Acceso Total)',
      active: settings.ceoActive ?? true,
      toggleField: 'ceoActive' as const,
      label: 'Janeth CEO',
    },
  }[assistantTab];

  return (
    <div className="flex-1 space-y-4 max-w-5xl pb-6">
      {/* Selector Superior de las 3 Janeth + Estado Independiente */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {[
          {
            id: 'clientes' as AssistantTab,
            name: 'Janeth Clientes',
            scope: 'App, Web y WhatsApp',
            icon: Users,
            isActive: settings.botActive ?? true,
            toggleField: 'botActive' as const,
          },
          {
            id: 'administradora' as AssistantTab,
            name: 'Janeth Administradora',
            scope: 'Sucursal (Beatriz)',
            icon: Briefcase,
            isActive: settings.gerenciaActive ?? true,
            toggleField: 'gerenciaActive' as const,
          },
          {
            id: 'ceo' as AssistantTab,
            name: 'Janeth CEO',
            scope: 'Dirección General',
            icon: Crown,
            isActive: settings.ceoActive ?? true,
            toggleField: 'ceoActive' as const,
          },
        ].map((item) => {
          const IconComponent = item.icon;
          const isSelected = assistantTab === item.id;
          return (
            <div
              key={item.id}
              onClick={() => handleAssistantTabChange(item.id)}
              className={cn(
                'p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-2.5',
                isSelected
                  ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-xs'
                  : 'border-border/60 bg-card hover:border-slate-400 hover:bg-muted/20'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <IconComponent
                  className={cn(
                    'h-4 w-4 shrink-0',
                    item.id === 'ceo'
                      ? 'text-[#C5A880]'
                      : isSelected
                        ? 'text-blue-400'
                        : 'text-slate-400'
                  )}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground truncate">{item.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{item.scope}</div>
                </div>
              </div>

              <div
                className="flex items-center gap-1.5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-sans font-medium py-0 px-1.5 rounded-full',
                    item.isActive
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  )}
                >
                  {item.isActive ? 'Activa' : 'Pausada'}
                </Badge>
                <Switch
                  checked={item.isActive}
                  onCheckedChange={(val) => handleQuickToggleActive(item.toggleField, val, item.name)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Cabecera Dinámica de la Asistente Seleccionada */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-border/60">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">
              {currentHeaderInfo.title}
            </h2>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-sans font-medium py-0 px-2 rounded-full',
                currentHeaderInfo.active
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-red-500/10 text-red-400 border-red-500/30'
              )}
            >
              {currentHeaderInfo.active ? '● En Línea' : '○ En Pausa por Mantenimiento'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {currentHeaderInfo.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          {assistantTab === 'ceo' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="h-8 px-3 text-xs font-semibold rounded-lg border-blue-500/40 text-blue-400 hover:bg-[#202A49] hover:text-white transition-colors"
            >
              <Link href="/ceo">
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-[#C5A880]" />
                Abrir Consola Ejecutiva
                <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* =========================================================
            SECCIÓN 1: JANETH CLIENTES (APP, WEB Y WHATSAPP)
           ========================================================= */}
        {assistantTab === 'clientes' && (
          <div className="space-y-4">
            {/* Sub-navegación interna de Janeth Clientes */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-muted/20 border border-border/60 w-fit">
              {[
                { id: 'identidad' as ClientSubTab, label: 'Identidad', icon: Sparkles },
                { id: 'operacion' as ClientSubTab, label: 'Operación', icon: SlidersHorizontal },
                { id: 'anticipos' as ClientSubTab, label: 'Anticipos & FAQs', icon: CreditCard },
                { id: 'recordatorios' as ClientSubTab, label: 'Recordatorios & Avisos', icon: Bell },
              ].map((sub) => {
                const SubIcon = sub.icon;
                const active = clientSubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setClientSubTab(sub.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                      active
                        ? 'bg-[#202A49] text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}
                  >
                    <SubIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>

            <Tabs value={clientSubTab} onValueChange={(v) => setClientSubTab(v as ClientSubTab)} className="w-full space-y-4">
              {/* SUB-TAB 1: IDENTIDAD */}
              <TabsContent value="identidad" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardContent className="p-3.5 sm:p-5 space-y-4">
                    {/* Interruptor de Encendido / Pausa Independiente */}
                    <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/10 flex items-center justify-between gap-4">
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-semibold text-foreground block">
                          Estado de Janeth Clientes (App Móvil, Web y WhatsApp)
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          Si necesitas hacer mantenimiento o actualizar reglas, puedes pausarla temporalmente sin afectar a Janeth Administradora ni a Janeth CEO.
                        </p>
                      </div>
                      <Switch
                        checked={settings.botActive}
                        onCheckedChange={(val) => handleQuickToggleActive('botActive', val, 'Janeth Clientes')}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">
                          Nombre de la Asistente
                        </label>
                        <Input
                          value={settings.assistantName}
                          onChange={(e) => handleChange('assistantName', e.target.value)}
                          placeholder="Ej. Janeth"
                          className="h-8 text-xs sm:text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Nombre con el que se presenta ante los clientes en la App, Web y WhatsApp.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">
                          Rol / Título Público
                        </label>
                        <Input
                          value={settings.assistantRole}
                          onChange={(e) => handleChange('assistantRole', e.target.value)}
                          placeholder="Ej. Recepcionista Humana de Barbería"
                          className="h-8 text-xs sm:text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Define su función de recepción y hospitalidad ante el cliente.
                        </p>
                      </div>
                    </div>

                    {/* Tono de Comunicación (Minimizable) */}
                    <div className="rounded-xl border border-border/70 overflow-hidden bg-card">
                      <div
                        onClick={() => setIsToneOpen((prev) => !prev)}
                        className="py-2.5 px-3.5 sm:px-4 flex items-center justify-between cursor-pointer hover:bg-muted/10 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">Tono de Comunicación</span>
                          <Badge variant="outline" className="text-[10px] py-0 px-2 font-medium text-blue-400 border-blue-500/40 bg-blue-500/10">
                            {TONE_LABELS[settings.tone] || 'Cálido y Profesional'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="text-[11px] font-medium hidden sm:inline">
                            {isToneOpen ? 'Minimizar' : 'Expandir'}
                          </span>
                          {isToneOpen ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {isToneOpen && (
                        <div className="p-3 sm:p-4 pt-1 border-t border-border/50 bg-muted/5 space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {[
                              {
                                id: 'calido_profesional',
                                title: 'Cálido y Profesional',
                                desc: 'Atenta, empática y educada. Ideal para dar confianza y un trato impecable.',
                                badge: 'Recomendado',
                              },
                              {
                                id: 'casual_barbershop',
                                title: 'Casual y Cercano',
                                desc: 'Estilo camaradería ("entre compas"), urbano y relajado con la vibra del club.',
                              },
                              {
                                id: 'formal_ejecutivo',
                                title: 'Formal y Directo',
                                desc: 'Sobrio, conciso y formal. Enfocado en resolver preguntas con rapidez.',
                              },
                            ].map((toneOpt) => {
                              const isSelected = settings.tone === toneOpt.id;
                              return (
                                <div
                                  key={toneOpt.id}
                                  onClick={() => handleChange('tone', toneOpt.id as any)}
                                  className={cn(
                                    'p-3 rounded-xl border-2 cursor-pointer transition-all space-y-1',
                                    isSelected
                                      ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-xs'
                                      : 'border-border/60 hover:border-slate-400 bg-card hover:bg-muted/30'
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-xs text-foreground">
                                      {toneOpt.title}
                                    </span>
                                    {toneOpt.badge && (
                                      <Badge variant="outline" className="text-[10px] py-0 px-1 font-medium bg-background border-border/60">
                                        {toneOpt.badge}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground leading-tight">
                                    {toneOpt.desc}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Master Prompt Row */}
                    <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-border/70 bg-muted/15 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-foreground">Master Prompt (Clientes)</span>
                        {settings.customInstructions && (
                          <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                            ({settings.customInstructions.length} caracteres)
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openEditorModal(
                            `Master Prompt de ${settings.assistantName || 'Janeth'} (Clientes)`,
                            'Instrucciones y límites de privacidad para la atención a clientes en App Móvil, Web y WhatsApp.',
                            'customInstructions'
                          )
                        }
                        className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                      >
                        Editar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* SUB-TAB 2: OPERACIÓN */}
              <TabsContent value="operacion" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                {/* Reglas de Agendamiento (Minimizable) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardHeader
                    className={cn(
                      'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                      isAgendamientoOpen && 'border-b border-border/50'
                    )}
                    onClick={() => setIsAgendamientoOpen((prev) => !prev)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          Reglas de Agendamiento para Clientes
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <span className="text-[11px] font-medium hidden sm:inline">
                          {isAgendamientoOpen ? 'Minimizar' : 'Expandir'}
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                          aria-label={isAgendamientoOpen ? 'Minimizar' : 'Expandir'}
                        >
                          {isAgendamientoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  {isAgendamientoOpen && (
                    <CardContent className="p-3.5 sm:p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            Margen Mínimo de Anticipación (Minutos)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={480}
                            step={15}
                            value={settings.minReservationBuffer}
                            onChange={(e) => handleChange('minReservationBuffer', Number(e.target.value) || 0)}
                            className="h-8 text-xs sm:text-sm font-sans"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Minutos mínimos requeridos entre la hora actual y la cita solicitada (ej. 30 o 60 min).
                          </p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            Días Máximos a Futuro para Agendar
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={90}
                            value={settings.maxDaysInFuture}
                            onChange={(e) => handleChange('maxDaysInFuture', Number(e.target.value) || 14)}
                            className="h-8 text-xs sm:text-sm font-sans"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Días hacia adelante que {settings.assistantName || 'Janeth'} puede consultar y ofrecer horarios.
                          </p>
                        </div>
                      </div>

                      <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between gap-4">
                        <div className="space-y-0.5 pr-2">
                          <span className="text-xs font-semibold text-foreground block">
                            Creación Automática de Citas en la Agenda
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            Cuando el cliente confirme el horario y su nombre, {settings.assistantName || 'Janeth'} apartará la cita inmediatamente en el calendario.
                          </p>
                        </div>
                        <Switch
                          checked={settings.autoCreateAppointments}
                          onCheckedChange={(val) => handleChange('autoCreateAppointments', val)}
                        />
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Modo de Operación y Traspaso Humano (Minimizable) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardHeader
                    className={cn(
                      'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                      isModoOperacionOpen && 'border-b border-border/50'
                    )}
                    onClick={() => setIsModoOperacionOpen((prev) => !prev)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-slate-400 shrink-0" />
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          Horario de Respuesta y Traspaso a Recepción
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs text-muted-foreground hidden sm:inline font-sans">
                            {settings.botActive ? 'Bot Activo' : 'Bot Pausado'}
                          </span>
                          <Switch
                            checked={settings.botActive}
                            onCheckedChange={(val) => handleChange('botActive', val)}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="text-[11px] font-medium hidden sm:inline">
                            {isModoOperacionOpen ? 'Minimizar' : 'Expandir'}
                          </span>
                          <button
                            type="button"
                            className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                            aria-label={isModoOperacionOpen ? 'Minimizar' : 'Expandir'}
                          >
                            {isModoOperacionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  {isModoOperacionOpen && (
                    <CardContent className="p-3.5 sm:p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground block">
                          Horario de Respuesta
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            {
                              id: '24_7',
                              title: 'Atención 24/7 (Siempre activa)',
                              desc: `${settings.assistantName || 'Janeth'} responde dudas y agenda citas a cualquier hora del día o de la noche.`,
                            },
                            {
                              id: 'horario_comercial',
                              title: 'Solo en Horario del Local',
                              desc: 'Fuera de horas de apertura, responde con mensaje informando el horario de reapertura.',
                            },
                          ].map((schOpt) => {
                            const isSelected = settings.responseSchedule === schOpt.id;
                            return (
                              <div
                                key={schOpt.id}
                                onClick={() => handleChange('responseSchedule', schOpt.id as any)}
                                className={cn(
                                  'p-3 rounded-xl border-2 cursor-pointer transition-all space-y-1',
                                  isSelected
                                    ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-xs'
                                    : 'border-border/60 hover:border-slate-400 bg-card hover:bg-muted/30'
                                )}
                              >
                                <span className="font-semibold text-xs text-foreground block">
                                  {schOpt.title}
                                </span>
                                <p className="text-[11px] text-muted-foreground">
                                  {schOpt.desc}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                            Palabras Clave de Traspaso a Humano (Separadas por comas)
                          </label>
                          <Badge variant="outline" className="text-[10px] py-0 border-border/60 text-muted-foreground">
                            Pausa el Chat
                          </Badge>
                        </div>
                        <Input
                          value={settings.takeoverKeywords}
                          onChange={(e) => handleChange('takeoverKeywords', e.target.value)}
                          placeholder="humano, persona, recepcionista, gerente, queja..."
                          className="h-8 text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Si un cliente escribe alguna de estas palabras, el bot pausará ese chat individual para que recepción lo atienda.
                        </p>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </TabsContent>

              {/* SUB-TAB 3: ANTICIPOS & FAQS */}
              <TabsContent value="anticipos" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                {/* Anticipos Automatizados (Minimizable) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardHeader
                    className={cn(
                      'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                      isAnticiposOpen && 'border-b border-border/50'
                    )}
                    onClick={() => setIsAnticiposOpen((prev) => !prev)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-slate-400 shrink-0" />
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          Anticipos Automatizados (Mercado Pago / SPEI)
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs text-muted-foreground hidden sm:inline font-sans">
                            {settings.requireDeposit ? 'Anticipo Activo' : 'Sin Anticipo'}
                          </span>
                          <Switch
                            checked={settings.requireDeposit}
                            onCheckedChange={(val) => handleChange('requireDeposit', val)}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="text-[11px] font-medium hidden sm:inline">
                            {isAnticiposOpen ? 'Minimizar' : 'Expandir'}
                          </span>
                          <button
                            type="button"
                            className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                            aria-label={isAnticiposOpen ? 'Minimizar' : 'Expandir'}
                          >
                            {isAnticiposOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  {isAnticiposOpen && (
                    <CardContent className="p-3.5 sm:p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between gap-4">
                        <div className="space-y-0.5 pr-2">
                          <span className="text-xs font-semibold text-foreground block">
                            Solicitar Anticipo del 50% por WhatsApp / App
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            {settings.assistantName || 'Janeth'} indicará al cliente que se requiere anticipo para apartar su cita en servicios de ${settings.depositMinAmount}.00 MXN o más.
                          </p>
                        </div>
                        <Switch
                          checked={settings.requireDeposit}
                          onCheckedChange={(val) => handleChange('requireDeposit', val)}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            Banco
                          </label>
                          <Input
                            value={settings.bankName}
                            onChange={(e) => handleChange('bankName', e.target.value)}
                            placeholder="Ej. Mercado Pago"
                            className="h-8 text-xs sm:text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            Beneficiario / Titular
                          </label>
                          <Input
                            value={settings.bankAccountHolder}
                            onChange={(e) => handleChange('bankAccountHolder', e.target.value)}
                            placeholder="Ej. VATOS ALFA Barber Shop"
                            className="h-8 text-xs sm:text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            CLABE Interbancaria (18 dígitos)
                          </label>
                          <Input
                            value={settings.bankClabe}
                            onChange={(e) => handleChange('bankClabe', e.target.value.replace(/\D/g, '').slice(0, 18))}
                            placeholder="012680015523489123"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1 pt-1">
                        <label className="text-xs font-semibold text-foreground">
                          Instrucción para Comprobante de Pago
                        </label>
                        <Input
                          value={settings.depositInstructions}
                          onChange={(e) => handleChange('depositInstructions', e.target.value)}
                          placeholder="Por favor compártenos el comprobante por este medio..."
                          className="h-8 text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Mensaje que {settings.assistantName || 'Janeth'} añade tras compartir los datos de transferencia.
                        </p>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Políticas y Preguntas Frecuentes (FAQs) (Minimizable) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardHeader
                    className={cn(
                      'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                      isFaqsOpen && 'border-b border-border/50'
                    )}
                    onClick={() => setIsFaqsOpen((prev) => !prev)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-slate-400 shrink-0" />
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          Políticas y Preguntas Frecuentes (FAQs)
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <span className="text-[11px] font-medium hidden sm:inline">
                          {isFaqsOpen ? 'Minimizar' : 'Expandir'}
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                          aria-label={isFaqsOpen ? 'Minimizar' : 'Expandir'}
                        >
                          {isFaqsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  {isFaqsOpen && (
                    <CardContent className="p-3.5 sm:p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            Tolerancia de Puntualidad (Minutos)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={60}
                            value={settings.punctualityToleranceMinutes}
                            onChange={(e) => handleChange('punctualityToleranceMinutes', Number(e.target.value) || 5)}
                            className="h-8 text-xs sm:text-sm font-sans"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Minutos tras los cuales una cita se considera inasistencia (No Show).
                          </p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            Edad Mínima para Niños (Años)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={18}
                            value={settings.minChildAge}
                            onChange={(e) => handleChange('minChildAge', Number(e.target.value) || 3)}
                            className="h-8 text-xs sm:text-sm font-sans"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Edad a partir de la cual el personal atiende cortes infantiles.
                          </p>
                        </div>
                      </div>

                      <div className="p-3 sm:px-4 sm:py-2.5 rounded-xl border border-border/70 bg-muted/15 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-foreground">
                            Dirección, Referencias de Llegada y Estacionamiento
                          </span>
                          {settings.addressReferences && (
                            <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                              ({settings.addressReferences.length} caracteres)
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openEditorModal(
                              'Dirección y Referencias del Local',
                              'Indica cómo llegar, cruces de calles y disponibilidad de cajones de estacionamiento.',
                              'addressReferences'
                            )
                          }
                          className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                        >
                          Editar
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </TabsContent>

              {/* SUB-TAB 4: RECORDATORIOS & AVISOS */}
              <TabsContent value="recordatorios" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                {/* 1. Recordatorios Automáticos (Minimizable) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardHeader
                    className={cn(
                      'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                      isRecordatoriosAutoOpen && 'border-b border-border/50'
                    )}
                    onClick={() => setIsRecordatoriosAutoOpen((prev) => !prev)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-slate-400 shrink-0" />
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          Recordatorios Automáticos
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs text-muted-foreground hidden sm:inline font-sans">
                            {(settings.autoChatReminders ?? true) ? 'Recordatorios Activos' : 'Desactivados'}
                          </span>
                          <Switch
                            checked={settings.autoChatReminders ?? true}
                            onCheckedChange={(val) => handleChange('autoChatReminders', val)}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="text-[11px] font-medium hidden sm:inline">
                            {isRecordatoriosAutoOpen ? 'Minimizar' : 'Expandir'}
                          </span>
                          <button
                            type="button"
                            className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                            aria-label={isRecordatoriosAutoOpen ? 'Minimizar' : 'Expandir'}
                          >
                            {isRecordatoriosAutoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  {isRecordatoriosAutoOpen && (
                    <CardContent className="p-3.5 sm:p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            Anticipación del Recordatorio (Minutos antes)
                          </label>
                          <Input
                            type="number"
                            value={settings.chatReminderMinutesBefore ?? 120}
                            onChange={(e) => handleChange('chatReminderMinutesBefore', Number(e.target.value))}
                            placeholder="120"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Por defecto: 120 min (2 horas antes de la hora de inicio de la cita).
                          </p>
                        </div>

                        <div className="p-3 rounded-xl border border-border/60 bg-muted/10 text-xs space-y-1">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-blue-400" />
                            Etiquetas Dinámicas Disponibles:
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            Haz clic para copiar e insertar en tu plantilla:
                          </p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {['{nombre}', '{fecha}', '{hora}', '{profesional}', '{servicios}', '{ubicacion}'].map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[10px] cursor-pointer hover:bg-muted font-sans border-border/60 text-foreground"
                                onClick={() => {
                                  navigator.clipboard.writeText(tag);
                                  toast({ title: 'Etiqueta copiada', description: `${tag} copiada al portapapeles.` });
                                }}
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 sm:px-4 sm:py-2.5 rounded-xl border border-border/70 bg-muted/15 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-foreground">
                            Plantilla del Mensaje de Recordatorio
                          </span>
                          {settings.chatReminderTemplate && (
                            <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                              ({settings.chatReminderTemplate.length} caracteres)
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openEditorModal(
                              'Plantilla del Mensaje de Recordatorio',
                              'Mensaje interactivo que Janeth envía automáticamente a los clientes con cita agendada.',
                              'chatReminderTemplate',
                              true
                            )
                          }
                          className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                        >
                          Editar
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* 2. Configuración de los 3 Botones Interactivos (Minimizable) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardHeader
                    className={cn(
                      'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                      isBotonesInteractivosOpen && 'border-b border-border/50'
                    )}
                    onClick={() => setIsBotonesInteractivosOpen((prev) => !prev)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          Configuración de los 3 Botones Interactivos
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <span className="text-[11px] font-medium hidden sm:inline">
                          {isBotonesInteractivosOpen ? 'Minimizar' : 'Expandir'}
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                          aria-label={isBotonesInteractivosOpen ? 'Minimizar' : 'Expandir'}
                        >
                          {isBotonesInteractivosOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  {isBotonesInteractivosOpen && (
                    <CardContent className="p-3.5 sm:p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-2.5 rounded-xl border border-border/60 bg-muted/10 space-y-1.5">
                          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                            <Check className="w-3 h-3 text-blue-400" /> Botón 1: Confirmar
                          </span>
                          <Input
                            value={settings.chatButtonConfirmText ?? 'Confirmar Asistencia'}
                            onChange={(e) => handleChange('chatButtonConfirmText', e.target.value)}
                            placeholder="Confirmar Asistencia"
                            className="h-8 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Acción: Marca la cita como <strong className="text-foreground">Confirmada</strong> en la agenda y Janeth agradece en el chat.
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl border border-border/60 bg-muted/10 space-y-1.5">
                          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-blue-400" /> Botón 2: Reagendar
                          </span>
                          <Input
                            value={settings.chatButtonRescheduleText ?? 'Reagendar'}
                            onChange={(e) => handleChange('chatButtonRescheduleText', e.target.value)}
                            placeholder="Reagendar"
                            className="h-8 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Acción: Janeth inicia el diálogo interactivo para consultar disponibilidad y mover la cita.
                          </p>
                        </div>

                        <div className="p-2.5 rounded-xl border border-border/60 bg-muted/10 space-y-1.5">
                          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-red-400" /> Botón 3: Cancelar
                          </span>
                          <Input
                            value={settings.chatButtonCancelText ?? 'Cancelar'}
                            onChange={(e) => handleChange('chatButtonCancelText', e.target.value)}
                            placeholder="Cancelar"
                            className="h-8 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Acción: Cancela la cita, libera el espacio en el calendario y notifica las políticas.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* 3. Plantilla de Confirmación Inmediata (Minimizable) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                  <CardHeader
                    className={cn(
                      'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                      isPlantillaConfirmacionOpen && 'border-b border-border/50'
                    )}
                    onClick={() => setIsPlantillaConfirmacionOpen((prev) => !prev)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          Plantilla de Confirmación Inmediata
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                        <span className="text-[11px] font-medium hidden sm:inline">
                          {isPlantillaConfirmacionOpen ? 'Minimizar' : 'Expandir'}
                        </span>
                        <button
                          type="button"
                          className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                          aria-label={isPlantillaConfirmacionOpen ? 'Minimizar' : 'Expandir'}
                        >
                          {isPlantillaConfirmacionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  {isPlantillaConfirmacionOpen && (
                    <CardContent className="p-3.5 sm:p-5 space-y-4 animate-in fade-in duration-200">
                      <div className="p-3 sm:px-4 sm:py-2.5 rounded-xl border border-border/70 bg-muted/15 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-foreground">
                            Mensaje de Confirmación al Agendar
                          </span>
                          {settings.chatConfirmationTemplate && (
                            <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                              ({settings.chatConfirmationTemplate.length} caracteres)
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openEditorModal(
                              'Plantilla de Confirmación Inmediata',
                              'Mensaje que se envía automáticamente en cuanto el cliente concreta una nueva cita por chat o web.',
                              'chatConfirmationTemplate',
                              true
                            )
                          }
                          className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                        >
                          Editar
                        </Button>
                      </div>

                      {/* Vista Previa Interactiva */}
                      <div className="pt-2 border-t border-border/60 space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Vista Previa en el Chat del Cliente
                        </label>
                        <div className="max-w-md rounded-2xl p-3.5 bg-[#18223c] text-white border border-blue-500/30 text-xs shadow-md space-y-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] text-blue-300 font-semibold border-b border-white/10 pb-1">
                            <Bot className="w-3.5 h-3.5 text-blue-400" /> {settings.assistantName || 'Janeth'} • Vatos Alfa
                          </div>
                          <FormattedPreviewText
                            text={(settings.chatReminderTemplate || defaultSofiaSettings.chatReminderTemplate || '')
                              .replace(/{nombre}/g, 'Zeus')
                              .replace(/{fecha}/g, 'Hoy, 10 de Octubre')
                              .replace(/{hora}/g, '5:00 PM')
                              .replace(/{profesional}/g, 'Alfredo')
                              .replace(/{servicios}/g, 'Corte Clásico')
                              .replace(
                                /{ubicacion}/g,
                                '[Av. Cerro Sombrerete 1001, Col. Cipreses (Suc. Sombrerete)](https://maps.google.com/?q=VATOS+ALFA+Barber+Shop+Av+Cerro+Sombrerete+1001+Col+Cipreses)'
                              )}
                          />
                          <div className="flex flex-col sm:flex-row gap-1.5 pt-1 border-t border-white/10">
                            <div className="h-7 px-2.5 rounded-lg bg-blue-600 text-white font-semibold text-[11px] flex items-center justify-center gap-1 shadow-xs">
                              <Check className="w-3 h-3" /> {settings.chatButtonConfirmText || 'Confirmar Asistencia'}
                            </div>
                            <div className="h-7 px-2.5 rounded-lg bg-white/10 text-white font-medium text-[11px] flex items-center justify-center gap-1 border border-white/20">
                              <Calendar className="w-3 h-3" /> {settings.chatButtonRescheduleText || 'Reagendar'}
                            </div>
                            <div className="h-7 px-2.5 rounded-lg bg-red-500/20 text-red-200 font-medium text-[11px] flex items-center justify-center gap-1 border border-red-500/30">
                              <XCircle className="w-3 h-3" /> {settings.chatButtonCancelText || 'Cancelar'}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 text-[10px] text-slate-400 select-none">
                            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                            <Link
                              href="/terminos"
                              target="_blank"
                              className="hover:text-slate-200 underline decoration-slate-600/60 transition-colors"
                            >
                              Términos y Condiciones
                            </Link>
                            <span className="text-slate-600">•</span>
                            <Link
                              href="/privacidad"
                              target="_blank"
                              className="hover:text-slate-200 underline decoration-slate-600/60 transition-colors"
                            >
                              Aviso de Privacidad
                            </Link>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* =========================================================
            SECCIÓN 2: JANETH ADMINISTRADORA (SUCURSAL — BEATRIZ)
           ========================================================= */}
        {assistantTab === 'administradora' && (
          <div className="space-y-4">
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardContent className="p-3.5 sm:p-5 space-y-4">
                {/* Switch Independiente de Janeth Administradora */}
                <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/10 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-foreground block">
                      Estado de Janeth Administradora (Sesión de Beatriz)
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Controla si el asistente flotante y el panel de Gerencia están activos para la Administradora del Local. Si la pausas, Beatriz verá un aviso de mantenimiento.
                    </p>
                  </div>
                  <Switch
                    checked={settings.gerenciaActive ?? true}
                    onCheckedChange={(val) =>
                      handleQuickToggleActive('gerenciaActive', val, 'Janeth Administradora')
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Nombre de la Asistente de Sucursal
                    </label>
                    <Input
                      value={settings.gerenciaName ?? 'Janeth Administradora'}
                      onChange={(e) => handleChange('gerenciaName', e.target.value)}
                      placeholder="Janeth Administradora"
                      className="h-8 text-xs sm:text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Identificador en el panel operativo de administración de sucursal.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Rol / Alcance Operativo
                    </label>
                    <Input
                      value={settings.gerenciaRole ?? 'Copiloto Operativo de Administración de Sucursal'}
                      onChange={(e) => handleChange('gerenciaRole', e.target.value)}
                      placeholder="Copiloto Operativo de Administración de Sucursal"
                      className="h-8 text-xs sm:text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Equivalente a las facultades de Beatriz Elizarraga Casas en sucursal.
                    </p>
                  </div>
                </div>

                {/* Master Prompt de Janeth Administradora (Abre Modal) */}
                <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-border/70 bg-muted/15 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-foreground">
                      Master Prompt (Janeth Administradora)
                    </span>
                    {settings.gerenciaCustomInstructions && (
                      <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                        ({settings.gerenciaCustomInstructions.length} caracteres)
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openEditorModal(
                        'Master Prompt de Janeth Administradora',
                        'Directrices operativas, trato con Beatriz y límites de seguridad financiera en sucursal.',
                        'gerenciaCustomInstructions'
                      )
                    }
                    className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                  >
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Facultades y Límites Operativos de Janeth Administradora (Minimizable) */}
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader
                className={cn(
                  'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                  isGerenciaPermisosOpen && 'border-b border-border/50'
                )}
                onClick={() => setIsGerenciaPermisosOpen((prev) => !prev)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                      Facultades Operativas y Límites de Seguridad (Beatriz)
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <span className="text-[11px] font-medium hidden sm:inline">
                      {isGerenciaPermisosOpen ? 'Minimizar' : 'Expandir'}
                    </span>
                    <button
                      type="button"
                      className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                      aria-label={isGerenciaPermisosOpen ? 'Minimizar' : 'Expandir'}
                    >
                      {isGerenciaPermisosOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardHeader>
              {isGerenciaPermisosOpen && (
                <CardContent className="p-3.5 sm:p-5 space-y-2.5 animate-in fade-in duration-200">
                  {[
                    {
                      field: 'gerenciaAllowAgenda' as const,
                      title: 'Control de Agenda (Agendar, Reagendar y Cambiar Servicios)',
                      desc: 'Permite agendar citas nuevas, mover horarios y cambiar servicios o paquetes sin cancelar la reserva.',
                    },
                    {
                      field: 'gerenciaAllowAuthCodes' as const,
                      title: 'Códigos Temporales de 4 Dígitos y Exención de Anticipos',
                      desc: 'Permite generar códigos de un solo uso para omitir anticipos o marcar clientes de confianza como exentos.',
                    },
                    {
                      field: 'gerenciaAllowClients' as const,
                      title: 'Búsqueda Total de Clientes y Expediente 360',
                      desc: 'Consulta clientes por celular, nombre o número de cliente, notas de estilo, Pase Alfa y ALFAcoins.',
                    },
                    {
                      field: 'gerenciaAllowSchedules' as const,
                      title: 'Horarios de Barberos, Descansos y Jornadas Especiales',
                      desc: 'Bloquea permisos, ajusta horarios fijos semanales y habilita jornadas especiales en web/app.',
                    },
                    {
                      field: 'gerenciaAllowInventory' as const,
                      title: 'Gestión de Inventario, Stock y Salidas de Cabina',
                      desc: 'Ingresa mercancía nueva al stock oficial y registra salidas de insumos para barberos o mermas.',
                    },
                    {
                      field: 'gerenciaAllowServicesAndCash' as const,
                      title: 'Catálogo de Servicios y Arqueo de Caja (Solo Lectura)',
                      desc: 'Crea/edita servicios del catálogo y consulta el efectivo teórico en cajón y comisiones sin alterar finanzas.',
                    },
                  ].map((cap) => (
                    <div
                      key={cap.field}
                      className="p-3 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between gap-4"
                    >
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-semibold text-foreground block">{cap.title}</span>
                        <p className="text-[11px] text-muted-foreground">{cap.desc}</p>
                      </div>
                      <Switch
                        checked={(settings[cap.field] as boolean) ?? true}
                        onCheckedChange={(val) => handleChange(cap.field, val)}
                      />
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          </div>
        )}

        {/* =========================================================
            SECCIÓN 3: JANETH CEO (DIRECCIÓN GENERAL)
           ========================================================= */}
        {assistantTab === 'ceo' && (
          <div className="space-y-4">
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardContent className="p-3.5 sm:p-5 space-y-4">
                {/* Switch Independiente de Janeth CEO */}
                <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/10 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-foreground block">
                      Estado de Janeth CEO (Dirección General y Consola Ejecutiva)
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Activa o pausa tu asistente ejecutiva personal con acceso total a finanzas, auditoría forense y operación global.
                    </p>
                  </div>
                  <Switch
                    checked={settings.ceoActive ?? true}
                    onCheckedChange={(val) => handleQuickToggleActive('ceoActive', val, 'Janeth CEO')}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Nombre de la Asistente Ejecutiva
                    </label>
                    <Input
                      value={settings.ceoName ?? 'Janeth CEO'}
                      onChange={(e) => handleChange('ceoName', e.target.value)}
                      placeholder="Janeth CEO"
                      className="h-8 text-xs sm:text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Nombre visible en la Consola Ejecutiva y en tu burbuja flotante de Administrador General.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Rol / Cargo Directivo
                    </label>
                    <Input
                      value={settings.ceoRole ?? 'Directora General Adjunta (CEO), CFO y Auditora Forense'}
                      onChange={(e) => handleChange('ceoRole', e.target.value)}
                      placeholder="Directora General Adjunta (CEO), CFO y Auditora Forense"
                      className="h-8 text-xs sm:text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Nivel máximo de privilegios estratégicos, financieros y operativos en VATOS ALFA.
                    </p>
                  </div>
                </div>

                {/* Master Prompt de Janeth CEO (Abre Modal) */}
                <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-border/70 bg-muted/15 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-foreground">
                      Master Prompt Directivo (Janeth CEO)
                    </span>
                    {settings.ceoCustomInstructions && (
                      <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
                        ({settings.ceoCustomInstructions.length} caracteres)
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openEditorModal(
                        'Master Prompt de Janeth CEO',
                        'Instrucciones estratégicas, criterios financieros (CFO / RESICO) y reglas de auditoría para Dirección General.',
                        'ceoCustomInstructions'
                      )
                    }
                    className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
                  >
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Subagentes de Poder y Facultades de Janeth CEO (Minimizable) */}
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader
                className={cn(
                  'py-2.5 px-3.5 sm:px-5 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors',
                  isCeoSubagentesOpen && 'border-b border-border/50'
                )}
                onClick={() => setIsCeoSubagentesOpen((prev) => !prev)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-[#C5A880] shrink-0" />
                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                      Subagentes Ejecutivos y Alcance de Dirección General
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <span className="text-[11px] font-medium hidden sm:inline">
                      {isCeoSubagentesOpen ? 'Minimizar' : 'Expandir'}
                    </span>
                    <button
                      type="button"
                      className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                      aria-label={isCeoSubagentesOpen ? 'Minimizar' : 'Expandir'}
                    >
                      {isCeoSubagentesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardHeader>
              {isCeoSubagentesOpen && (
                <CardContent className="p-3.5 sm:p-5 space-y-2.5 animate-in fade-in duration-200">
                  {[
                    {
                      field: 'ceoAllowFinancials' as const,
                      title: 'Subagente CFO — Estado de Resultados (P&L) e Impuestos RESICO',
                      desc: 'Cálculo exacto de ingresos, comisiones, nómina, costos fijos, utilidad gerencia Beatriz y utilidad neta del dueño.',
                    },
                    {
                      field: 'ceoAllowSimulator' as const,
                      title: 'Subagente Simulador Financiero y Estrategia de Precios',
                      desc: 'Proyecta escenarios modificando comisiones, precios de servicios o estructura de costos con datos reales.',
                    },
                    {
                      field: 'ceoAllowForensicAudit' as const,
                      title: 'Subagente Auditor Forense Anti-Robo y Bitácora de Códigos',
                      desc: 'Escanea ventas eliminadas, uso de códigos maestros o temporales, exenciones de anticipo y diferencias en cortes de caja.',
                    },
                    {
                      field: 'ceoAllowClientVoice' as const,
                      title: 'Subagente Voz del Cliente, Retención y Pase ALFA Club',
                      desc: 'Analiza reseñas, quejas en buzón, conversaciones de WhatsApp y clientes en riesgo de abandono.',
                    },
                    {
                      field: 'ceoAllowFullBranchControl' as const,
                      title: 'Control Operativo Total de Sucursales y Consignas a Gerencia',
                      desc: 'Incluye todas las herramientas operativas de agenda, clientes, stock, servicios y envío de consignas al panel de Beatriz.',
                    },
                  ].map((cap) => (
                    <div
                      key={cap.field}
                      className="p-3 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between gap-4"
                    >
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-semibold text-foreground block">{cap.title}</span>
                        <p className="text-[11px] text-muted-foreground">{cap.desc}</p>
                      </div>
                      <Switch
                        checked={(settings[cap.field] as boolean) ?? true}
                        onCheckedChange={(val) => handleChange(cap.field, val)}
                      />
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          </div>
        )}

        {/* Bottom Save Bar (Sticky Alfa) */}
        <div className="sticky bottom-0 z-10 py-3 bg-background/90 backdrop-blur-md border-t border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <span className="hidden sm:inline">
              Los cambios e interruptores se aplican en tiempo real a {currentHeaderInfo.label}.
            </span>
          </div>

          <Button
            type="submit"
            disabled={isSaving}
            variant="alfa"
            className="h-9 px-6 text-xs font-semibold"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Guardar
              </>
            )}
          </Button>
        </div>
      </form>

      {/* MODAL MAXIMIZADO DE REDACCIÓN Y EDICIÓN DE TEXTOS / PLANTILLAS */}
      <Dialog
        open={editorModal.open}
        onOpenChange={(open) => !open && setEditorModal((prev) => ({ ...prev, open: false }))}
      >
        <DialogContent
          hideCloseButton={true}
          className="p-0 overflow-hidden max-w-3xl w-[95vw] max-h-[90vh] flex flex-col rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)]"
        >
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-800 shrink-0">
            <div className="header-light-beam" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-slate-300 shrink-0" />
                <div>
                  <DialogTitle className="text-sm font-bold text-white tracking-tight">
                    {editorModal.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    {editorModal.description}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 font-normal font-sans">
                    {editorModal.value.trim().split(/\s+/).filter(Boolean).length} palabras
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 font-normal font-sans">
                    {editorModal.value.length} caracteres
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setEditorModal((prev) => ({ ...prev, open: false }))}
                  className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10 ml-2"
                  aria-label="Cerrar modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 space-y-2.5 p-4 sm:p-5 overflow-y-auto">
            {editorModal.supportsTags && (
              <div className="p-2.5 rounded-xl border border-border/60 bg-muted/10 text-xs space-y-1 shrink-0">
                <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                  <Tag className="w-3.5 h-3.5 text-blue-400" />
                  Etiquetas dinámicas (haz clic para insertar en el texto):
                </span>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {['{nombre}', '{fecha}', '{hora}', '{profesional}', '{servicios}', '{ubicacion}'].map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] cursor-pointer hover:bg-muted font-sans border-border/60 text-foreground"
                      onClick={() => {
                        setEditorModal((prev) => ({
                          ...prev,
                          value: prev.value ? `${prev.value} ${tag}` : tag,
                        }));
                        toast({ title: 'Etiqueta insertada', description: `${tag} añadida al texto.` });
                      }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              value={editorModal.value}
              onChange={(e) => setEditorModal((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="Escribe o edita aquí el texto..."
              className="flex-1 min-h-[260px] sm:min-h-[360px] text-xs sm:text-sm font-sans leading-relaxed resize-none p-3.5 rounded-xl border-border/80 focus:border-blue-500"
            />
          </div>

          <div className="p-3 sm:p-4 bg-muted/15 border-t border-border/50 flex items-center justify-between gap-3 shrink-0">
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Haz clic en &quot;Aplicar y Guardar Ahora&quot; para actualizar directamente este campo.
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditorModal((prev) => ({ ...prev, open: false }))}
                className="h-8 text-xs cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="alfa"
                size="sm"
                disabled={isSaving}
                onClick={async () => {
                  handleChange(editorModal.field, editorModal.value);
                  setEditorModal((prev) => ({ ...prev, open: false }));
                  await handleSave(undefined, {
                    ...settings,
                    [editorModal.field]: editorModal.value,
                  });
                }}
                className="h-8 text-xs font-semibold cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Guardando...
                  </>
                ) : (
                  'Aplicar y Guardar Ahora'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SofiaSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SofiaSettingsContent />
    </Suspense>
  );
}
