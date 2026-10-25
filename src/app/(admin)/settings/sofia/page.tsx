'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bot,
  Sparkles,
  Calendar,
  CreditCard,
  AlertTriangle,
  Clock,
  Save,
  RefreshCw,
  Building,
  HelpCircle,
  MessageSquare,
  ShieldAlert,
  SlidersHorizontal,
  Bell,
  Check,
  XCircle,
  Tag,
  MapPin,
  ExternalLink,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface SofiaSettings {
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
}

const defaultSofiaSettings: SofiaSettings = {
  assistantName: 'Janet',
  assistantRole: 'Recepcionista Humana de Barbería',
  tone: 'calido_profesional',
  customInstructions: 'Ofrece siempre una experiencia de bienvenida cálida. Recuerda a los clientes que contamos con cajones de estacionamiento al frente y que si traen niños atendemos desde los 3 años.',
  minReservationBuffer: 30,
  maxDaysInFuture: 14,
  autoCreateAppointments: true,
  requireDeposit: true,
  depositMinAmount: 190,
  depositPercentage: 50,
  bankName: 'Mercado Pago',
  bankAccountHolder: 'VATOS ALFA Barber Shop',
  bankClabe: '',
  depositInstructions: 'Puedes pagar con tarjeta o por transferencia SPEI directa dentro del enlace de Mercado Pago con confirmación automática instantánea.',
  botActive: true,
  responseSchedule: '24_7',
  takeoverKeywords: 'humano, humana, persona, recepcionista, recepcion, gerente, queja, hablar con alguien, asesor, operador, atencion humana, persona real',
  punctualityToleranceMinutes: 10,
  minChildAge: 3,
  addressReferences: 'Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro. Contamos con cajones de estacionamiento al frente.',

  autoChatReminders: true,
  chatReminderMinutesBefore: 120,
  chatReminderTemplate: '¡Hola *{nombre}*, te recordamos tu cita en Vatos Alfa! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n✂️ *Servicio(s):* {servicios}\n📍 *Ubicación:* {ubicacion}\n\nPor favor confirma tu asistencia presionando una opción abajo:',
  chatConfirmationTemplate: '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n✂️ *Servicio(s):* {servicios}\n📍 *Ubicación:* {ubicacion}\n\nTe esperamos 5 minutos antes. ¡Muchas gracias por tu preferencia en Vatos Alfa!\n\n📄 [Términos y Condiciones](/terminos) • [Aviso de Privacidad](/privacidad)',
  chatButtonConfirmText: 'Confirmar Asistencia',
  chatButtonRescheduleText: 'Reagendar',
  chatButtonCancelText: 'Cancelar',
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

export default function SofiaSettingsPage() {
  const { db } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState<SofiaSettings>(defaultSofiaSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    async function loadSettings() {
      if (!db) return;
      try {
        const docRef = doc(db, 'settings', 'sofia');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSettings({ ...defaultSofiaSettings, ...snap.data() });
        }
      } catch (err) {
        console.error('Error al cargar configuración del Asistente:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [db]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!db) return;

    setIsSaving(true);
    try {
      const docRef = doc(db, 'settings', 'sofia');
      await setDoc(docRef, settings, { merge: true });

      toast({
        title: '¡Configuración Guardada!',
        description: `Los cambios para el Asistente ${settings.assistantName || 'Janet'} se aplicaron correctamente.`,
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2.5 text-muted-foreground">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="text-xs font-medium">Cargando configuración del Asistente...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 max-w-5xl pb-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Asistente {settings.assistantName || 'Janet'} (IA)
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-sans font-medium py-0 px-2 rounded-full",
                settings.botActive
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                  : "bg-muted/40 text-muted-foreground border-border/60"
              )}
            >
              {settings.botActive ? '● Bot Activo' : '○ Bot Pausado'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Personaliza la identidad, tono de voz, reglas de agendamiento, datos bancarios SPEI y modo de operación de tu recepcionista virtual.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="text-xs h-8 px-2.5 gap-1.5 rounded-lg border-border/80"
          >
            <Link href="/conversations">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
              <span>Ir a Mensajes</span>
            </Link>
          </Button>

          <Button
            onClick={() => handleSave()}
            disabled={isSaving}
            variant="alfa"
            className="text-xs h-8 px-4 gap-1.5 font-semibold"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar Cambios
          </Button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Tabs defaultValue="identidad" className="w-full space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 bg-muted/20 border border-border/60 rounded-xl gap-1">
            <TabsTrigger
              value="identidad"
              className="flex items-center justify-center gap-1.5 py-2 px-1 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
            >
              <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
              <span>Identidad</span>
            </TabsTrigger>
            <TabsTrigger
              value="operacion"
              className="flex items-center justify-center gap-1.5 py-2 px-1 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
            >
              <SlidersHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
              <span>Operación</span>
            </TabsTrigger>
            <TabsTrigger
              value="anticipos"
              className="flex items-center justify-center gap-1.5 py-2 px-1 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
            >
              <CreditCard className="h-4 w-4 text-slate-400 shrink-0" />
              <span>Anticipos & FAQs</span>
            </TabsTrigger>
            <TabsTrigger
              value="recordatorios"
              className="flex items-center justify-center gap-1.5 py-2 px-1 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
            >
              <Bell className="h-4 w-4 text-slate-400 shrink-0" />
              <span>Recordatorios & Avisos</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: IDENTIDAD */}
          <TabsContent value="identidad" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                    Identidad y Personalidad
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  Nombre de la asistente, rol y estilo de comunicación con tus clientes en WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Nombre de la Asistente
                    </label>
                    <Input
                      value={settings.assistantName}
                      onChange={(e) => handleChange('assistantName', e.target.value)}
                      placeholder="Ej. Janet"
                      className="h-8 text-xs sm:text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Nombre con el que se presenta en los saludos por WhatsApp.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Rol / Título
                    </label>
                    <Input
                      value={settings.assistantRole}
                      onChange={(e) => handleChange('assistantRole', e.target.value)}
                      placeholder="Ej. Recepcionista Humana de Barbería"
                      className="h-8 text-xs sm:text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Define su función interna dentro del negocio ante el cliente.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-foreground block">
                    Tono de Comunicación
                  </label>
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
                            "p-3 rounded-xl border-2 cursor-pointer transition-all space-y-1",
                            isSelected
                              ? "border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-xs"
                              : "border-border/60 hover:border-slate-400 bg-card hover:bg-muted/30"
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

                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                      Instrucciones Especiales / Reglas del Negocio (Prompt Personalizado)
                    </label>
                    <span className="text-[11px] text-muted-foreground font-sans">Texto libre para la IA</span>
                  </div>
                  <Textarea
                    value={settings.customInstructions}
                    onChange={(e) => handleChange('customInstructions', e.target.value)}
                    placeholder={`Escribe reglas adicionales que ${settings.assistantName || 'Janet'} debe obedecer siempre (ej: 'Mencionar que en días de calor regalamos agua fría')...`}
                    rows={3}
                    className="text-xs leading-relaxed resize-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {settings.assistantName || 'Janet'} integrará estas instrucciones directamente a su contexto en cada respuesta.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: OPERACIÓN */}
          <TabsContent value="operacion" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
            {/* Reglas de Agendamiento */}
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                    Reglas de Agendamiento en WhatsApp
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  Margen de tiempo para citas, límites a futuro y creación automática en el calendario.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 space-y-4">
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
                      Días hacia adelante que {settings.assistantName || 'Janet'} puede consultar y ofrecer horarios.
                    </p>
                  </div>
                </div>

                <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-foreground block">
                      Creación Automática de Citas en la Agenda
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Cuando el cliente confirme el horario y su nombre por WhatsApp, {settings.assistantName || 'Janet'} apartará la cita inmediatamente en tu calendario.
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoCreateAppointments}
                    onCheckedChange={(val) => handleChange('autoCreateAppointments', val)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Modo de Operación y Traspaso Humano */}
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-slate-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                    Modo de Operación y Traspaso a Humano
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  Control de actividad del bot y palabras que silencian a {settings.assistantName || 'Janet'} para dar paso a recepción.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 space-y-4">
                <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-foreground block">
                      Bot Activo Globalmente
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Si está desactivado, el asistente no responderá y los chats pasarán directo a recepción.
                    </p>
                  </div>
                  <Switch
                    checked={settings.botActive}
                    onCheckedChange={(val) => handleChange('botActive', val)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    Horario de Respuesta
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: '24_7',
                        title: 'Atención 24/7 (Siempre activa)',
                        desc: `${settings.assistantName || 'Janet'} responde dudas y agenda citas a cualquier hora del día o de la noche.`,
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
                            "p-3 rounded-xl border-2 cursor-pointer transition-all space-y-1",
                            isSelected
                              ? "border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-xs"
                              : "border-border/60 hover:border-slate-400 bg-card hover:bg-muted/30"
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
                      Pausa el Bot
                    </Badge>
                  </div>
                  <Input
                    value={settings.takeoverKeywords}
                    onChange={(e) => handleChange('takeoverKeywords', e.target.value)}
                    placeholder="humano, persona, recepcionista, gerente, queja..."
                    className="h-8 text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Si un cliente escribe alguna de estas palabras, el bot se pausará automáticamente para que la recepcionista tome el chat.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: ANTICIPOS & FAQS */}
          <TabsContent value="anticipos" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
            {/* Anticipos Automatizados */}
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-slate-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                    Anticipos Automatizados (Mercado Pago / SPEI)
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  Configura el cobro de anticipos por WhatsApp mediante enlace de pago o transferencia directa.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 space-y-4">
                <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/5 flex items-center justify-between gap-4">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-foreground block">
                      Solicitar Anticipo del 50% por WhatsApp
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {settings.assistantName || 'Janet'} indicará al cliente que se requiere anticipo para apartar su cita en servicios de ${settings.depositMinAmount}.00 MXN o más.
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
                    Mensaje que {settings.assistantName || 'Janet'} añade tras compartir los datos de transferencia.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Políticas y Preguntas Frecuentes (FAQs) */}
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-slate-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                    Políticas y Preguntas Frecuentes (FAQs)
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  Tolerancia de puntualidad, edad mínima de niños y referencias de ubicación del local.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 space-y-4">
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
                      onChange={(e) => handleChange('punctualityToleranceMinutes', Number(e.target.value) || 10)}
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

                <div className="space-y-1 pt-1">
                  <label className="text-xs font-semibold text-foreground">
                    Dirección, Referencias de Llegada y Estacionamiento
                  </label>
                  <Textarea
                    value={settings.addressReferences}
                    onChange={(e) => handleChange('addressReferences', e.target.value)}
                    placeholder="Indica cómo llegar, cruces de calles, si hay cajones de estacionamiento al frente..."
                    rows={2}
                    className="text-xs leading-relaxed resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: RECORDATORIOS & PLANTILLAS INTERACTIVAS */}
          <TabsContent value="recordatorios" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
            <Card className="border border-border/70 shadow-xs overflow-hidden">
              <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-slate-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                    Recordatorios y Confirmaciones en Chat (App / Web)
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  Configura los mensajes automáticos y los 3 botones interactivos de acción para que Janet gestione confirmaciones de forma 100% autónoma.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-5 space-y-4">
                {/* Switch de activación */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
                  <div className="space-y-0.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-2">
                      Recordatorios Automáticos en Chat de la App
                      <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30 font-sans">
                        100% Autónomo
                      </Badge>
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Janet enviará automáticamente el recordatorio interactivo al chat de cada cliente con cita agendada, sin depender de WhatsApp ni servicios de Meta.
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoChatReminders ?? true}
                    onCheckedChange={(val) => handleChange('autoChatReminders', val)}
                  />
                </div>

                {/* Anticipación en minutos y etiquetas */}
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

                {/* Plantilla Recordatorio */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Plantilla del Mensaje de Recordatorio
                  </label>
                  <Textarea
                    rows={5}
                    value={settings.chatReminderTemplate || ''}
                    onChange={(e) => handleChange('chatReminderTemplate', e.target.value)}
                    placeholder="Escribe el mensaje de recordatorio..."
                    className="text-xs font-sans leading-relaxed"
                  />
                </div>

                {/* Configuración de los 3 Botones Interactivos */}
                <div className="pt-2 border-t border-border/60 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Configuración de los 3 Botones Interactivos del Mensaje
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Estos botones aparecerán en la pantalla del cliente dentro del chat:
                    </p>
                  </div>

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
                        Acción: Marca la cita en <strong className="text-foreground">Confirmado (etiqueta amarilla #facc15)</strong> en la agenda y Janet agradece en el chat.
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
                        Acción: Janet inicia el diálogo interactivo para consultar disponibilidad y mover la cita.
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
                </div>

                {/* Plantilla Confirmación Inmediata */}
                <div className="pt-2 border-t border-border/60 space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Plantilla de Confirmación Inmediata (Al Agendar)
                  </label>
                  <Textarea
                    rows={4}
                    value={settings.chatConfirmationTemplate || ''}
                    onChange={(e) => handleChange('chatConfirmationTemplate', e.target.value)}
                    placeholder="Escribe el mensaje de confirmación de cita..."
                    className="text-xs font-sans leading-relaxed"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Se envía automáticamente en cuanto el cliente concreta una nueva cita por chat o web.
                  </p>
                </div>

                {/* Vista Previa Interactiva */}
                <div className="pt-2 border-t border-border/60 space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Vista Previa en el Chat del Cliente
                  </label>
                  <div className="max-w-md rounded-2xl p-3.5 bg-[#18223c] text-white border border-blue-500/30 text-xs shadow-md space-y-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-blue-300 font-semibold border-b border-white/10 pb-1">
                      <Bot className="w-3.5 h-3.5 text-blue-400" /> {settings.assistantName || 'Janet'} • Vatos Alfa
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
                      <div className="h-7 px-2.5 rounded-lg bg-yellow-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 shadow-xs">
                        <Check className="w-3 h-3" /> {settings.chatButtonConfirmText || 'Confirmar Asistencia'}
                      </div>
                      <div className="h-7 px-2.5 rounded-lg bg-white/10 text-white font-medium text-[11px] flex items-center justify-center gap-1 border border-white/20">
                        <Calendar className="w-3 h-3" /> {settings.chatButtonRescheduleText || 'Reagendar'}
                      </div>
                      <div className="h-7 px-2.5 rounded-lg bg-red-500/20 text-red-200 font-medium text-[11px] flex items-center justify-center gap-1 border border-red-500/30">
                        <XCircle className="w-3 h-3" /> {settings.chatButtonCancelText || 'Cancelar'}
                      </div>
                    </div>

                    {/* Legal Links Footer */}
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
            </Card>
          </TabsContent>
        </Tabs>

        {/* Bottom Save Bar (Sticky Alfa) */}
        <div className="sticky bottom-0 z-10 py-3 bg-background/90 backdrop-blur-md border-t border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <span className="hidden sm:inline">Los cambios se aplican en tiempo real al Asistente {settings.assistantName || 'Janet'}.</span>
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
                Guardar Configuración
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
