'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/firebase-auth-context';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Bot,
  Save,
  Loader2,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Minus,
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

  // Secciones minimizadas por defecto
  const [openSections, setOpenSections] = useState<{
    general: boolean;
    criterios: boolean;
    protocolo: boolean;
  }>({
    general: false,
    criterios: false,
    protocolo: false,
  });

  const toggleSection = (section: 'general' | 'criterios' | 'protocolo') => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Modal para edición de textos largos
  const [editorModal, setEditorModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    field: 'instruccionesJanet' | 'mensajeTransferencia';
    value: string;
  }>({
    open: false,
    title: '',
    description: '',
    field: 'instruccionesJanet',
    value: '',
  });

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
        description: 'Las políticas de garantías y el protocolo de Janeth se guardaron exitosamente.',
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

  const openEditor = (
    title: string,
    description: string,
    field: 'instruccionesJanet' | 'mensajeTransferencia'
  ) => {
    const val = field === 'instruccionesJanet'
      ? config.instruccionesJanet
      : config.escalamientoHumano.mensajeTransferencia;

    setEditorModal({
      open: true,
      title,
      description,
      field,
      value: val || '',
    });
  };

  const applyEditorModal = () => {
    if (editorModal.field === 'instruccionesJanet') {
      setConfig((prev) => ({ ...prev, instruccionesJanet: editorModal.value }));
    } else {
      setConfig((prev) => ({
        ...prev,
        escalamientoHumano: {
          ...prev.escalamientoHumano,
          mensajeTransferencia: editorModal.value,
        },
      }));
    }
    setEditorModal((prev) => ({ ...prev, open: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 max-w-5xl pb-6">
      {/* Cabecera de Página Oficial y Limpia */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border/60">
        <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">GARANTÍAS</h2>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="alfa"
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-4 text-xs font-semibold cursor-pointer shrink-0"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Guardar
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpenSections({ general: true, criterios: true, protocolo: true })}
            className="text-xs h-8 px-2 flex items-center gap-1 border-border/80 hover:bg-muted font-medium cursor-pointer"
            title="Expandir todas las secciones"
          >
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Expandir</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpenSections({ general: false, criterios: false, protocolo: false })}
            className="text-xs h-8 px-2 flex items-center gap-1 border-border/80 hover:bg-muted font-medium cursor-pointer"
            title="Minimizar todas las secciones"
          >
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Minimizar</span>
          </Button>
        </div>
      </div>

      {/* TARJETA 1: REGLAS GENERALES DE LA GARANTÍA (MINIMIZABLE) */}
      <Card className="border border-border/70 shadow-xs overflow-hidden">
        <CardHeader
          className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('general')}
        >
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
              Política General de Garantía (Satisfacción Alfa)
            </CardTitle>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Label htmlFor="garantia-activa" className="text-xs text-muted-foreground cursor-pointer font-sans">
                  {config.activa ? 'Garantía Activa' : 'Desactivada'}
                </Label>
                <Switch
                  id="garantia-activa"
                  checked={config.activa}
                  onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, activa: checked }))}
                />
              </div>
              <button
                type="button"
                className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                title={openSections.general ? "Minimizar" : "Maximizar"}
                aria-label={openSections.general ? "Minimizar" : "Maximizar"}
              >
                {openSections.general ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </CardHeader>
        {openSections.general && (
          <CardContent className="p-3.5 sm:p-5 space-y-3.5 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
        )}
      </Card>

      {/* TARJETA 2: CRITERIOS DE VALIDEZ (MINIMIZABLE) */}
      <Card className="border border-border/70 shadow-xs overflow-hidden">
        <CardHeader
          className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('criterios')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Criterios de Validez (Casos que Aplican y Exclusiones)
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-sans text-muted-foreground border-border/60 hidden sm:inline-flex">
                {config.criteriosAplica.length} Aplican • {config.criteriosNoAplica.length} Exclusiones
              </Badge>
            </div>
            <button
              type="button"
              className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
              title={openSections.criterios ? "Minimizar" : "Maximizar"}
              aria-label={openSections.criterios ? "Minimizar" : "Maximizar"}
            >
              {openSections.criterios ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </CardHeader>
        {openSections.criterios && (
          <CardContent className="p-3.5 sm:p-5 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Casos que SÍ Aplican */}
              <div className="space-y-2.5 p-3 rounded-xl border border-border/60 bg-muted/5">
                <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Casos que SÍ Aplican para Retoque</span>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {config.criteriosAplica.map((item, index) => (
                    <div
                      key={`aplica-${index}`}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/40 text-xs"
                    >
                      <span className="text-foreground leading-relaxed flex-1 font-sans">{item}</span>
                      <button
                        type="button"
                        onClick={() => eliminarAplica(index)}
                        className="text-slate-400 hover:text-red-400 p-1 shrink-0 transition-colors cursor-pointer"
                        title="Eliminar caso"
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
              </div>

              {/* Casos que NO Aplican */}
              <div className="space-y-2.5 p-3 rounded-xl border border-border/60 bg-muted/5">
                <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                  <XCircle className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Casos que NO Aplican (Exclusiones)</span>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {config.criteriosNoAplica.map((item, index) => (
                    <div
                      key={`no-aplica-${index}`}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/40 text-xs"
                    >
                      <span className="text-foreground leading-relaxed flex-1 font-sans">{item}</span>
                      <button
                        type="button"
                        onClick={() => eliminarNoAplica(index)}
                        className="text-slate-400 hover:text-red-400 p-1 shrink-0 transition-colors cursor-pointer"
                        title="Eliminar exclusión"
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
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* TARJETA 3: PROTOCOLO INTELIGENTE DE JANETH (MINIMIZABLE) */}
      <Card className="border border-border/70 shadow-xs overflow-hidden">
        <CardHeader
          className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('protocolo')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-slate-400 shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Protocolo de Atención Inteligente de Janeth
              </CardTitle>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Label htmlFor="escalamiento-activo" className="text-xs text-muted-foreground cursor-pointer font-sans">
                  {config.escalamientoHumano.activo ? 'Traspaso a Humano Activo' : 'Pausado'}
                </Label>
                <Switch
                  id="escalamiento-activo"
                  checked={config.escalamientoHumano.activo}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => ({
                      ...prev,
                      escalamientoHumano: { ...prev.escalamientoHumano, activo: checked },
                    }))
                  }
                />
              </div>
              <button
                type="button"
                className="p-1 rounded-md text-slate-400 hover:text-foreground transition-colors cursor-pointer"
                title={openSections.protocolo ? "Minimizar" : "Maximizar"}
                aria-label={openSections.protocolo ? "Minimizar" : "Maximizar"}
              >
                {openSections.protocolo ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </CardHeader>
        {openSections.protocolo && (
          <CardContent className="p-0 divide-y divide-border/60 animate-in fade-in duration-200">
            {/* Fila 1: Instrucciones de Empatía para Janeth (Modal) */}
            <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground">
                  Instrucciones Específicas para Janeth (Directriz de Empatía y Solución)
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  openEditor(
                    'Instrucciones de Empatía para Janeth',
                    'Janeth consultará este texto para responder con empatía, explicar la garantía y ofrecer un espacio de retoque sin costo.',
                    'instruccionesJanet'
                  )
                }
                className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
              >
                Editar
              </Button>
            </div>

            {/* Fila 2: Palabras Clave de Alerta */}
            <div className="p-3 sm:px-4 sm:py-2.5 space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Palabras Clave de Traspaso a Recepción (Separadas por comas)
              </Label>
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
            </div>

            {/* Fila 3: Mensaje de Traspaso al Cliente (Modal) */}
            <div className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-foreground">
                  Mensaje de Traspaso al Cliente
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  openEditor(
                    'Mensaje de Traspaso a Recepción Humana',
                    'Mensaje inmediato que Janeth envía al cliente cuando se detectan palabras clave de inconformidad grave.',
                    'mensajeTransferencia'
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

      {/* MODAL OFICIAL PARA TEXTOS LARGOS */}
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

          <div className="flex-1 flex flex-col min-h-0 space-y-2 p-4 sm:p-5 overflow-y-auto">
            <Textarea
              value={editorModal.value}
              onChange={(e) => setEditorModal((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="Escribe aquí el texto..."
              className="flex-1 min-h-[220px] sm:min-h-[280px] text-xs sm:text-sm font-sans leading-relaxed resize-none p-3.5 rounded-xl border-border/80 focus:border-blue-500"
            />
          </div>

          <div className="p-3 sm:p-4 bg-muted/15 border-t border-border/50 flex items-center justify-end gap-2 shrink-0">
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
              onClick={applyEditorModal}
              className="h-8 text-xs font-semibold cursor-pointer"
            >
              Aplicar Cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
