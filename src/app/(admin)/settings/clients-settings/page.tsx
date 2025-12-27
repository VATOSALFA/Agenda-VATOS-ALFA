'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
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
            const docRef = doc(db, 'configuracion', 'clientes');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                form.reset(docSnap.data() as ClientSettings);
            }
            setIsLoading(false);
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
                title: "Configuración guardada con éxito",
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
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Clientes</h2>
            <p className="text-muted-foreground">
                Ajustes de la base de datos de clientes.
            </p>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
            <Card>
                <CardHeader>
                    <CardTitle>Número de Cliente Automático</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div className="flex-grow pr-4">
                            <Label htmlFor="auto-client-number" className="font-medium">Número de Cliente Automático</Label>
                            <p className="text-sm text-muted-foreground mt-1">
                                Si habilitas esta opción, se asignará un número de cliente correlativo a cada nuevo cliente que registres en tu base de datos.
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
                                />
                            )}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Datos duplicados</CardTitle>
                    <CardDescription>
                        Para evitar que se generen clientes duplicados en tu base de datos, puedes activar la validación por Email y/o Teléfono.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datos Del Cliente</TableHead>
                                <TableHead className="text-right">Validar</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell className="font-medium">Email</TableCell>
                                <TableCell className="text-right">
                                    <Controller
                                        name="validateEmail"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                disabled={isLoading}
                                            />
                                        )}
                                    />
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">Teléfono</TableCell>
                                <TableCell className="text-right">
                                     <Controller
                                        name="validatePhone"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                disabled={isLoading}
                                            />
                                        )}
                                    />
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            
            <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                <Button type="submit" disabled={isSubmitting || isLoading}>
                    {(isSubmitting || isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar Cambios
                </Button>
            </div>
        </form>
    </div>
  );
}
