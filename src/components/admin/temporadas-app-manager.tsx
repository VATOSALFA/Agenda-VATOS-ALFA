'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Sparkles,
    Calendar,
    Sliders,
    Save,
    RefreshCw,
    CheckCircle2,
    Smartphone,
    Globe,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit-logger';
import { cn } from '@/lib/utils';

export type TemaTemporadaId =
    | 'ninguno'
    | 'halloween'
    | 'dia_muertos'
    | 'navidad'
    | 'ano_nuevo'
    | 'san_valentin'
    | 'primavera'
    | 'dia_madres'
    | 'dia_padre'
    | 'patrias';

export interface TemporadaAppConfig {
    activo: boolean;
    mostrarEnApp: boolean;
    mostrarEnWeb: boolean;
    mostrarEnAgenda: boolean;
    modo: 'automatico' | 'manual';
    temaForzado: TemaTemporadaId;
    intensidad: 'sutil' | 'normal';
    actualizado_el?: any;
    actualizado_por?: string;
}

export const DEFAULT_TEMPORADA_CONFIG: TemporadaAppConfig = {
    activo: true,
    mostrarEnApp: true,
    mostrarEnWeb: true,
    mostrarEnAgenda: true,
    modo: 'automatico',
    temaForzado: 'halloween',
    intensidad: 'sutil',
};

export const TEMAS_CATALOGO: {
    id: TemaTemporadaId;
    nombre: string;
    emoji: string;
    fechasAuto: string;
    descripcion: string;
}[] = [
    {
        id: 'halloween',
        nombre: 'Halloween Nocturno (3D)',
        emoji: '🕷️',
        fechasAuto: '12 al 29 de Octubre',
        descripcion:
            'Telaraña fija en la esquina superior izquierda y araña Viuda Negra 3D descolgándose desde arriba con hilo de seda continuo.',
    },
    {
        id: 'dia_muertos',
        nombre: 'Día de Muertos (Cempasúchil & Calaverita)',
        emoji: '🌼',
        fechasAuto: '30 de Octubre al 4 de Noviembre',
        descripcion:
            'Altar con Calaverita de Azúcar y flores en la esquina superior + lluvia de flores completas de Cempasúchil 3D.',
    },
    {
        id: 'navidad',
        nombre: 'Navidad & Invierno (Gorro + Nevada 3D)',
        emoji: '🎅',
        fechasAuto: '25 de Noviembre al 30 de Diciembre',
        descripcion:
            'Gorrito de Santa en terciopelo rojo fijo en la esquina superior izquierda + nevada realista con cristales de hielo y efecto Bokeh.',
    },
    {
        id: 'ano_nuevo',
        nombre: 'Año Nuevo & Día de Reyes (Carritos de Juguete)',
        emoji: '🏎️',
        fechasAuto: '31 de Diciembre al 7 de Enero',
        descripcion:
            'Corona de Reyes Magos en la esquina superior y carritos clásicos de juguete con llave de cuerda pasando por la pantalla.',
    },
    {
        id: 'san_valentin',
        nombre: 'San Valentín (Corazón 3D & Pétalos)',
        emoji: '💘',
        fechasAuto: '1 al 16 de Febrero',
        descripcion:
            'Corazón 3D flechado fijo en la esquina superior izquierda acompañado de corazones rubí y pétalos de rosa cayendo.',
    },
    {
        id: 'primavera',
        nombre: 'Inicio de Primavera (Jardín Creciendo)',
        emoji: '🌱',
        fechasAuto: '18 al 26 de Marzo',
        descripcion:
            'Enredaderas botánicas, tallos verdes y flores de primavera creciendo orgánicamente desde la parte inferior de la pantalla.',
    },
    {
        id: 'dia_madres',
        nombre: 'Día de las Madres (Rosas Rojas 3D)',
        emoji: '🌹',
        fechasAuto: '1 al 12 de Mayo',
        descripcion:
            'Rosa roja con tallo y hojas fija en la esquina superior izquierda + lluvia de botones de rosas rojas completas en 3D.',
    },
    {
        id: 'dia_padre',
        nombre: 'Día del Padre (Mostacho Imperial & Corona)',
        emoji: '🎩',
        fechasAuto: '10 al 22 de Junio',
        descripcion:
            'Emblema de Corona Dorada, Mostacho Imperial y Moño de Gala en la esquina + lluvia de bigotes 3D, moños y navajas clásicas de barbería.',
    },
    {
        id: 'patrias',
        nombre: 'Fiestas Patrias México (Bandera Ondeando)',
        emoji: '🇲🇽',
        fechasAuto: '1 al 17 de Septiembre',
        descripcion:
            'Bandera de México 3D ondeando en su asta dorada en la esquina superior + lluvia abundante de serpentinas metálicas y escarapelas tricolores.',
    },
];

export function detectAutoSeason(date = new Date()): TemaTemporadaId {
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if (month === 1 && day >= 1 && day <= 7) return 'ano_nuevo';
    if (month === 2 && day >= 1 && day <= 16) return 'san_valentin';
    if (month === 3 && day >= 18 && day <= 26) return 'primavera';
    if (month === 5 && day >= 1 && day <= 12) return 'dia_madres';
    if (month === 6 && day >= 10 && day <= 22) return 'dia_padre';
    if (month === 9 && day >= 1 && day <= 17) return 'patrias';
    if (month === 10 && day >= 12 && day <= 29) return 'halloween';
    if ((month === 10 && day >= 30) || (month === 11 && day <= 4)) return 'dia_muertos';
    if ((month === 11 && day >= 25) || (month === 12 && day <= 30)) return 'navidad';
    if (month === 12 && day === 31) return 'ano_nuevo';

    return 'ninguno';
}

