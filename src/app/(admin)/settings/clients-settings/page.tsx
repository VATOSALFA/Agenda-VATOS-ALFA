'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Hash, ShieldCheck } from "lucide-react";
import { useAuth } from '@/contexts/firebase-auth-context';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface ClientSettings {
    autoClientNumber: boolean;
    validateEmail: boolean;
    validatePhone: boolean;
}

export default function ClientsSettingsPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const form = useForm<ClientSettings>({
        defaultValues: {
            autoClientNumber: true,
            validateEmail: true,
            validatePhone: true,
        }
    });

    useEffect(() => {
        const fetchSettings = async () => {
            if (!db) return;
            setIsLoading(true);
            try {
                const docRef = doc(db, 'configuracion', 'clientes');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    form.reset(docSnap.data() as ClientSettings);
                }
            } catch (error) {
                console.error("Error fetching client settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, [db, form]);

    const onSubmit = async (data: ClientSettings) => {
        if (!db) return;
        setIsSubmitting(true);
        try {
            const docRef = doc(db, 'configuracion', 'clientes');
            await setDoc(docRef, data, { merge: true });
            toast({
                title: "Configuración guardada",
                description: "Los cambios en la configuración de clientes han sido guardados."
            });
        } catch (error) {
            console.error("Error saving client settings:", error);
            toast({
                variant: 'destructive',
                title: 'Error al guardar',
                description: 'No se pudo guardar la configuración.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 space-y-5 max-w-4xl pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Configuración de Clientes</h2>
                    <p className="text-xs text-muted-foreground">
                        Ajustes de numeración automática y control de clientes duplicados en la base de datos.
                    </p>
                </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* 1. NÚMERO AUTOMÁTICO */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Número de Cliente Automático
                            </CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Asignación secuencial de folios de cliente al momento del registro.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto-client-number" className="text-xs font-semibold text-foreground cursor-pointer">
                                    Generar folio correlativo
                                </Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Asigna un identificador numérico único a cada nuevo cliente registrado en la agenda o sitio web.
                                </p>
                            </div>
                            <Controller
                                name="autoClientNumber"
                                control={form.control}
                                render={({ field }) => (
                                    <Switch
                                        id="auto-client-number"
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        disabled={isLoading}
                                        className="shrink-0"
                                    />
                                )}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* 2. DATOS DUPLICADOS */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Prevención de Duplicados
                            </CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Evita que se generen registros redundantes validando coincidencias clave.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="py-1 px-4 text-xs font-semibold text-foreground">Dato del Cliente</TableHead>
                                    <TableHead className="py-1 px-4 text-xs font-semibold text-foreground text-right w-32">Validar Duplicado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                    <TableCell className="py-1.5 px-4 text-xs font-medium text-foreground">
                                        Correo Electrónico (Email)
                                    </TableCell>
                                    <TableCell className="py-1.5 px-4 text-right">
                                        <Controller
                                            name="validateEmail"
                                            control={form.control}
                                            render={({ field }) => (
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    disabled={isLoading}
                                                    className="scale-90"
                                                />
                                            )}
                                        />
                                    </TableCell>
                                </TableRow>
                                <TableRow className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                    <TableCell className="py-1.5 px-4 text-xs font-medium text-foreground">
                                        Teléfono Celular / WhatsApp
                                    </TableCell>
                                    <TableCell className="py-1.5 px-4 text-right">
                                        <Controller
                                            name="validatePhone"
                                            control={form.control}
                                            render={({ field }) => (
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    disabled={isLoading}
                                                    className="scale-90"
                                                />
                                            )}
                                        />
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* BOTÓN GUARDAR CAMBIOS (ALFA) */}
                <div className="sticky bottom-0 z-10 py-3 bg-background/90 backdrop-blur-md border-t border-border/40 flex justify-end">
                    <Button
                        type="submit"
                        disabled={isSubmitting || isLoading}
                        variant="alfa"
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
