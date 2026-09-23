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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Bot,
  Sparkles,
  Calendar,
  CreditCard,
  AlertTriangle,
  Clock,
  ChevronDown,
  Save,
  RefreshCw,
  Check,
  Building,
  HelpCircle,
  MessageSquare,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

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
  takeoverKeywords: 'humano, persona, recepcionista, recepcion, gerente, queja, hablar con alguien, asesor',
  punctualityToleranceMinutes: 10,
  minChildAge: 3,
  addressReferences: 'Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro. Contamos con cajones de estacionamiento al frente.',
};

function CollapsibleCard({
  icon: Icon,
  title,
  description,
  badge,
  children,
  defaultOpen = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="border border-border/70 shadow-sm overflow-hidden transition-all">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/40 transition-colors flex flex-row items-center justify-between p-4 md:p-5 space-y-0 select-none">
            <div className="flex items-center gap-3 text-left pr-4 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-sm md:text-base font-bold text-foreground">
                    {title}
                  </CardTitle>
                  {badge}
                </div>
                <CardDescription className="text-xs text-muted-foreground line-clamp-1">
                  {description}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-8 h-8 p-0 shrink-0 text-muted-foreground"
              type="button"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
              <span className="sr-only">Desplegar</span>
            </Button>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-4 md:p-6 pt-0 border-t border-border/40 mt-1 space-y-4">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
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
        title: '✅ Configuración Guardada',
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
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
        <RefreshCw className="w-7 h-7 animate-spin text-primary" />
        <span className="text-sm font-medium">Cargando configuración del Asistente...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              Asistente {settings.assistantName || 'Janet'} (IA)
            </h1>
            <Badge
              variant={settings.botActive ? 'default' : 'secondary'}
              className={settings.botActive ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              {settings.botActive ? '● Bot Activo' : '○ Bot Pausado'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Personaliza la identidad, tono de voz, reglas de agendamiento, datos bancarios SPEI y modo de operación de tu recepcionista virtual.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="text-xs h-9 gap-1.5"
          >
            <Link href="/conversations">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              Ir a Mensajes
            </Link>
          </Button>

          <Button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="text-xs h-9 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow"
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
        {/* ======================================================== */}
        {/* 1. IDENTIDAD Y PERSONALIDAD */}
        {/* ======================================================== */}
        <CollapsibleCard
          icon={Sparkles}
          title="1. Identidad y Personalidad"
          description="Nombre del asistente, rol y estilo con el que habla a tus clientes."
          defaultOpen={true}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Nombre del Asistente
              </label>
              <Input
                value={settings.assistantName}
                onChange={(e) => handleChange('assistantName', e.target.value)}
                placeholder="Ej. Janet"
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                El nombre con el que se presenta en los saludos por WhatsApp.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Rol / Título
              </label>
              <Input
                value={settings.assistantRole}
                onChange={(e) => handleChange('assistantRole', e.target.value)}
                placeholder="Ej. Recepcionista Humana de Barbería"
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Define su función interna dentro del negocio ante el cliente.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
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
                    className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                        : 'border-border/70 hover:border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground">
                        {toneOpt.title}
                      </span>
                      {toneOpt.badge && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1 font-normal">
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

          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Instrucciones Especiales / Reglas del Negocio (Prompt Personalizado)
              </label>
              <span className="text-[11px] text-muted-foreground">Texto libre para la IA</span>
            </div>
            <Textarea
              value={settings.customInstructions}
              onChange={(e) => handleChange('customInstructions', e.target.value)}
              placeholder={`Escribe reglas adicionales que ${settings.assistantName || 'Janet'} debe obedecer siempre (ej: 'Mencionar que en días de calor regalamos agua fría', 'No ofrecer a Lalo antes de las 11 AM')...`}
              rows={3}
              className="text-xs leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              {settings.assistantName || 'Janet'} integrará estas instrucciones directamente a su memoria en cada respuesta por WhatsApp.
            </p>
          </div>
        </CollapsibleCard>

        {/* ======================================================== */}
        {/* 2. REGLAS DE AGENDAMIENTO */}
        {/* ======================================================== */}
        <CollapsibleCard
          icon={Calendar}
          title="2. Reglas de Agendamiento y Agenda"
          description="Margen de tiempo para citas, límites a futuro y creación automática."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
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
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Minutos mínimos requeridos entre la hora actual y la cita solicitada (ej. 30 o 60 min).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Días Máximos a Futuro para Agendar
              </label>
              <Input
                type="number"
                min={1}
                max={90}
                value={settings.maxDaysInFuture}
                onChange={(e) => handleChange('maxDaysInFuture', Number(e.target.value) || 14)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Hasta cuántos días hacia adelante {settings.assistantName || 'Janet'} puede consultar y ofrecer horarios disponibles.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-background border border-border/70 flex items-center justify-between gap-4 mt-2">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">
                Creación Automática de Citas en la Agenda
              </span>
              <p className="text-[11px] text-muted-foreground">
                Cuando el cliente confirme el horario y su nombre por WhatsApp, {settings.assistantName || 'Janet'} apartará la cita inmediatamente en tu calendario de reservas.
              </p>
            </div>
            <Switch
              checked={settings.autoCreateAppointments}
              onCheckedChange={(val) => handleChange('autoCreateAppointments', val)}
            />
          </div>
        </CollapsibleCard>

        {/* ======================================================== */}
        {/* 3. ANTICIPOS Y DATOS BANCARIOS */}
        {/* ======================================================== */}
        <CollapsibleCard
          icon={CreditCard}
          title="3. Anticipos y Cobros Automatizados (Mercado Pago / SPEI)"
          description="Configura la política de anticipos. Mercado Pago gestiona cobros con tarjeta y transferencias SPEI automatizadas vía Webhook."
          badge={
            <Badge variant="outline" className="text-[10px] font-normal border-amber-500/30 text-amber-600 bg-amber-500/10">
              Anticipos WhatsApp
            </Badge>
          }
        >
          <div className="p-3.5 rounded-xl bg-background border border-border/70 flex items-center justify-between gap-4 mb-2">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">
                Solicitar Anticipo del 50% por WhatsApp
              </span>
              <p className="text-[11px] text-muted-foreground">
                {settings.assistantName || 'Janet'} indicará al cliente que se requiere el 50% de anticipo para apartar su cita en servicios de ${settings.depositMinAmount} MXN o más, generando el enlace seguro de Mercado Pago (tarjeta o transferencia SPEI).
              </p>
            </div>
            <Switch
              checked={settings.requireDeposit}
              onCheckedChange={(val) => handleChange('requireDeposit', val)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Banco
              </label>
              <Input
                value={settings.bankName}
                onChange={(e) => handleChange('bankName', e.target.value)}
                placeholder="Ej. BBVA"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Beneficiario / Titular
              </label>
              <Input
                value={settings.bankAccountHolder}
                onChange={(e) => handleChange('bankAccountHolder', e.target.value)}
                placeholder="Ej. VATOS ALFA Barber Shop"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                CLABE Interbancaria (18 dígitos)
              </label>
              <Input
                value={settings.bankClabe}
                onChange={(e) => handleChange('bankClabe', e.target.value.replace(/\D/g, '').slice(0, 18))}
                placeholder="012680015523489123"
                className="text-sm font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-semibold text-foreground">
              Instrucción para Comprobante de Pago
            </label>
            <Input
              value={settings.depositInstructions}
              onChange={(e) => handleChange('depositInstructions', e.target.value)}
              placeholder="Por favor compártenos el comprobante por este medio..."
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Mensaje final que {settings.assistantName || 'Janet'} añade tras compartir los datos de transferencia.
            </p>
          </div>
        </CollapsibleCard>

        {/* ======================================================== */}
        {/* 4. MODO DE OPERACIÓN Y TRASPASO HUMANO */}
        {/* ======================================================== */}
        <CollapsibleCard
          icon={ShieldAlert}
          title="4. Modo de Operación y Traspaso a Humano"
          description={`Control de activación del bot y palabras que silencian a ${settings.assistantName || 'Janet'} para dar paso a la recepcionista.`}
        >
          <div className="p-3.5 rounded-xl bg-background border border-border/70 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground block">
                Bot Activo Globalmente
              </span>
              <p className="text-[11px] text-muted-foreground">
                Si está desactivado, {settings.assistantName || 'Janet'} no responderá automáticamente y todas las conversaciones se marcarán directamente como "Humano al mando".
              </p>
            </div>
            <Switch
              checked={settings.botActive}
              onCheckedChange={(val) => handleChange('botActive', val)}
            />
          </div>

          <div className="space-y-2 pt-2">
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
                  desc: 'Fuera de horas de apertura, responde con un mensaje de bienvenida informando el horario de reapertura.',
                },
              ].map((schOpt) => {
                const isSelected = settings.responseSchedule === schOpt.id;
                return (
                  <div
                    key={schOpt.id}
                    onClick={() => handleChange('responseSchedule', schOpt.id as any)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border/70 hover:bg-muted/30'
                    }`}
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

          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Palabras Clave de Traspaso a Humano (Separadas por comas)
              </label>
              <Badge variant="outline" className="text-[10px] py-0 border-amber-500/30 text-amber-600">
                Pausa el Bot
              </Badge>
            </div>
            <Input
              value={settings.takeoverKeywords}
              onChange={(e) => handleChange('takeoverKeywords', e.target.value)}
              placeholder="humano, persona, recepcionista, gerente, queja..."
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Si un cliente escribe alguna de estas palabras, el bot se pausará automáticamente y la conversación pasará a estado <strong>"Requiere Atención"</strong> para que la recepcionista tome el chat.
            </p>
          </div>
        </CollapsibleCard>

        {/* ======================================================== */}
        {/* 5. POLÍTICAS Y PREGUNTAS FRECUENTES (FAQS) */}
        {/* ======================================================== */}
        <CollapsibleCard
          icon={HelpCircle}
          title="5. Políticas y Preguntas Frecuentes (FAQs)"
          description="Tolerancia de puntualidad, edad mínima de niños y referencias del local."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Tolerancia de Puntualidad (Minutos)
              </label>
              <Input
                type="number"
                min={0}
                max={60}
                value={settings.punctualityToleranceMinutes}
                onChange={(e) => handleChange('punctualityToleranceMinutes', Number(e.target.value) || 10)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Minutos tras los cuales una cita se considera inasistencia (No Show).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Edad Mínima para Niños (Años)
              </label>
              <Input
                type="number"
                min={0}
                max={18}
                value={settings.minChildAge}
                onChange={(e) => handleChange('minChildAge', Number(e.target.value) || 3)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Edad a partir de la cual el personal atiende cortes infantiles.
              </p>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-semibold text-foreground">
              Dirección, Referencias de Llegada y Estacionamiento
            </label>
            <Textarea
              value={settings.addressReferences}
              onChange={(e) => handleChange('addressReferences', e.target.value)}
              placeholder="Indica cómo llegar, cruces de calles, si hay cajones de estacionamiento al frente..."
              rows={2}
              className="text-xs leading-relaxed"
            />
          </div>
        </CollapsibleCard>

        {/* Bottom Save Bar */}
        <div className="sticky bottom-4 z-10 flex items-center justify-between p-4 rounded-2xl bg-card/95 backdrop-blur border border-border shadow-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Los cambios se aplican en tiempo real al Asistente {settings.assistantName || 'Janet'} en WhatsApp.
          </div>

          <Button
            type="submit"
            disabled={isSaving}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow text-xs h-9 px-5"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Guardar Configuración
          </Button>
        </div>
      </form>
    </div>
  );
}
