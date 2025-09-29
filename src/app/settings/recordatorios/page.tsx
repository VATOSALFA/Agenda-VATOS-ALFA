
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Template } from '@/components/admin/whatsapp/template-selection-modal';
import { Textarea } from '@/components/ui/textarea';

interface AutomaticNotification {
    enabled: boolean;
    rules: string;
}

interface ReminderSettings {
    notifications: Record<string, AutomaticNotification>;
}

export default function RecordatoriosPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { data: templates, loading: templatesLoading } = useFirestoreQuery<Template>('whatsapp_templates');
    
    const form = useForm<ReminderSettings>({
        defaultValues: {
            notifications: {}
        }
    });

    const { loading: settingsLoading } = useFirestoreQuery<ReminderSettings>('configuracion', 'recordatorios', (snapshot) => {
        if (snapshot.exists()) {
            form.reset(snapshot.data());
        }
    });

    const isLoading = templatesLoading || settingsLoading;

    const onSubmit = async (data: ReminderSettings) => {
        setIsSubmitting(true);
        try {
            const settingsRef = doc(db, 'configuracion', 'recordatorios');
            await setDoc(settingsRef, data, { merge: true });
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en tus recordatorios han sido guardados."
            });
        } catch (error) {
            console.error("Error saving reminder settings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsSubmitting(false);
        }
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Recordatorios y Notificaciones</h2>
            <p className="text-muted-foreground">
                Configura las notificaciones automáticas para tus clientes.
            </p>
        </div>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
            <Card>
                <CardHeader>
                    <CardTitle>Notificaciones automáticas de reserva por WhatsApp</CardTitle>
                    <CardDescription>Activa o desactiva las notificaciones y define cuándo deben enviarse.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                    ) : (
                        templates.map((template) => (
                            <div key={template.id} className="p-4 border rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor={`enabled-${template.id}`} className="font-semibold">{template.name}</Label>
                                    <Controller
                                        name={`notifications.${template.id}.enabled`}
                                        control={form.control}
                                        defaultValue={false}
                                        render={({ field }) => (
                                            <Switch
                                                id={`enabled-${template.id}`}
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        )}
                                    />
                                </div>
                                <Controller
                                    name={`notifications.${template.id}.rules`}
                                    control={form.control}
                                    defaultValue=""
                                    render={({ field }) => (
                                        <Textarea 
                                            {...field}
                                            placeholder="Define las reglas o condiciones para esta notificación. Ej: 'Enviar 1 día antes a las 10:00 AM'"
                                            className="text-sm"
                                            rows={2}
                                        />
                                    )}
                                />
                            </div>
                        ))
                    )}
                     { !isLoading && templates.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">No has creado ninguna plantilla de WhatsApp todavía. Ve a la sección de WhatsApp para empezar.</p>
                     )}
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
