
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

const notificationTypes = [
    { id: 'google_review', name: 'Opinión de Google Maps', description: 'Esta notificación se enviará un día después de la cita del cliente para invitarlo a dejar una opinión.', sid: 'HXe0e696ca1a1178edc8284bab55555e1c' },
    { id: 'appointment_notification', name: 'Notificación de citas', description: 'Esta notificación se manda de manera automática cuando se crea una cita ya sea desde la misma agenda, desde el sitio web o aplicación siempre y cuando la opción este habilitada' },
    { id: 'appointment_reminder', name: 'Recordatorio de cita', description: 'Este recordatorio no se envía si el cliente ya confirmó la cita y para que se envíe se debe de configurar cuanto tiempo antes se manda.' },
    { id: 'birthday_notification', name: 'Notificación de Cumpleaños', description: 'Saluda a tus clientes en su día especial.' },
];

export default function RecordatoriosPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm<ReminderSettings>({
        defaultValues: {
            notifications: {}
        }
    });

    const { data: settingsData, loading: settingsLoading } = useFirestoreQuery<ReminderSettings>('configuracion', 'recordatorios');

    useEffect(() => {
        if (!settingsLoading && settingsData.length > 0) {
            const recordatoriosSettings = settingsData.find(s => (s as any).id === 'recordatorios');
            if (recordatoriosSettings) {
                form.reset(recordatoriosSettings);
            }
        }
    }, [settingsData, settingsLoading, form]);


    const isLoading = settingsLoading;

    const watchedNotifications = useWatch({ control: form.control, name: "notifications" });

    const onSubmit = async (data: ReminderSettings) => {
        setIsSubmitting(true);
        try {
            const settingsRef = doc(db, 'configuracion', 'recordatorios');
            // Ensure we only save the relevant parts of the data
            const dataToSave = {
                notifications: {
                    google_review: data.notifications.google_review,
                    appointment_notification: data.notifications.appointment_notification,
                    appointment_reminder: data.notifications.appointment_reminder,
                    birthday_notification: data.notifications.birthday_notification,
                }
            };
            await setDoc(settingsRef, dataToSave, { merge: true });
            
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
        
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl pb-16">
                <Card>
                    <CardHeader>
                        <CardTitle>Notificaciones automáticas de reserva por whatsapp</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {isLoading ? (
                            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                        ) : (
                            <div className="space-y-6">
                                {notificationTypes.map((notification) => {
                                    const timingType = watchedNotifications?.[notification.id]?.timing?.type;
                                    return (
                                    <div key={notification.id} className="p-4 border rounded-lg space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor={`enabled-${notification.id}`} className="font-semibold">{notification.name}</Label>
                                            <Controller
                                                name={`notifications.${notification.id}.enabled`}
                                                control={form.control}
                                                defaultValue={false}
                                                render={({ field }) => (
                                                    <Switch
                                                        id={`enabled-${notification.id}`}
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                )}
                                            />
                                        </div>
                                        <Controller
                                            name={`notifications.${notification.id}.rules`}
                                            control={form.control}
                                            defaultValue={notification.description}
                                            render={({ field }) => (
                                                <Textarea 
                                                    {...field}
                                                    className="text-sm text-muted-foreground"
                                                    rows={2}
                                                    readOnly
                                                />
                                            )}
                                        />
                                        {notification.id === 'appointment_reminder' && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end pt-2">
                                                <Controller
                                                    name={`notifications.${notification.id}.timing.type`}
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
                                                        name={`notifications.${notification.id}.timing.hours_before`}
                                                        control={form.control}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Horas antes</FormLabel>
                                                                <FormControl>
                                                                <Input type="number" min="1" max="23" {...field} value={field.value || ''} onChange={e => field.onChange(parseInt(e.target.value, 10) || '')} />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    )
                                })}
                            </div>
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
