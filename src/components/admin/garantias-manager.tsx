'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/firebase-auth-context';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  ShieldCheck,
  Clock,
  Scissors,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Bot,
  AlertTriangle,
  Sparkles,
  Save,
  Loader2,
  HelpCircle,
  UserCheck,
} from 'lucide-react';

export interface GarantiasConfig {
  activa: boolean;
  titulo: string;
  ventanaHoras: number;
  duracionRetoqueMinutos: number;
  coberturaServicios: string;
  costoRetoque: string;
  criteriosAplica: string[];
  criteriosNoAplica: string[];
  instruccionesJanet: string;
  escalamientoHumano: {
    activo: boolean;
    palabrasClave: string;
    mensajeTransferencia: string;
  };
  actualizado_en?: any;
  actualizado_por?: string;
}

const DEFAULT_CONFIG: GarantiasConfig = {
  activa: true,
  titulo: 'Garantía de Satisfacción Alfa',
  ventanaHoras: 48,
  duracionRetoqueMinutos: 20,
  coberturaServicios:
    'Cortes de cabello clásicos y modernos, fades/desvanecidos, arreglo y perfilado de barba, ceja y patillas.',
  costoRetoque: '100% Gratuito dentro de la ventana de garantía',
  criteriosAplica: [
    'Ajuste de longitud o emparejar si el corte quedó más largo de lo solicitado.',
    'Corrección de asimetría o líneas en el perfilado de barba o patillas.',
    'Pulido de detalles o sombras en el desvanecido (fade).',
    'Revisión y ajuste de detalles que no hayan quedado a entera satisfacción al salir.',
  ],
  criteriosNoAplica: [
    'Cambio radical de estilo o diseño totalmente distinto al solicitado en la cita original.',
    'Cabello o barba recortada o intervenida por cuenta propia o en otra barbería después del servicio.',
    'Reclamos o solicitudes realizadas después de la ventana de garantía (48 horas).',
    'Devolución o reembolso en efectivo o transferencia bancaria.',
  ],
  instruccionesJanet:
    'Cuando un cliente mencione que no le gustó su corte, que quedó chueco, disparejo o pida que se lo arreglen, responde siempre con empatía y calidez inmediata sin discutir ni culpar al cliente. Explícale que en VATOS ALFA cuenta con la Garantía de Satisfacción Alfa de 48 horas para retoques sin costo y ofrécele agendar un espacio de revisión con su barbero o en sucursal. Si el cliente está muy molesto o exige devolución de dinero, solicita atención de recepción humana de inmediato.',
  escalamientoHumano: {
    activo: true,
    palabrasClave:
      'reembolso, devolver dinero, queja formal, quemadura, herida, cortada, sangrado, demanda, profeco, hablar con el dueño, hablar con el encargado, pésimo servicio, negligencia',
    mensajeTransferencia:
      'Entiendo completamente tu situación y tu sentir. En este momento estoy transfiriendo tu caso con nuestro equipo de recepción y gerencia para brindarte una atención personalizada y prioritaria. En breve te contactarán directamente.',
  },
};

