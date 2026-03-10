'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Separator } from "@/components/ui/separator";

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
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Funcionalidades Avanzadas</h3>
                <p className="text-sm text-muted-foreground">
                    Activa o desactiva módulos adicionales para potenciar tu negocio.
                </p>
            </div>
            <Separator />

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                {/* Marketing */}
                <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                        <Label className="text-base">Módulo de Marketing CRM</Label>
                        <p className="text-sm text-muted-foreground">Activa opciones para enviar mensajes masivos o individuales a clientes inactivos.</p>
                    </div>
                    <Controller name="enableMarketing" control={form.control} render={({ field }) => (
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )} />
                </div>

                {/* Loyalty */}
                <div className="flex flex-col gap-4 rounded-lg border p-4 shadow-sm">
                    <div className="flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-base">Programa de Puntos (Lealtad)</Label>
                            <p className="text-sm text-muted-foreground">Permite acumular puntos por venta y pagar con ellos.</p>
                        </div>
                        <Controller name="enableLoyaltyPoints" control={form.control} render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                        )} />
                    </div>

                    {form.watch('enableLoyaltyPoints') && (
                        <div className="pl-0 pt-2 border-t mt-2">
                            <div className="flex items-center gap-4">
                                <div className="space-y-0.5 flex-1">
                                    <Label className="text-sm">Porcentaje de Cashback (%)</Label>
                                    <p className="text-xs text-muted-foreground">Porcentaje de la venta que se devuelve en puntos (Ej: 10% de $100 = 10 puntos).</p>
                                </div>
                                <Controller name="loyaltyCashbackPercentage" control={form.control} render={({ field }) => (
                                    <Input
                                        type="number"
                                        min="1"
                                        max="100"
                                        className="w-24 text-right"
                                        {...field}
                                        onChange={e => field.onChange(Number(e.target.value))}
                                    />
                                )} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Barber Dashboard */}
                <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                        <Label className="text-base">Dashboard de Metas y Gamificación</Label>
                        <p className="text-sm text-muted-foreground">Muestra gráficas de rendimiento individual a los barberos.</p>
                    </div>
                    <Controller name="enableBarberDashboard" control={form.control} render={({ field }) => (
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )} />
                </div>

                {/* Offline Mode */}
                <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                        <Label className="text-base">Modo Offline (Básico)</Label>
                        <p className="text-sm text-muted-foreground">Mantiene una copia de la agenda y clientes para verlos sin internet.</p>
                    </div>
                    <Controller name="enableOfflineMode" control={form.control} render={({ field }) => (
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )} />
                </div>

                <div className="flex justify-end">
                    <Button type="submit" disabled={isSubmitting || isLoading}>
                        {(isSubmitting || isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </div>
            </form>
        </div>
    );
}
