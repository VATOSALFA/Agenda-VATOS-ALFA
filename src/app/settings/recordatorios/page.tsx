
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';

interface ReminderSettings {
    whatsapp_notification: boolean;
    whatsapp_reminder: boolean;
    reminder_day: string;
    reminder_time: string;
}

const ToggleField = ({ name, label, control, disabled = false }: { name: keyof ReminderSettings, label: string, control: any, disabled?: boolean }) => (
    <div className="flex items-center justify-between py-4 border-b last:border-b-0">
        <Label htmlFor={name} className="flex-1 pr-4">{label}</Label>
        <Controller
            name={name}
            control={control}
            render={({ field }) => (
                <Switch
                    id={name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                />
            )}
        />
    </div>
);

export default function RecordatoriosPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const form = useForm<ReminderSettings>({
        defaultValues: {
            whatsapp_notification: true,
            whatsapp_reminder: true,
            reminder_day: '1_day_before',
            reminder_time: '09:00'
        }
    });

    useEffect(() => {
        const fetchSettings = async () => {
            const settingsRef = doc(db, 'configuracion', 'recordatorios');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                form.reset(docSnap.data() as ReminderSettings);
            }
            setIsLoading(false);
        };
        fetchSettings();
    }, [form]);

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
            <h2 className="text-3xl font-bold tracking-tight">Recordatorios</h2>
            <p className="text-muted-foreground">
                Configura las notificaciones automáticas para tus clientes.
            </p>
        </div>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
            <Card>
                <CardHeader>
                    <CardTitle>Notificaciones automáticas de reserva por WhatsApp</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : (
                        <>
                            <ToggleField name="whatsapp_notification" label="Notificación de creación de cita" control={form.control} />
                            <ToggleField name="whatsapp_reminder" label="Recordatorio" control={form.control} />
                            <div className="py-4 space-y-2">
                                <Label>Día del recordatorio</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <Controller
                                        name="reminder_day"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch('whatsapp_reminder')}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1_day_before">Un día antes</SelectItem>
                                                    <SelectItem value="2_days_before">Dos días antes</SelectItem>
                                                    <SelectItem value="same_day">El mismo día</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                    <Controller
                                        name="reminder_time"
                                        control={form.control}
                                        render={({ field }) => (
                                             <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch('whatsapp_reminder')}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="09:00">09:00</SelectItem>
                                                    <SelectItem value="10:00">10:00</SelectItem>
                                                    <SelectItem value="11:00">11:00</SelectItem>
                                                    <SelectItem value="12:00">12:00</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    <Alert className="mt-4">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Importante</AlertTitle>
                        <AlertDescription>
                            Los recordatorios no se envían si el cliente agendó el mismo día de la cita o si ya la confirmó previamente.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
            
            <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                <Button type="submit" disabled={isSubmitting || isLoading}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar Cambios
                </Button>
            </div>
        </form>
    </div>
  );
}