export function TemporadasAppManager() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [config, setConfig] = useState<TemporadaAppConfig>(DEFAULT_TEMPORADA_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const unsub = onSnapshot(
            doc(db, 'configuracion', 'app_movil'),
            (snap) => {
                if (!isMounted) return;
                setLoading(false);
                if (snap.exists()) {
                    const data = snap.data();
                    const rawTemp = data?.temporada_config || data?.pase_alfa?.temporada_config;

                    if (rawTemp) {
                        const savedTheme =
                            rawTemp.temaForzado === 'buen_fin' || rawTemp.temaForzado === 'aniversario'
                                ? 'halloween'
                                : rawTemp.temaForzado || 'halloween';

                        setConfig({
                            activo: rawTemp.activo !== undefined ? Boolean(rawTemp.activo) : true,
                            mostrarEnApp: rawTemp.mostrarEnApp !== undefined ? Boolean(rawTemp.mostrarEnApp) : true,
                            mostrarEnWeb: rawTemp.mostrarEnWeb !== undefined ? Boolean(rawTemp.mostrarEnWeb) : true,
                            mostrarEnAgenda: rawTemp.mostrarEnAgenda !== undefined ? Boolean(rawTemp.mostrarEnAgenda) : true,
                            modo: rawTemp.modo === 'manual' ? 'manual' : 'automatico',
                            temaForzado: savedTheme,
                            intensidad: rawTemp.intensidad === 'normal' ? 'normal' : 'sutil',
                        });
                    }
                }
            },
            (err) => {
                console.warn('Error escuchando temporada_config:', err);
                if (isMounted) setLoading(false);
            }
        );

        return () => {
            isMounted = false;
            unsub();
        };
    }, []);

    const autoDetectedTheme = useMemo(() => detectAutoSeason(new Date()), []);

    const activeEffectiveTheme: TemaTemporadaId = useMemo(() => {
        if (!config.activo) return 'ninguno';
        if (config.modo === 'manual') return config.temaForzado;
        return autoDetectedTheme;
    }, [config, autoDetectedTheme]);

    const persistConfig = async (nextConfig: TemporadaAppConfig, silent = false) => {
        setConfig(nextConfig);
        setSaving(true);
        try {
            const effectiveTheme = !nextConfig.activo
                ? 'ninguno'
                : nextConfig.modo === 'manual'
                ? nextConfig.temaForzado
                : autoDetectedTheme;

            const payload: TemporadaAppConfig = {
                activo: Boolean(nextConfig.activo),
                mostrarEnApp: Boolean(nextConfig.mostrarEnApp !== false),
                mostrarEnWeb: Boolean(nextConfig.mostrarEnWeb !== false),
                mostrarEnAgenda: Boolean(nextConfig.mostrarEnAgenda !== false),
                modo: nextConfig.modo,
                temaForzado: nextConfig.temaForzado,
                intensidad: nextConfig.intensidad,
                actualizado_el: Timestamp.now(),
                actualizado_por: user?.email || 'admin',
            };

            await Promise.all([
                setDoc(
                    doc(db, 'configuracion', 'app_movil'),
                    {
                        temporada_config: payload,
                        actualizado_el: Timestamp.now(),
                    },
                    { merge: true }
                ),
                setDoc(
                    doc(db, 'configuracion', 'pase_alfa'),
                    {
                        temporada_config: payload,
                        actualizado_el: Timestamp.now(),
                    },
                    { merge: true }
                ),
                setDoc(
                    doc(db, 'settings', 'website'),
                    {
                        temporada_config: payload,
                        actualizado_el: Timestamp.now(),
                    },
                    { merge: true }
                ),
            ]);

            if (!silent) {
                const meta = TEMAS_CATALOGO.find((t) => t.id === effectiveTheme);
                toast({
                    title: nextConfig.activo
                        ? `¡Efecto Activo: ${meta ? `${meta.emoji} ${meta.nombre}` : 'Modo Calendario'}!`
                        : 'Efectos de Temporada Desactivados',
                    description: 'Sincronizado en tiempo real con la App Móvil, el Sitio Web y la Agenda.',
                });
            }
        } catch (err: any) {
            toast({
                title: 'Error al sincronizar temporada',
                description: err?.message || 'No se pudo guardar la configuración de temporada.',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        await persistConfig(config, false);
        await logAuditAction({
            action: 'ACTUALIZAR_TEMPORADA_APP',
            userId: user?.uid || (user as any)?.id || 'admin',
            userName: user?.displayName || user?.email || 'Administrador',
            details: `Efectos de temporada actualizados. Activo: ${config.activo}, Modo: ${config.modo}, Tema: ${activeEffectiveTheme}`,
            severity: 'info',
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-[#C5A880]" />
                <span>Cargando configuración de temporadas...</span>
            </div>
        );
    }

    const currentThemeMeta = TEMAS_CATALOGO.find((t) => t.id === activeEffectiveTheme);

    return (
        <div className="space-y-5">
            {/* Barra Superior con Interruptor Maestro y Guardar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-[#C5A880]/40 bg-gradient-to-r from-[#10172b] via-[#18223f] to-[#10172b] text-white shadow-md">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-[#C5A880]" />
                        <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                            Ambientación Realista 3D por Temporada
                        </h3>
                        <Badge
                            className={cn(
                                'text-[10px] px-2 py-0.5 font-bold',
                                config.activo
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-slate-700 text-slate-300'
                            )}
                        >
                            {config.activo ? 'Sincronizado en Vivo' : 'Desactivado'}
                        </Badge>
                    </div>
                    <p className="text-xs text-slate-300 max-w-2xl">
                        Sincronización simultánea en la App Móvil, el Sitio Web de reservas y la Agenda (para Staff y Recepción). Haz clic en cualquier festividad para activarla en vivo.
                    </p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/15">
                        <span className="text-xs font-medium text-slate-200">Mostrar Efectos</span>
                        <Switch
                            checked={config.activo}
                            onCheckedChange={(val) => {
                                persistConfig({ ...config, activo: val });
                            }}
                        />
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-[#C5A880] hover:bg-[#b09268] text-black font-bold text-xs shadow-md flex items-center gap-1.5 h-9 px-4 rounded-xl"
                    >
                        {saving ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                <span>Sincronizando...</span>
                            </>
                        ) : (
                            <>
                                <Save className="h-3.5 w-3.5" />
                                <span>Guardar Temporada</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Columna Izquierda (2/3): Canales, Modo y Selección de Tema */}
                <div className="lg:col-span-2 space-y-5">
                    {/* 0. Canales de Visualización (¿Dónde mostrar los efectos?) */}
                    <Card className="border-border/60 shadow-xs">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Sliders className="h-4 w-4 text-[#C5A880]" />
                                Canales de Visualización (¿Dónde mostrar las ambientaciones?)
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Elige con precisión en qué plataformas activar la ambientación temática festiva.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* 1. App Móvil */}
                            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Smartphone className="h-4 w-4 text-[#C5A880]" />
                                            <span className="text-xs font-bold text-foreground">App Móvil</span>
                                        </div>
                                        <Switch
                                            checked={config.mostrarEnApp}
                                            onCheckedChange={(val) => persistConfig({ ...config, mostrarEnApp: val })}
                                        />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Clientes en la aplicación móvil de VATOS ALFA (iOS & Android).
                                    </p>
                                </div>
                                <Badge className={cn("text-[9px] px-1.5 py-0 font-bold w-fit", config.mostrarEnApp ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-slate-700 text-slate-400")}>
                                    {config.mostrarEnApp ? '✓ Activo en App' : '✕ Oculto en App'}
                                </Badge>
                            </div>

                            {/* 2. Página Web */}
                            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Globe className="h-4 w-4 text-[#C5A880]" />
                                            <span className="text-xs font-bold text-foreground">Página Web</span>
                                        </div>
                                        <Switch
                                            checked={config.mostrarEnWeb}
                                            onCheckedChange={(val) => persistConfig({ ...config, mostrarEnWeb: val })}
                                        />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Portal de agendamiento en línea para clientes desde PC y navegadores móviles.
                                    </p>
                                </div>
                                <Badge className={cn("text-[9px] px-1.5 py-0 font-bold w-fit", config.mostrarEnWeb ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-slate-700 text-slate-400")}>
                                    {config.mostrarEnWeb ? '✓ Activo en Web' : '✕ Oculto en Web'}
                                </Badge>
                            </div>

                            {/* 3. Agenda Staff & Recepción */}
                            <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-4 w-4 text-[#C5A880]" />
                                            <span className="text-xs font-bold text-foreground">Agenda Staff</span>
                                        </div>
                                        <Switch
                                            checked={config.mostrarEnAgenda}
                                            onCheckedChange={(val) => persistConfig({ ...config, mostrarEnAgenda: val })}
                                        />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Panel diario de citas, cobros y ventas para barberos y recepción.
                                    </p>
                                </div>
                                <Badge className={cn("text-[9px] px-1.5 py-0 font-bold w-fit", config.mostrarEnAgenda ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-slate-700 text-slate-400")}>
                                    {config.mostrarEnAgenda ? '✓ Activo en Agenda' : '✕ Oculto en Agenda'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 1. Selector de Modo: Automático vs Manual */}
                    <Card className="border-border/60 shadow-xs">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-[#C5A880]" />
                                Modo de Activación Anual
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Elige si la app cambia sola según el calendario de festividades de México o si deseas fijar un tema manualmente hoy mismo.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Automático */}
                                <div
                                    onClick={() => persistConfig({ ...config, activo: true, modo: 'automatico' })}
                                    className={cn(
                                        'cursor-pointer p-4 rounded-xl border transition-all relative flex flex-col justify-between',
                                        config.modo === 'automatico'
                                            ? 'border-[#C5A880] bg-[#C5A880]/10 ring-1 ring-[#C5A880]'
                                            : 'border-border/60 bg-muted/20 hover:bg-muted/40'
                                    )}
                                >
                                    {config.modo === 'automatico' && (
                                        <CheckCircle2 className="h-4 w-4 text-[#C5A880] absolute top-3 right-3" />
                                    )}
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Calendar className="h-4 w-4 text-[#C5A880]" />
                                            <span className="text-xs font-bold text-foreground">Automático por Calendario</span>
                                            <Badge className="bg-[#C5A880] text-black text-[9px] px-1.5 py-0 h-3.5 font-bold">
                                                Recomendado
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Recorre automáticamente las 9 festividades del año y vuelve al modo normal cuando concluye cada fecha.
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-border/40 text-[11px] font-semibold text-[#C5A880]">
                                        Detectado hoy:{' '}
                                        {autoDetectedTheme === 'ninguno'
                                            ? 'Sin festividad hoy (Modo normal)'
                                            : TEMAS_CATALOGO.find((t) => t.id === autoDetectedTheme)?.nombre}
                                    </div>
                                </div>

                                {/* Manual */}
                                <div
                                    onClick={() => persistConfig({ ...config, activo: true, modo: 'manual' })}
                                    className={cn(
                                        'cursor-pointer p-4 rounded-xl border transition-all relative flex flex-col justify-between',
                                        config.modo === 'manual'
                                            ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                                            : 'border-border/60 bg-muted/20 hover:bg-muted/40'
                                    )}
                                >
                                    {config.modo === 'manual' && (
                                        <CheckCircle2 className="h-4 w-4 text-blue-500 absolute top-3 right-3" />
                                    )}
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Sliders className="h-4 w-4 text-blue-500" />
                                            <span className="text-xs font-bold text-foreground">Selección Manual</span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Tú decides qué efecto mostrar en este momento sin importar la fecha del año (ideal para previsualizar o celebrar eventos).
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-border/40 text-[11px] font-semibold text-blue-400">
                                        Sincronización inmediata al tocar cualquier tarjeta
                                    </div>
                                </div>
                            </div>

                            {/* Selector de Intensidad */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border/40">
                                <div>
                                    <Label className="text-xs font-bold">Densidad de Elementos Visuales</Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Ajusta la cantidad de elementos animados en pantalla.
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {(['sutil', 'normal'] as const).map((nivel) => (
                                        <Button
                                            key={nivel}
                                            type="button"
                                            size="sm"
                                            variant={config.intensidad === nivel ? 'default' : 'outline'}
                                            onClick={() => persistConfig({ ...config, intensidad: nivel })}
                                            className={cn(
                                                'h-8 text-xs font-semibold capitalize px-3',
                                                config.intensidad === nivel && 'bg-[#202A49] text-white'
                                            )}
                                        >
                                            {nivel === 'sutil' ? '✨ Sutil (Elegante)' : '🎉 Normal (Festivo)'}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 2. Catálogo Anual de Festividades */}
                    <Card className="border-border/60 shadow-xs">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-bold">
                                Calendario Anual de Festividades ({TEMAS_CATALOGO.length} Temas Realistas)
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Haz clic en cualquier festividad para activarla y verla en tiempo real tanto en el simulador como en la App Móvil.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {TEMAS_CATALOGO.map((tema) => {
                                const isCurrentActive = activeEffectiveTheme === tema.id && config.activo;
                                return (
                                    <div
                                        key={tema.id}
                                        onClick={() => {
                                            persistConfig({
                                                ...config,
                                                activo: true,
                                                modo: 'manual',
                                                temaForzado: tema.id,
                                            });
                                        }}
                                        className={cn(
                                            'cursor-pointer p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2',
                                            isCurrentActive
                                                ? 'border-[#C5A880] bg-[#C5A880]/10 ring-1 ring-[#C5A880] shadow-xs'
                                                : 'border-border/60 bg-card hover:border-border hover:bg-muted/20'
                                        )}
                                    >
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{tema.emoji}</span>
                                                    <span className="text-xs font-bold text-foreground">
                                                        {tema.nombre}
                                                    </span>
                                                </div>
                                                {isCurrentActive && (
                                                    <Badge className="bg-emerald-500 text-black text-[9px] font-black px-1.5 py-0 h-4">
                                                        ACTIVO
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                {tema.descripcion}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px]">
                                            <span className="text-muted-foreground font-medium">Fecha automática:</span>
                                            <span className="font-semibold text-[#C5A880]">{tema.fechasAuto}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>

                {/* Columna Derecha (1/3): Simulador Realista en Vivo */}
                <Card className="border-border/60 shadow-xs flex flex-col justify-between overflow-hidden h-fit sticky top-4">
                    <CardHeader className="pb-3 border-b border-border/40">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Smartphone className="h-4 w-4 text-[#C5A880]" />
                            Vista Previa Realista 3D
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Emblema fijo en esquina + animaciones temáticas personalizadas.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-4 flex flex-col items-center justify-center">
                        {/* Marco de Teléfono */}
                        <div className="w-full max-w-[280px] min-h-[270px] rounded-[30px] border-4 border-slate-800 bg-[#F8F9FC] shadow-2xl overflow-hidden relative flex flex-col justify-between">
                            {/* Capa de Efectos Realistas sobre todo el teléfono */}
                            <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
                                {/* 1. HALLOWEEN 3D: Telaraña Fija + Araña con Hilo Continuo Desde Arriba */}
                                {activeEffectiveTheme === 'halloween' && (
                                    <>
                                        <svg className="absolute top-0 left-0 w-20 h-20 opacity-90" viewBox="0 0 96 96">
                                            <path
                                                d="M0 0 L92 12 M0 0 L80 38 M0 0 L62 62 M0 0 L38 80 M0 0 L12 92"
                                                stroke="rgba(255,255,255,0.4)"
                                                strokeWidth="0.9"
                                                fill="none"
                                            />
                                            <path
                                                d="M22 3 Q19 11 16 16 Q11 19 3 22 M40 5 Q35 18 28 28 Q18 35 5 40 M58 8 Q50 26 40 40 Q26 50 8 58"
                                                stroke="rgba(226,232,240,0.35)"
                                                strokeWidth="0.8"
                                                fill="none"
                                            />
                                            <circle cx="28" cy="28" r="1.3" fill="rgba(255,255,255,0.75)" />
                                            <circle cx="40" cy="40" r="1.5" fill="rgba(255,255,255,0.65)" />
                                        </svg>

                                        {/* Araña Viuda Negra con Hilo Largo Anclado Arriba (-36px) para nunca cortarse */}
                                        <div
                                            className="absolute -top-9 right-10 animate-bounce"
                                            style={{ animationDuration: '3.2s' }}
                                        >
                                            <svg width="46" height="155" viewBox="0 0 58 185">
                                                <defs>
                                                    <radialGradient id="prevAbdomen" cx="38%" cy="32%" r="65%">
                                                        <stop offset="0%" stopColor="#475569" />
                                                        <stop offset="40%" stopColor="#1E293B" />
                                                        <stop offset="100%" stopColor="#020408" />
                                                    </radialGradient>
                                                </defs>
                                                <line x1="29" y1="0" x2="29" y2="138" stroke="rgba(226,232,240,0.85)" strokeWidth="1.2" />
                                                <g stroke="#1E293B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
                                                    <path d="M25 153 L14 142 L7 147 L3 154" />
                                                    <path d="M24 155 L11 150 L5 157 L2 164" />
                                                    <path d="M24 157 L12 159 L6 167 L4 174" />
                                                    <path d="M26 159 L16 166 L11 175 L9 181" />
                                                    <path d="M33 153 L44 142 L51 147 L55 154" />
                                                    <path d="M34 155 L47 150 L53 157 L56 164" />
                                                    <path d="M34 157 L46 159 L52 167 L54 174" />
                                                    <path d="M32 159 L42 166 L47 175 L49 181" />
                                                </g>
                                                <ellipse cx="29" cy="143" rx="7.2" ry="9" fill="url(#prevAbdomen)" stroke="#334155" strokeWidth="0.5" />
                                                <path d="M27 139 L31 139 L29.4 143 L31 147 L27 147 L28.6 143 Z" fill="#DC2626" />
                                                <ellipse cx="29" cy="155.5" rx="4.8" ry="4.5" fill="url(#prevAbdomen)" />
                                                <circle cx="27.5" cy="158.5" r="0.9" fill="#F59E0B" />
                                                <circle cx="30.5" cy="158.5" r="0.9" fill="#F59E0B" />
                                            </svg>
                                        </div>
                                    </>
                                )}

                                {/* 2. DÍA DE MUERTOS: Calaverita + Flores Fijas en Esquina + Flores Completas de Cempasúchil */}
                                {activeEffectiveTheme === 'dia_muertos' && (
                                    <>
                                        {/* Esquina Superior Izquierda: Calaverita de Azúcar y Cempasúchil */}
                                        <svg className="absolute top-1 left-1 w-20 h-16" viewBox="0 0 90 70">
                                            <path
                                                d="M0 0 L44 0 L44 24 L36 19 L28 24 L20 19 L12 24 L0 19 Z"
                                                fill="#9333EA"
                                                opacity="0.8"
                                            />
                                            <g transform="translate(4, 8)">
                                                <path
                                                    d="M8 18 C8 8, 30 8, 30 18 C30 22, 27 25, 25 27 L25 32 C25 34, 13 34, 13 32 L13 27 C11 25, 8 22, 8 18 Z"
                                                    fill="#FFFBEB"
                                                    stroke="#F59E0B"
                                                    strokeWidth="1"
                                                />
                                                <circle cx="15" cy="19" r="3.5" fill="#1E1B4B" stroke="#F97316" strokeWidth="1" />
                                                <circle cx="23" cy="19" r="3.5" fill="#1E1B4B" stroke="#F97316" strokeWidth="1" />
                                                <circle cx="15" cy="19" r="1.2" fill="#FACC15" />
                                                <circle cx="23" cy="19" r="1.2" fill="#FACC15" />
                                                <path d="M19 22 L17.2 25 L20.8 25 Z" fill="#1E1B4B" />
                                                <line x1="14" y1="29" x2="24" y2="29" stroke="#1E1B4B" strokeWidth="1" />
                                            </g>
                                        </svg>

                                        {/* Flores Completas Pom-Pom de Cempasúchil Cayendo */}
                                        <div className="absolute inset-0 flex justify-around items-start pt-4">
                                            {[0, 1, 2, 3].map((i) => (
                                                <svg
                                                    key={i}
                                                    width="26"
                                                    height="26"
                                                    viewBox="0 0 40 40"
                                                    className="animate-bounce"
                                                    style={{
                                                        marginTop: (i % 3) * 26,
                                                        animationDuration: `${2.5 + i * 0.35}s`,
                                                    }}
                                                >
                                                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                                                        <path
                                                            key={deg}
                                                            d="M20 20 C16.5 11, 15.5 4.5, 18.2 3.5 C19.3 3, 20.7 3, 21.8 3.5 C24.5 4.5, 23.5 11, 20 20 Z"
                                                            fill="#F97316"
                                                            stroke="#EA580C"
                                                            strokeWidth="0.4"
                                                            transform={`rotate(${deg} 20 20)`}
                                                        />
                                                    ))}
                                                    {[15, 60, 105, 150, 195, 240, 285, 330].map((deg) => (
                                                        <path
                                                            key={deg}
                                                            d="M20 20 C17.2 13, 16.5 8, 18.6 7 C19.5 6.5, 20.5 6.5, 21.4 7 C23.5 8, 22.8 13, 20 20 Z"
                                                            fill="#FACC15"
                                                            transform={`rotate(${deg} 20 20)`}
                                                        />
                                                    ))}
                                                    <circle cx="20" cy="20" r="3.5" fill="#EA580C" />
                                                </svg>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* 3. NAVIDAD: Gorrito de Santa Fijo en Esquina + Nevada */}
                                {activeEffectiveTheme === 'navidad' && (
                                    <>
                                        {/* Gorrito de Santa 3D en Esquina Superior Izquierda */}
                                        <svg className="absolute top-1 left-1 w-16 h-14 z-30" viewBox="0 0 92 82">
                                            <path
                                                d="M12 42 C16 14, 46 6, 68 26 C74 32, 77 42, 73 50 C66 42, 56 32, 46 36 L12 42 Z"
                                                fill="#DC2626"
                                            />
                                            <path
                                                d="M6 42 C6 36, 16 34, 30 35 C44 36, 56 40, 56 46 C56 52, 44 54, 28 52 C14 50, 6 48, 6 42 Z"
                                                fill="#FFFFFF"
                                                stroke="#CBD5E1"
                                                strokeWidth="1"
                                            />
                                            <circle cx="73" cy="52" r="9" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
                                        </svg>

                                        <div className="absolute inset-0 flex justify-around items-start pt-2">
                                            {[0, 1, 2, 3, 4].map((i) => (
                                                <svg
                                                    key={i}
                                                    width="20"
                                                    height="20"
                                                    viewBox="0 0 32 32"
                                                    className="animate-pulse"
                                                    style={{ marginTop: (i % 3) * 22 }}
                                                >
                                                    <circle cx="16" cy="16" r="10" fill="rgba(224,242,254,0.22)" />
                                                    <g stroke="#FFFFFF" strokeLinecap="round" strokeWidth="1.4">
                                                        <line x1="16" y1="4" x2="16" y2="28" />
                                                        <line x1="5.5" y1="10" x2="26.5" y2="22" />
                                                        <line x1="26.5" y1="10" x2="5.5" y2="22" />
                                                    </g>
                                                </svg>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* 4. AÑO NUEVO & DÍA DE REYES: Corona de Reyes + Carritos de Juguete Pasando */}
                                {activeEffectiveTheme === 'ano_nuevo' && (
                                    <>
                                        {/* Corona de Reyes Magos en Esquina Superior Izquierda */}
                                        <svg className="absolute top-1 left-2 w-14 h-12" viewBox="0 0 86 68">
                                            <path
                                                d="M14 42 L10 16 L26 28 L40 10 L54 28 L70 16 L66 42 Z"
                                                fill="#F59E0B"
                                                stroke="#78350F"
                                                strokeWidth="1.2"
                                            />
                                            <circle cx="26" cy="34" r="3" fill="#10B981" />
                                            <circle cx="40" cy="33" r="3.5" fill="#EF4444" />
                                            <circle cx="54" cy="34" r="3" fill="#3B82F6" />
                                        </svg>

                                        {/* Carritos de Juguete con Llave de Cuerda Pasando */}
                                        <div className="absolute top-14 left-6 animate-pulse">
                                            <svg width="62" height="32" viewBox="0 0 76 40">
                                                <line x1="6" y1="20" x2="13" y2="20" stroke="#FBBF24" strokeWidth="2" />
                                                <circle cx="5" cy="16.5" r="3" stroke="#F59E0B" strokeWidth="1.6" fill="none" />
                                                <circle cx="5" cy="23.5" r="3" stroke="#F59E0B" strokeWidth="1.6" fill="none" />
                                                <path
                                                    d="M12 26 C12 20, 16 18, 22 18 L29 10 C33 7, 45 7, 50 11 L57 18 L66 19 C71 20, 73 23, 73 27 L72 30 C72 31.5, 70 32, 67 32 L16 32 C13 32, 12 30, 12 26 Z"
                                                    fill="#EF4444"
                                                />
                                                <path d="M31 11.5 C34 9, 44 9, 48 12 L53 18 L25 18 Z" fill="#38BDF8" />
                                                <circle cx="25" cy="31" r="6" fill="#0F172A" />
                                                <circle cx="25" cy="31" r="3" fill="#E2E8F0" />
                                                <circle cx="58" cy="31" r="6" fill="#0F172A" />
                                                <circle cx="58" cy="31" r="3" fill="#E2E8F0" />
                                            </svg>
                                        </div>

                                        <div className="absolute bottom-4 right-5 animate-bounce" style={{ animationDuration: '2.2s' }}>
                                            <svg width="58" height="30" viewBox="0 0 76 40">
                                                <path
                                                    d="M12 26 C12 20, 16 18, 22 18 L29 10 C33 7, 45 7, 50 11 L57 18 L66 19 C71 20, 73 23, 73 27 L72 30 C72 31.5, 70 32, 67 32 L16 32 C13 32, 12 30, 12 26 Z"
                                                    fill="#2563EB"
                                                />
                                                <path d="M31 11.5 C34 9, 44 9, 48 12 L53 18 L25 18 Z" fill="#BAE6FD" />
                                                <circle cx="25" cy="31" r="6" fill="#0F172A" />
                                                <circle cx="25" cy="31" r="3" fill="#E2E8F0" />
                                                <circle cx="58" cy="31" r="6" fill="#0F172A" />
                                                <circle cx="58" cy="31" r="3" fill="#E2E8F0" />
                                            </svg>
                                        </div>
                                    </>
                                )}

                                {/* 5. SAN VALENTÍN: Corazón 3D Flechado Fijo en Esquina + Corazones y Pétalos */}
                                {activeEffectiveTheme === 'san_valentin' && (
                                    <>
                                        <svg className="absolute top-1 left-1 w-14 h-14 z-30" viewBox="0 0 86 76">
                                            <line x1="8" y1="54" x2="68" y2="14" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />
                                            <path
                                                d="M38 58 C38 58, 12 42, 12 24 C12 14, 20 8, 28 8 C33 8, 38 12, 38 16 C38 12, 43 8, 48 8 C56 8, 64 14, 64 24 C64 42, 38 58, 38 58 Z"
                                                fill="#E11D48"
                                                stroke="#FECDD3"
                                                strokeWidth="1.2"
                                            />
                                            <ellipse cx="25" cy="19" rx="5" ry="2.8" fill="rgba(255,255,255,0.55)" transform="rotate(-28 25 19)" />
                                        </svg>

                                        <div className="absolute inset-0 flex justify-around items-start pt-4">
                                            {[0, 1, 2, 3].map((i) => (
                                                <svg
                                                    key={i}
                                                    width="20"
                                                    height="20"
                                                    viewBox="0 0 32 32"
                                                    className="animate-bounce"
                                                    style={{
                                                        marginTop: (i % 3) * 24,
                                                        animationDuration: `${2.4 + i * 0.3}s`,
                                                    }}
                                                >
                                                    <path
                                                        d="M16 27 C16 27, 4 19.5, 4 10.5 C4 6, 7.5 3, 11.5 3 C14 3, 16 5, 16 7 C16 5, 18 3, 20.5 3 C24.5 3, 28 6, 28 10.5 C28 19.5, 16 27, 16 27 Z"
                                                        fill={i % 2 === 0 ? '#E11D48' : '#FB7185'}
                                                    />
                                                </svg>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* 6. DÍA DE LAS MADRES: Rosa Roja con Tallo en Esquina + Rosas Rojas Completas */}
                                {activeEffectiveTheme === 'dia_madres' && (
                                    <>
                                        {/* Rosa Roja Fija en Esquina Superior Izquierda */}
                                        <svg className="absolute top-1 left-1 w-14 h-16 z-30" viewBox="0 0 48 56">
                                            <path d="M24 28 Q26 40 20 52" stroke="#15803D" strokeWidth="3" strokeLinecap="round" fill="none" />
                                            <path d="M24 36 C32 33, 39 37, 36 43 C31 44, 26 40, 24 36 Z" fill="#16A34A" />
                                            {[0, 72, 144, 216, 288].map((deg) => (
                                                <path
                                                    key={deg}
                                                    d="M24 20 C15 17, 11 8, 19 6 C22 5, 26 5, 29 6 C37 8, 33 17, 24 20 Z"
                                                    fill="#E11D48"
                                                    stroke="#881337"
                                                    strokeWidth="0.5"
                                                    transform={`rotate(${deg} 24 20)`}
                                                />
                                            ))}
                                            <circle cx="24" cy="20" r="5" fill="#9F1239" />
                                            <path
                                                d="M21 19.5 C21.5 16.5, 26.5 16.5, 27 19.5 C27 22, 22 22, 21.5 20"
                                                stroke="#FECDD3"
                                                strokeWidth="1.1"
                                                fill="none"
                                            />
                                        </svg>

                                        {/* Lluvia de Rosas Rojas Completas */}
                                        <div className="absolute inset-0 flex justify-around items-start pt-4">
                                            {[0, 1, 2, 3].map((i) => (
                                                <svg
                                                    key={i}
                                                    width="24"
                                                    height="24"
                                                    viewBox="0 0 40 40"
                                                    className="animate-bounce"
                                                    style={{
                                                        marginTop: (i % 3) * 24,
                                                        animationDuration: `${2.5 + i * 0.3}s`,
                                                    }}
                                                >
                                                    <path d="M8 14 Q4 8 11 10 Z M32 14 Q36 8 29 10 Z" fill="#16A34A" />
                                                    {[0, 72, 144, 216, 288].map((deg) => (
                                                        <path
                                                            key={deg}
                                                            d="M20 20 C11 17, 7 8, 15 6 C18 5, 22 5, 25 6 C33 8, 29 17, 20 20 Z"
                                                            fill="#E11D48"
                                                            transform={`rotate(${deg} 20 20)`}
                                                        />
                                                    ))}
                                                    <circle cx="20" cy="20" r="5" fill="#881337" />
                                                    <path
                                                        d="M17 19.5 C17.5 16.5, 22.5 16.5, 23 19.5"
                                                        stroke="#FECDD3"
                                                        strokeWidth="1.2"
                                                        fill="none"
                                                    />
                                                </svg>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* 7. PRIMAVERA: Plantas y Flores con Pétalos Creciendo Desde Abajo */}
                                {activeEffectiveTheme === 'primavera' && (
                                    <svg
                                        className="absolute bottom-0 left-0 right-0 w-full h-24 z-30"
                                        viewBox="0 0 280 95"
                                    >
                                        {/* 1. Flor Izquierda Fija con Pétalos */}
                                        <path d="M24 95 Q34 62 22 30" stroke="#16A34A" strokeWidth="2.8" fill="none" strokeLinecap="round" />
                                        <path d="M26 68 C13 62, 11 50, 22 52 Z" fill="#22C55E" />
                                        <path d="M25 48 C38 42, 40 30, 28 32 Z" fill="#4ADE80" />
                                        <g transform="translate(22, 26)">
                                            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                                                <path
                                                    key={`pr1-${deg}`}
                                                    d="M0 0 C-3.2 -4, -3.5 -10.5, 0 -12 C3.5 -10.5, 3.2 -4, 0 0 Z"
                                                    fill="#EC4899"
                                                    transform={`rotate(${deg})`}
                                                />
                                            ))}
                                            <circle cx="0" cy="0" r="3.5" fill="#FACC15" />
                                        </g>

                                        {/* 2. Flor Centro-Izquierda con Pétalos */}
                                        <path d="M98 95 Q88 68 104 44" stroke="#16A34A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                                        <path d="M95 72 C83 66, 81 56, 91 58 Z" fill="#4ADE80" />
                                        <g transform="translate(104, 42)">
                                            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                                                <path
                                                    key={`pr2-${deg}`}
                                                    d="M0 0 C-2.8 -3.5, -3.2 -9.5, 0 -10.8 C3.2 -9.5, 2.8 -3.5, 0 0 Z"
                                                    fill="#FBBF24"
                                                    transform={`rotate(${deg})`}
                                                />
                                            ))}
                                            <circle cx="0" cy="0" r="3.2" fill="#EA580C" />
                                        </g>

                                        {/* 3. Flor Centro-Derecha con Pétalos */}
                                        <path d="M186 95 Q196 68 180 44" stroke="#16A34A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                                        <g transform="translate(180, 42)">
                                            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                                                <path
                                                    key={`pr3-${deg}`}
                                                    d="M0 0 C-2.8 -3.5, -3.2 -9.5, 0 -10.8 C3.2 -9.5, 2.8 -3.5, 0 0 Z"
                                                    fill="#A855F7"
                                                    transform={`rotate(${deg})`}
                                                />
                                            ))}
                                            <circle cx="0" cy="0" r="3" fill="#FEF08A" />
                                        </g>

                                        {/* 4. Flor Derecha con Pétalos */}
                                        <path d="M256 95 Q244 62 258 30" stroke="#16A34A" strokeWidth="2.8" fill="none" strokeLinecap="round" />
                                        <path d="M252 68 C238 62, 236 50, 248 52 Z" fill="#4ADE80" />
                                        <g transform="translate(258, 26)">
                                            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                                                <path
                                                    key={`pr4-${deg}`}
                                                    d="M0 0 C-3.2 -4, -3.5 -10.5, 0 -12 C3.5 -10.5, 3.2 -4, 0 0 Z"
                                                    fill="#FB7185"
                                                    transform={`rotate(${deg})`}
                                                />
                                            ))}
                                            <circle cx="0" cy="0" r="3.5" fill="#FEF08A" />
                                        </g>
                                    </svg>
                                )}

                                {/* 8. DÍA DEL PADRE: Corona + Mostacho Imperial + Moño en Esquina y Cayendo */}
                                {activeEffectiveTheme === 'dia_padre' && (
                                    <>
                                        {/* Emblema Fijo en Esquina: Corona + Mostacho + Moño */}
                                        <svg className="absolute top-1 left-1 w-16 h-14 z-30" viewBox="0 0 94 74">
                                            <path
                                                d="M22 26 L18 11 L31 19 L42 8 L53 19 L66 11 L62 26 Z"
                                                fill="#F59E0B"
                                                stroke="#FEF08A"
                                                strokeWidth="1"
                                            />
                                            <path
                                                d="M42 39 C36 32, 26 30, 18 37 C12 42, 8 39, 10 34 C12 30, 16 34, 18 32 C24 25, 36 25, 42 32 C48 25, 60 25, 66 32 C68 34, 72 30, 74 34 C76 39, 72 42, 66 37 C58 30, 48 32, 42 39 Z"
                                                fill="#271202"
                                                stroke="#F59E0B"
                                                strokeWidth="1.2"
                                            />
                                        </svg>

                                        {/* Lluvia de Mostachos Imperiales y Moños */}
                                        <div className="absolute inset-0 flex justify-around items-start pt-4">
                                            {[0, 1, 2, 3].map((i) => (
                                                <svg
                                                    key={i}
                                                    width="26"
                                                    height="26"
                                                    viewBox="0 0 36 36"
                                                    className="animate-bounce"
                                                    style={{
                                                        marginTop: (i % 3) * 24,
                                                        animationDuration: `${2.5 + i * 0.3}s`,
                                                    }}
                                                >
                                                    {i % 2 === 0 ? (
                                                        <path
                                                            d="M18 19 C15 15, 10 14, 6 18 C3 21, 1 19, 2 16 C3 14, 5 16, 6 15 C9 11, 15 11, 18 15 C21 11, 27 11, 30 15 C31 16, 33 14, 34 16 C35 19, 33 21, 30 18 C26 14, 21 15, 18 19 Z"
                                                            fill="#451A03"
                                                            stroke="#F59E0B"
                                                            strokeWidth="0.8"
                                                        />
                                                    ) : (
                                                        <g>
                                                            <path
                                                                d="M16 18 L5 11 C3 14, 3 22, 5 25 L16 18 Z M20 18 L31 11 C33 14, 33 22, 31 25 L20 18 Z"
                                                                fill="#0F172A"
                                                                stroke="#C5A880"
                                                                strokeWidth="0.8"
                                                            />
                                                            <rect x="15" y="14.5" width="6" height="7" rx="2" fill="#C5A880" />
                                                        </g>
                                                    )}
                                                </svg>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* 9. FIESTAS PATRIAS: Bandera de México Ondeando en Esquina + Serpentinas y Escarapelas */}
                                {activeEffectiveTheme === 'patrias' && (
                                    <>
                                        {/* Bandera de México Ondeando en Esquina Superior Izquierda */}
                                        <svg className="absolute top-1 left-1 w-16 h-14 z-30" viewBox="0 0 98 82">
                                            <path d="M14 14 Q26 9, 39 12 L35 48 Q22 45, 10 50 Z" fill="#006847" />
                                            <path d="M39 12 Q51 15, 64 17 L60 53 Q47 51, 35 48 Z" fill="#FFFFFF" />
                                            <path d="M64 17 Q77 19, 90 14 L86 50 Q73 55, 60 53 Z" fill="#CE1126" />
                                            <circle cx="49.5" cy="31" r="4.5" fill="#B45309" />
                                            <line x1="15" y1="8" x2="6" y2="74" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" />
                                        </svg>

                                        {/* Lluvia Pesada de Serpentinas y Escarapelas Tricolores */}
                                        <div className="absolute inset-0 flex justify-around items-start pt-3">
                                            {[0, 1, 2, 3, 4].map((i) => (
                                                <svg
                                                    key={i}
                                                    width="22"
                                                    height="22"
                                                    viewBox="0 0 32 32"
                                                    className="animate-bounce"
                                                    style={{
                                                        marginTop: (i % 3) * 22,
                                                        animationDuration: `${2.1 + i * 0.3}s`,
                                                    }}
                                                >
                                                    {i % 2 === 1 ? (
                                                        <g>
                                                            <circle cx="16" cy="16" r="10" fill="#006847" />
                                                            <circle cx="16" cy="16" r="6.8" fill="#FFFFFF" />
                                                            <circle cx="16" cy="16" r="3.8" fill="#CE1126" />
                                                        </g>
                                                    ) : (
                                                        <path
                                                            d="M5 4 Q16 2 22 9 Q28 16 18 22 Q10 27 20 30 L14 31 Q4 27 12 20 Q21 14 15 8 Q10 4 5 4 Z"
                                                            fill={i === 0 ? '#10B981' : '#EF4444'}
                                                        />
                                                    )}
                                                </svg>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Header Simulado Vatos Alfa */}
                            <div className="bg-[#202A49] px-4 pt-5 pb-3.5 text-white relative">
                                <div className="flex items-center justify-between relative z-10">
                                    <div className="pl-10">
                                        <p className="text-[10px] font-black tracking-wider text-[#C5A880]">
                                            VATOS ALFA
                                        </p>
                                        <p className="text-xs font-bold text-white">Hola, Caballero</p>
                                    </div>
                                    <div className="h-7 px-2 rounded-full bg-white/10 flex items-center text-[10px] text-blue-200 font-semibold">
                                        📍 Cipreses
                                    </div>
                                </div>
                            </div>

                            {/* Cuerpo Simulado del Inicio */}
                            <div className="p-3.5 pb-6 space-y-2.5 text-slate-800 relative z-10">
                                <div className="rounded-xl bg-[#202A49] p-3 text-white shadow-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[9px] uppercase tracking-wider text-[#C5A880] font-bold">
                                            Pase Alfa Club
                                        </span>
                                        <span className="text-[10px] font-bold text-amber-300">
                                            {currentThemeMeta ? `${currentThemeMeta.emoji} Activo` : 'Normal'}
                                        </span>
                                    </div>
                                    <p className="text-xs font-extrabold">Tu Estilo, Tu Rango</p>
                                    <p className="text-[10px] text-slate-300 mt-0.5">
                                        Emblema en esquina + animación temática 3D.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="h-14 rounded-lg bg-white border border-slate-200 p-2 flex flex-col justify-center">
                                        <div className="h-2 w-12 bg-slate-200 rounded mb-1.5" />
                                        <div className="h-2 w-16 bg-slate-300 rounded" />
                                    </div>
                                    <div className="h-14 rounded-lg bg-white border border-slate-200 p-2 flex flex-col justify-center">
                                        <div className="h-2 w-12 bg-slate-200 rounded mb-1.5" />
                                        <div className="h-2 w-16 bg-slate-300 rounded" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Resumen del Estado Actual */}
                        <div className="mt-4 text-center space-y-1">
                            <p className="text-xs font-bold text-foreground">
                                {activeEffectiveTheme === 'ninguno'
                                    ? 'Sin efectos activos actualmente'
                                    : `${currentThemeMeta?.emoji} Mostrando: ${currentThemeMeta?.nombre}`}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                {config.modo === 'automatico'
                                    ? 'Modo Automático según el calendario anual'
                                    : 'Modo Manual sincronizado en vivo'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
