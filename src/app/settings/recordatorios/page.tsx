
'use client';

import { useForm, Controller, useWatch } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Template } from '@/components/admin/whatsapp/template-selection-modal';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Form, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';


interface ReminderTiming {
    type: 'day_before' | 'same_day';
    hours_before?: number;
}

interface AutomaticNotification {
    enabled: boolean;
    rules: string;
    timing?: ReminderTiming;
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

    const { data: settingsData, loading: settingsLoading } = useFirestoreQuery<ReminderSettings>('configuracion', `recordatorios-settings`, (snapshot) => {
        if (snapshot && snapshot.docs.length > 0 && snapshot.docs[0].id === 'recordatorios') {
            form.reset(snapshot.docs[0].data());
        }
    });


    const isLoading = templatesLoading || settingsLoading;

    // A watch to re-render the component when a timing type changes
    const watchedTimings = useWatch({ control: form.control, name: "notifications" });

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
    
    const notificationTemplates = useMemo(() => {
        return templates.filter(t => t.name.toLowerCase().includes('notificación de citas'));
    }, [templates]);

    const reminderTemplates = useMemo(() => {
        return templates.filter(t => t.name.toLowerCase().includes('recordatorio de cita'));
    }, [templates]);
    
    const reviewTemplates = useMemo(() => {
        return templates.filter(t => t.name.toLowerCase().includes('opinion de google maps'));
    }, [templates]);

    const birthdayTemplates = useMemo(() => {
        return templates.filter(t => t.name.toLowerCase().includes('cumpleaños'));
    }, [templates]);


  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Recordatorios y Notificaciones</h2>
            <p className="text-muted-foreground">
                Configura las notificaciones automáticas para tus clientes.
            </p>
        </div>
        
        <Form {...form}>
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
                            <>
                            {notificationTemplates.map((template) => (
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
                                        defaultValue="Esta notificación se manda de manera automática cuando se crea una cita ya sea desde la misma agenda, desde el sitio web o aplicación siempre y cuando la opción este habilitada"
                                        render={({ field }) => (
                                            <Textarea 
                                                {...field}
                                                className="text-sm text-muted-foreground"
                                                rows={2}
                                            />
                                        )}
                                    />
                                </div>
                            ))}
                            {reminderTemplates.map((template) => {
                                const timingType = watchedTimings?.[template.id]?.timing?.type;
                                return (
                                <div key={template.id} className="p-4 border rounded-lg space-y-4">
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
                                        defaultValue="Este recordatorio no se envía si el cliente ya confirmó la cita y para que se envíe se debe de configurar cuanto tiempo antes se manda."
                                        render={({ field }) => (
                                            <Textarea 
                                                {...field}
                                                className="text-sm text-muted-foreground"
                                                rows={2}
                                            />
                                        )}
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end pt-2">
                                        <Controller
                                            name={`notifications.${template.id}.timing.type`}
                                            control={form.control}
                                            defaultValue="day_before"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Cuándo enviar</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="day_before">Un día antes de la cita</SelectItem>
                                                            <SelectItem value="same_day">El mismo día de la cita</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                        {timingType === 'same_day' && (
                                            <Controller
                                                name={`notifications.${template.id}.timing.hours_before`}
                                                control={form.control}
                                                defaultValue={2}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Horas antes</FormLabel>
                                                        <FormControl>
                                                          <Input type="number" min="1" max="23" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>
                                </div>
                                )
                            })}
                            
                             {birthdayTemplates.map((template) => (
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
                                                className="text-sm"
                                                rows={2}
                                                placeholder="Define las reglas para esta notificación..."
                                            />
                                        )}
                                    />
                                </div>
                            ))}

                            {reviewTemplates.map((template) => (
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
                                                className="text-sm"
                                                rows={2}
                                                placeholder="Define las reglas para esta notificación..."
                                            />
                                        )}
                                    />
                                </div>
                            ))}
                            
                            { !templatesLoading && templates.length === 0 && (
                                <p className="text-center text-muted-foreground py-8">No has creado ninguna plantilla de WhatsApp todavía. Ve a la sección de WhatsApp para empezar.</p>
                            )}
                            </>
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
        </Form>
    </div>
  );
}

    