export function GarantiasManager() {
  const { toast } = useToast();
  const { db, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<GarantiasConfig>(DEFAULT_CONFIG);

  const [nuevoCriterioAplica, setNuevoCriterioAplica] = useState('');
  const [nuevoCriterioNoAplica, setNuevoCriterioNoAplica] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!db) return;
      try {
        const docRef = doc(db, 'settings', 'garantias');
        const snap = await getDoc(docRef);
        if (snap.exists() && isMounted) {
          const data = snap.data() as Partial<GarantiasConfig>;
          setConfig({
            ...DEFAULT_CONFIG,
            ...data,
            escalamientoHumano: {
              ...DEFAULT_CONFIG.escalamientoHumano,
              ...(data.escalamientoHumano || {}),
            },
            criteriosAplica: Array.isArray(data.criteriosAplica) && data.criteriosAplica.length > 0
              ? data.criteriosAplica
              : DEFAULT_CONFIG.criteriosAplica,
            criteriosNoAplica: Array.isArray(data.criteriosNoAplica) && data.criteriosNoAplica.length > 0
              ? data.criteriosNoAplica
              : DEFAULT_CONFIG.criteriosNoAplica,
          });
        }
      } catch (err) {
        console.error('Error al cargar garantías:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [db]);

  const handleSave = async () => {
    if (!db) return;
    setSaving(true);
    try {
      const payload: GarantiasConfig = {
        ...config,
        ventanaHoras: Number(config.ventanaHoras) || 48,
        duracionRetoqueMinutos: Number(config.duracionRetoqueMinutos) || 20,
        actualizado_en: new Date(),
        actualizado_por: user?.displayName || user?.email || 'Administración',
      };

      await setDoc(doc(db, 'settings', 'garantias'), payload, { merge: true });

      toast({
        title: 'Garantías Actualizadas',
        description: 'Las políticas de garantías y el protocolo de Janet se guardaron exitosamente.',
      });
    } catch (err: any) {
      console.error('Error al guardar garantías:', err);
      toast({
        variant: 'destructive',
        title: 'Error al Guardar',
        description: err?.message || 'No se pudieron guardar las reglas de garantía.',
      });
    } finally {
      setSaving(false);
    }
  };

  const agregarAplica = () => {
    const trimmed = nuevoCriterioAplica.trim();
    if (!trimmed) return;
    setConfig((prev) => ({
      ...prev,
      criteriosAplica: [...prev.criteriosAplica, trimmed],
    }));
    setNuevoCriterioAplica('');
  };

  const eliminarAplica = (idx: number) => {
    setConfig((prev) => ({
      ...prev,
      criteriosAplica: prev.criteriosAplica.filter((_, i) => i !== idx),
    }));
  };

  const agregarNoAplica = () => {
    const trimmed = nuevoCriterioNoAplica.trim();
    if (!trimmed) return;
    setConfig((prev) => ({
      ...prev,
      criteriosNoAplica: [...prev.criteriosNoAplica, trimmed],
    }));
    setNuevoCriterioNoAplica('');
  };

  const eliminarNoAplica = (idx: number) => {
    setConfig((prev) => ({
      ...prev,
      criteriosNoAplica: prev.criteriosNoAplica.filter((_, i) => i !== idx),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Cabecera de Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-400 shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Garantías y Retoques de Satisfacción
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configura las reglas oficiales para clientes inconformes, tiempos de cobertura y el protocolo de respuesta de Janet.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="alfa"
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto h-9 px-4 text-xs font-semibold cursor-pointer shrink-0"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                Guardar Reglas
              </>
            )}
          </Button>
        </div>
      </div>

      {/* TARJETA 1: REGLAS GENERALES DE LA GARANTÍA */}
      <Card className="border border-border/70 shadow-xs overflow-hidden">
        <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Política General de Garantía (Satisfacción Alfa)
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="garantia-activa" className="text-xs text-muted-foreground cursor-pointer">
                {config.activa ? 'Garantía Activa' : 'Desactivada'}
              </Label>
              <Switch
                id="garantia-activa"
                checked={config.activa}
                onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, activa: checked }))}
              />
            </div>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
            Establece el tiempo de validez y la duración estimada en agenda para retoques sin costo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3.5 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Nombre del Programa</Label>
              <Input
                value={config.titulo}
                onChange={(e) => setConfig((prev) => ({ ...prev, titulo: e.target.value }))}
                placeholder="Garantía de Satisfacción Alfa"
                className="h-8 text-xs font-sans"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Ventana de Cobertura</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={12}
                  max={168}
                  step={6}
                  value={config.ventanaHoras}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, ventanaHoras: Number(e.target.value) || 48 }))
                  }
                  className="h-8 text-xs font-sans pr-14"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                  horas
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Tiempo límite tras la cita para solicitar el retoque (recomendado: 48 hrs).
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Tiempo de Retoque en Agenda</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={10}
                  max={60}
                  step={5}
                  value={config.duracionRetoqueMinutos}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      duracionRetoqueMinutos: Number(e.target.value) || 20,
                    }))
                  }
                  className="h-8 text-xs font-sans pr-14"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground font-medium pointer-events-none">
                  minutos
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Espacio que Janet y recepción contemplan para el ajuste (recomendado: 20 min).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Costo del Retoque</Label>
              <Input
                value={config.costoRetoque}
                onChange={(e) => setConfig((prev) => ({ ...prev, costoRetoque: e.target.value }))}
                placeholder="100% Gratuito dentro de la ventana de garantía"
                className="h-8 text-xs font-sans"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Servicios Cubiertos</Label>
              <Input
                value={config.coberturaServicios}
                onChange={(e) => setConfig((prev) => ({ ...prev, coberturaServicios: e.target.value }))}
                placeholder="Cortes clásicos, fades, barba, perfilado y ceja."
                className="h-8 text-xs font-sans"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TARJETA 2: CRITERIOS DE VALIDEZ (QUÉ SÍ APLICA VS QUÉ NO APLICA) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Casos que SÍ Aplican */}
        <Card className="border border-border/70 shadow-xs overflow-hidden">
          <CardHeader className="py-2.5 px-3.5 sm:px-4 border-b border-border/50 bg-muted/10">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Casos que SÍ Aplican para Retoque
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Motivos legítimos donde el cliente tiene derecho a ajuste sin costo.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 space-y-3">
            <div className="space-y-2">
              {config.criteriosAplica.map((item, index) => (
                <div
                  key={`aplica-${index}`}
                  className="flex items-start justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/40 text-xs"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">•</span>
                    <span className="text-foreground leading-relaxed">{item}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminarAplica(index)}
                    className="text-slate-400 hover:text-red-400 p-0.5 shrink-0 transition-colors"
                    title="Eliminar regla"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Input
                placeholder="Agregar nuevo caso válido..."
                value={nuevoCriterioAplica}
                onChange={(e) => setNuevoCriterioAplica(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAplica())}
                className="h-8 text-xs font-sans"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={agregarAplica}
                className="h-8 px-3 text-xs shrink-0 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 mr-1 text-slate-400" />
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Casos que NO Aplican */}
        <Card className="border border-border/70 shadow-xs overflow-hidden">
          <CardHeader className="py-2.5 px-3.5 sm:px-4 border-b border-border/50 bg-muted/10">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-slate-400 shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Casos que NO Aplican (Exclusiones)
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Situaciones que invalidan la garantía para proteger a los barberos y al negocio.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 space-y-3">
            <div className="space-y-2">
              {config.criteriosNoAplica.map((item, index) => (
                <div
                  key={`no-aplica-${index}`}
                  className="flex items-start justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/40 text-xs"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-bold mt-0.5">✕</span>
                    <span className="text-foreground leading-relaxed">{item}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminarNoAplica(index)}
                    className="text-slate-400 hover:text-red-400 p-0.5 shrink-0 transition-colors"
                    title="Eliminar regla"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Input
                placeholder="Agregar nueva exclusión..."
                value={nuevoCriterioNoAplica}
                onChange={(e) => setNuevoCriterioNoAplica(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarNoAplica())}
                className="h-8 text-xs font-sans"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={agregarNoAplica}
                className="h-8 px-3 text-xs shrink-0 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 mr-1 text-slate-400" />
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TARJETA 3: PROTOCOLO INTELIGENTE DE JANET (IA) Y ESCALAMIENTO HUMANO */}
      <Card className="border border-border/70 shadow-xs overflow-hidden">
        <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-400 shrink-0" />
            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
              Protocolo de Atención Inteligente de Janet
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
            Define cómo debe responder Janet cuando un cliente exprese inconformidad en el chat y cuándo transferir a recepción humana.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3.5 sm:p-5 space-y-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">
              Instrucciones Específicas para Janet (Directriz de Empatía y Solución)
            </Label>
            <Textarea
              rows={4}
              value={config.instruccionesJanet}
              onChange={(e) => setConfig((prev) => ({ ...prev, instruccionesJanet: e.target.value }))}
              placeholder="Escribe cómo quieres que Janet reaccione ante una queja o inconformidad..."
              className="text-xs font-sans resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Janet consultará este texto para responder con empatía, explicar la garantía y ofrecer un espacio de retoque sin costo.
            </p>
          </div>

          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold text-foreground">
                  Escalamiento Humano Inmediato (Casos Graves o Disputas)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Si se detectan palabras de conflicto, agresión o exigencia de dinero, Janet transfiere a recepción de inmediato.
                </p>
              </div>
              <Switch
                checked={config.escalamientoHumano.activo}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    escalamientoHumano: { ...prev.escalamientoHumano, activo: checked },
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Palabras Clave de Alerta</Label>
              <Input
                value={config.escalamientoHumano.palabrasClave}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    escalamientoHumano: {
                      ...prev.escalamientoHumano,
                      palabrasClave: e.target.value,
                    },
                  }))
                }
                placeholder="reembolso, queja formal, demanda, cortada, sangrado..."
                className="h-8 text-xs font-sans"
              />
              <p className="text-[10px] text-muted-foreground">
                Términos separados por coma que activan el traspaso a recepción sin polemizar.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Mensaje de Traspaso al Cliente</Label>
              <Textarea
                rows={2}
                value={config.escalamientoHumano.mensajeTransferencia}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    escalamientoHumano: {
                      ...prev.escalamientoHumano,
                      mensajeTransferencia: e.target.value,
                    },
                  }))
                }
                placeholder="Entiendo tu situación. En este momento estoy transfiriendo tu caso con nuestro equipo..."
                className="text-xs font-sans resize-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
