'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Sparkles, Megaphone, Award, TrendingUp, WifiOff, Percent } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';

interface FeaturesSettings {
    enableMarketing: boolean;
    enableLoyaltyPoints: boolean;
    loyaltyCashbackPercentage: number;
    enableBarberDashboard: boolean;
    enableOfflineMode: boolean;
}

export default function FeaturesSettingsPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const form = useForm<FeaturesSettings>({
        defaultValues: {
            enableMarketing: false,
            enableLoyaltyPoints: false,
            loyaltyCashbackPercentage: 10,
            enableBarberDashboard: false,
            enableOfflineMode: false,
        }
    });

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                const featuresRef = doc(db, 'configuracion', 'features');
                const featuresSnap = await getDoc(featuresRef);
                const featuresData = featuresSnap.exists() ? featuresSnap.data() : {};

                form.reset({
                    enableMarketing: featuresData.enableMarketing ?? false,
                    enableLoyaltyPoints: featuresData.enableLoyaltyPoints ?? false,
                    loyaltyCashbackPercentage: featuresData.loyaltyCashbackPercentage ?? 10,
                    enableBarberDashboard: featuresData.enableBarberDashboard ?? false,
                    enableOfflineMode: featuresData.enableOfflineMode ?? false,
                });

            } catch (error) {
                console.error("Error loading settings:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las configuraciones.' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, [form, toast]);

    const onSubmit = async (data: FeaturesSettings) => {
        setIsSubmitting(true);
        try {
            const featuresRef = doc(db, 'configuracion', 'features');
            await setDoc(featuresRef, {
                enableMarketing: data.enableMarketing,
                enableLoyaltyPoints: data.enableLoyaltyPoints,
                loyaltyCashbackPercentage: Number(data.loyaltyCashbackPercentage),
                enableBarberDashboard: data.enableBarberDashboard,
                enableOfflineMode: data.enableOfflineMode,
            }, { merge: true });

            toast({
                title: "Configuración guardada",
                description: "Las funcionalidades avanzadas han sido actualizadas."
            })
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-5 max-w-5xl pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Funcionalidades Avanzadas</h2>
                    <p className="text-xs text-muted-foreground">
                        Activa o personaliza módulos inteligentes para potenciar las operaciones y fidelización de tu negocio.
                    </p>
                </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Módulos de la Plataforma
                            </CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Habilita o ajusta el comportamiento de las herramientas del sistema según las necesidades de tu barbería.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 divide-y divide-border/50 bg-card">
                        {/* 1. Marketing CRM */}
                        <div className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-muted/20 transition-colors">
                            <div className="space-y-0.5 pr-4">
                                <div className="flex items-center gap-2">
                                    <Megaphone className="h-4 w-4 text-slate-400 shrink-0" />
                                    <span className="text-xs sm:text-sm font-semibold text-foreground">
                                        Módulo de Marketing CRM
                                    </span>
                                </div>
                                <p className="text-[11px] sm:text-xs text-muted-foreground">
                                    Envía mensajes de reactivación y promociones masivas o personalizadas a clientes inactivos.
                                </p>
                            </div>
                            <Controller
                                name="enableMarketing"
                                control={form.control}
                                render={({ field }) => (
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                )}
                            />
                        </div>

                        {/* 2. Loyalty Points (Matte Gold #C5A880) */}
                        <div className="transition-colors">
                            <div className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-4">
                                    <div className="flex items-center gap-2">
                                        <Award className="h-4 w-4 text-[#C5A880] shrink-0" />
                                        <span className="text-xs sm:text-sm font-semibold text-foreground">
                                            Programa de Puntos y Lealtad (Cashback)
                                        </span>
                                    </div>
                                    <p className="text-[11px] sm:text-xs text-muted-foreground">
                                        Permite a tus clientes acumular saldo en puntos en cada visita para pagar futuros servicios.
                                    </p>
                                </div>
                                <Controller
                                    name="enableLoyaltyPoints"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>

                            {form.watch('enableLoyaltyPoints') && (
                                <div className="p-3.5 sm:p-4 bg-muted/20 border-t border-border/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                            <Percent className="h-3.5 w-3.5 text-[#C5A880]" />
                                            Porcentaje de Recompensa (Cashback)
                                        </span>
                                        <p className="text-[11px] text-muted-foreground">
                                            Porcentaje de la venta que se abona en puntos (Ej: 10% de $100 = 10 puntos Alfa).
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Controller
                                            name="loyaltyCashbackPercentage"
                                            control={form.control}
                                            render={({ field }) => (
                                                <div className="relative flex items-center">
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        max="100"
                                                        className="w-24 h-8 pr-7 text-right font-sans font-medium text-xs sm:text-sm"
                                                        {...field}
                                                        onChange={e => field.onChange(Number(e.target.value))}
                                                    />
                                                    <span className="absolute right-2.5 text-xs text-muted-foreground pointer-events-none font-medium">%</span>
                                                </div>
                                            )}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 3. Barber Dashboard */}
                        <div className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-muted/20 transition-colors">
                            <div className="space-y-0.5 pr-4">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-slate-400 shrink-0" />
                                    <span className="text-xs sm:text-sm font-semibold text-foreground">
                                        Dashboard de Metas y Gamificación
                                    </span>
                                </div>
                                <p className="text-[11px] sm:text-xs text-muted-foreground">
                                    Despliega métricas individuales de productividad y progreso hacia metas para los barberos.
                                </p>
                            </div>
                            <Controller
                                name="enableBarberDashboard"
                                control={form.control}
                                render={({ field }) => (
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                )}
                            />
                        </div>

                        {/* 4. Offline Mode */}
                        <div className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-muted/20 transition-colors">
                            <div className="space-y-0.5 pr-4">
                                <div className="flex items-center gap-2">
                                    <WifiOff className="h-4 w-4 text-slate-400 shrink-0" />
                                    <span className="text-xs sm:text-sm font-semibold text-foreground">
                                        Modo Offline de Emergencia
                                    </span>
                                </div>
                                <p className="text-[11px] sm:text-xs text-muted-foreground">
                                    Mantiene una copia de lectura en caché de la agenda y clientes para consultar sin internet.
                                </p>
                            </div>
                            <Controller
                                name="enableOfflineMode"
                                control={form.control}
                                render={({ field }) => (
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Botón Guardar Cambios (Alfa) */}
                <div className="sticky bottom-0 z-10 py-3 bg-background/90 backdrop-blur-md border-t border-border/40 flex justify-end">
                    <Button
                        type="submit"
                        variant="alfa"
                        disabled={isSubmitting || isLoading}
                        className="h-9 px-6 text-xs font-semibold"
                    >
                        {(isSubmitting || isLoading) ? (
                            <>
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            "Guardar Cambios"
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
