'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Settings } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { BluetoothPrinter } from '@/lib/printer';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const customerFields = [
    { id: 'email', label: 'Email' },
    { id: 'phone', label: 'Teléfono' },
    { id: 'dob', label: 'Fecha de Nacimiento' },
    { id: 'address', label: 'Dirección' },
    { id: 'notes', label: 'Notas del Cliente' },
];

interface AjustesSettings {
    // Printer Settings
    ticketPrinterEnabled: boolean;
    ticketPrinterDeviceName: string;
    ticketFooterMessage: string;

    // Agenda Settings
    overlappingReservations: boolean;
    simultaneousReservations: boolean;
    resourceOverload: boolean;
    customerFields: Record<string, { use: boolean; required: boolean }>;
    // WhatsApp Settings
    whatsappMessageTemplate: string;
    whatsappReminderTemplate: string;
    whatsappConfirmationAnimation: boolean;
    whatsappReminderAnimation: boolean;
    
    // Advanced Features moved to /settings/features
}

export default function AjustesPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);

    const form = useForm<AjustesSettings>({
        defaultValues: {
            ticketPrinterEnabled: false,
            ticketPrinterDeviceName: '',
            ticketFooterMessage: '¡Gracias por su preferencia!',
            overlappingReservations: true,
            simultaneousReservations: true,
            resourceOverload: false,
            customerFields: customerFields.reduce((acc, field) => {
                acc[field.id] = { use: true, required: ['phone'].includes(field.id) };
                return acc;
            }, {} as Record<string, { use: boolean; required: boolean }>),
            whatsappMessageTemplate: '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 3 horas antes. Favor de llegar 5 minutos antes de tu cita._',
            whatsappReminderTemplate: '¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_',
            whatsappConfirmationAnimation: true,
            whatsappReminderAnimation: true,
            /* Moved to settings/features
            enableMarketing: false,
            enableLoyaltyPoints: false,
            loyaltyCashbackPercentage: 10,
            enableBarberDashboard: false,
            enableOfflineMode: false,
            */
        }
    });

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch Printer Settings (from pagos)
                const pagosRef = doc(db, 'configuracion', 'pagos');
                const pagosSnap = await getDoc(pagosRef);
                const pagosData = pagosSnap.exists() ? pagosSnap.data() : {};

                // 2. Fetch Agenda Settings
                const agendaRef = doc(db, 'configuracion', 'agenda');
                const agendaSnap = await getDoc(agendaRef);
                const agendaData = agendaSnap.exists() ? agendaSnap.data() : {};

                // 3. Fetch Advanced Features
                const featuresRef = doc(db, 'configuracion', 'features');
                const featuresSnap = await getDoc(featuresRef);
                const featuresData = featuresSnap.exists() ? featuresSnap.data() : {};

                // 4. Fetch WhatsApp Settings
                const whatsappRef = doc(db, 'configuracion', 'whatsapp');
                const whatsappSnap = await getDoc(whatsappRef);
                const whatsappData = whatsappSnap.exists() ? whatsappSnap.data() : {};

                form.reset({
                    ticketPrinterEnabled: pagosData.ticketPrinterEnabled ?? false,
                    ticketPrinterDeviceName: pagosData.ticketPrinterDeviceName || '',
                    ticketFooterMessage: pagosData.ticketFooterMessage || '¡Gracias por su preferencia!',

                    overlappingReservations: agendaData.overlappingReservations ?? true,
                    simultaneousReservations: agendaData.simultaneousReservations ?? true,
                    resourceOverload: agendaData.resourceOverload ?? false,
                    customerFields: agendaData.customerFields || customerFields.reduce((acc, field) => {
                        acc[field.id] = { use: true, required: ['phone'].includes(field.id) };
                        return acc;
                    }, {} as Record<string, { use: boolean; required: boolean }>),
                    whatsappMessageTemplate: whatsappData.whatsappMessageTemplate || '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\n_Podrá cancelar hasta 3 horas antes. Favor de llegar 5 minutos antes de tu cita._',
                    whatsappReminderTemplate: whatsappData.whatsappReminderTemplate || '¡Hola *{nombre}*, te recordamos tu cita para el día de hoy! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n📍 *Ubicación:* {ubicacion}\n\n_¡Te esperamos!_',
                    whatsappConfirmationAnimation: whatsappData.whatsappConfirmationAnimation ?? true,
                    whatsappReminderAnimation: whatsappData.whatsappReminderAnimation ?? true,

                    /* Moved to settings/features
                    enableMarketing: featuresData.enableMarketing ?? false,
                    enableLoyaltyPoints: featuresData.enableLoyaltyPoints ?? false,
                    loyaltyCashbackPercentage: featuresData.loyaltyCashbackPercentage ?? 10,
                    enableBarberDashboard: featuresData.enableBarberDashboard ?? false,
                    enableOfflineMode: featuresData.enableOfflineMode ?? false,
                    */
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

    const handleConnectPrinter = async () => {
        setIsConnectingPrinter(true);
        try {
            const printer = BluetoothPrinter.getInstance();
            const deviceName = await printer.connect();
            form.setValue('ticketPrinterDeviceName', deviceName);
            form.setValue('ticketPrinterEnabled', true);
            toast({
                title: "Impresora Conectada",
                description: `Se ha vinculado correctamente con: ${deviceName}`,
            });
        } catch (error: any) {
            console.error("Printer connection error:", error);
            toast({
                variant: "destructive",
                title: "Error de conexión",
                description: error.message || "No se pudo conectar con la impresora.",
            });
        } finally {
            setIsConnectingPrinter(false);
        }
    };

    const handleTestPrint = async () => {
        try {
            const printer = BluetoothPrinter.getInstance();
            if (!printer.isConnected()) {
                await printer.connect();
            }
            await printer.print(`
            PRUEBA DE IMPRESION
            -------------------
            Agenda VATOS ALFA
            Sistema Profesional
            -------------------
            Funcionando correctamente.
            \n\n\n`);
            toast({ title: "Imprimiendo..." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    };

    const onSubmit = async (data: AjustesSettings) => {
        setIsSubmitting(true);
        try {
            // 1. Save Printer Settings to 'configuracion/pagos'
            const pagosRef = doc(db, 'configuracion', 'pagos');
            await setDoc(pagosRef, {
                ticketPrinterEnabled: data.ticketPrinterEnabled,
                ticketPrinterDeviceName: data.ticketPrinterDeviceName,
                ticketFooterMessage: data.ticketFooterMessage || '¡Gracias por su preferencia!',
            }, { merge: true });

            // 2. Save Agenda Settings to 'configuracion/agenda'
            const agendaRef = doc(db, 'configuracion', 'agenda');
            await setDoc(agendaRef, {
                overlappingReservations: data.overlappingReservations,
                simultaneousReservations: data.simultaneousReservations,
                resourceOverload: data.resourceOverload,
                customerFields: data.customerFields
            }, { merge: true });

            // 3. Save WhatsApp Settings
            const whatsappRef = doc(db, 'configuracion', 'whatsapp');
            await setDoc(whatsappRef, {
                whatsappMessageTemplate: data.whatsappMessageTemplate || '',
                whatsappReminderTemplate: data.whatsappReminderTemplate || '',
                whatsappConfirmationAnimation: data.whatsappConfirmationAnimation ?? true,
                whatsappReminderAnimation: data.whatsappReminderAnimation ?? true
            }, { merge: true });

            /* Moved to settings/features
            // 3. Save Advanced Features to 'configuracion/features'
            const featuresRef = doc(db, 'configuracion', 'features');
            await setDoc(featuresRef, {
                enableMarketing: data.enableMarketing,
                enableLoyaltyPoints: data.enableLoyaltyPoints,
                loyaltyCashbackPercentage: Number(data.loyaltyCashbackPercentage),
                enableBarberDashboard: data.enableBarberDashboard,
                enableOfflineMode: data.enableOfflineMode,
            }, { merge: true });
            */

            toast({
                title: "Configuración guardada",
                description: "Los ajustes han sido actualizados correctamente."
            })
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                    <Settings className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Ajustes Generales</h2>
                    <p className="text-muted-foreground">
                        Configura dispositivos y comportamientos generales del sistema
                    </p>
                </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
                <Accordion type="multiple" defaultValue={[]} className="w-full space-y-4">

                    {/* FEATURES MOVED TO /settings/features */}

                    {/* IMPRESORA DE TICKETS */}
                    <AccordionItem value="printer" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6 font-semibold text-base">Impresora de tickets</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-6">
                            <div className="flex flex-col gap-4">
                                <p className="text-sm text-muted-foreground">
                                    Conecta una impresora térmica Bluetooth para imprimir tickets automáticamente al realizar cobros en efectivo.
                                </p>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Habilitar impresión automática</Label>
                                        <p className="text-sm text-muted-foreground">Se imprimirá un ticket al finalizar una venta en efectivo.</p>
                                    </div>
                                    <Controller name="ticketPrinterEnabled" control={form.control} render={({ field }) => (
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    )} />
                                </div>

                                {form.watch('ticketPrinterEnabled') && (
                                    <Card className="bg-muted/50 border-dashed">
                                        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-3 w-3 rounded-full ${form.watch('ticketPrinterDeviceName') ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">Dispositivo Vinculado</span>
                                                    <span className="text-xs text-muted-foreground">{form.watch('ticketPrinterDeviceName') || 'Ninguno'}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 w-full sm:w-auto">
                                                <Button type="button" variant="secondary" size="sm" onClick={handleTestPrint} disabled={!form.watch('ticketPrinterDeviceName')}>
                                                    Prueba
                                                </Button>
                                                <Button type="button" size="sm" onClick={handleConnectPrinter} disabled={isConnectingPrinter}>
                                                    {isConnectingPrinter && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                    {form.watch('ticketPrinterDeviceName') ? 'Cambiar Impresora' : 'Buscar Impresora'}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                <div className="space-y-2 mt-2">
                                    <Label>Mensaje de pie de página</Label>
                                    <Controller name="ticketFooterMessage" control={form.control} render={({ field }) => (
                                        <Textarea {...field} placeholder="¡Gracias por su preferencia!\nVisitanos de nuevo" />
                                    )} />
                                    <p className="text-xs text-muted-foreground">Este mensaje aparecerá al final de cada ticket impreso. Puedes usar la tecla <b>Enter</b> para agregar saltos de línea.</p>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* MENSAJES DE WHATSAPP */}
                    <AccordionItem value="whatsapp" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6 font-semibold text-base">Mensajes de WhatsApp</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-8">
                            <div>
                                <h3 className="text-lg font-medium mb-2">Mensaje de Confirmación</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Personaliza el mensaje que se sugiere al confirmar una cita por WhatsApp.
                                </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <Label>Plantilla del mensaje</Label>
                                    <Controller
                                        name="whatsappMessageTemplate"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Textarea
                                                {...field}
                                                rows={10}
                                                className="font-mono text-sm"
                                            />
                                        )}
                                    />
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        <div className="text-xs font-semibold w-full mb-1">Variables disponibles:</div>
                                        {['{nombre}', '{servicios}', '{fecha}', '{hora}', '{profesional}', '{ubicacion}'].map(tag => (
                                            <Badge
                                                key={tag}
                                                variant="outline"
                                                className="cursor-pointer hover:bg-secondary"
                                                onClick={() => {
                                                    const val = form.getValues('whatsappMessageTemplate') || '';
                                                    form.setValue('whatsappMessageTemplate', val + tag);
                                                }}
                                            >
                                                {tag}
                                            </Badge>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Usa el formato de WhatsApp: *negrita*, _cursiva_, ~tachado~.
                                    </p>
                                </div>
                                
                                <div className="bg-[#e5ddd5] p-4 rounded-xl shadow-inner relative flex flex-col justify-end">
                                    <div className="mb-2 text-center text-xs text-gray-500 font-semibold uppercase tracking-wider">Vista Previa</div>
                                    <div className="bg-white p-3 rounded-tr-xl rounded-tl-xl rounded-bl-xl shadow flex flex-col max-w-[90%] self-end">
                                        <div 
                                            className="text-sm text-[#303030] whitespace-pre-wrap font-sans leading-snug"
                                            dangerouslySetInnerHTML={{
                                                __html: (form.watch('whatsappMessageTemplate') || '')
                                                    .replace(/{nombre}/g, 'Juan Pérez')
                                                    .replace(/{servicios}/g, 'Corte de Cabello')
                                                    .replace(/{fecha}/g, 'Lunes, 12 de Octubre, 2026')
                                                    .replace(/{hora}/g, '10:00 AM')
                                                    .replace(/{profesional}/g, 'Carlos Barbero')
                                                    .replace(/{ubicacion}/g, 'VATOS ALFA Barber Shop Suc1 (Av. Cerro Sombrerete 1001)')
                                                    // Convert WhatsApp bold: *text* -> <b>text</b>
                                                    .replace(/\*(.*?)\*/g, '<strong style="font-weight: 600;">$1</strong>')
                                                    // Convert WhatsApp italic: _text_ -> <i>text</i>
                                                    .replace(/_(.*?)_/g, '<em style="font-style: italic;">$1</em>')
                                                    // Convert WhatsApp strikethrough: ~text~ -> <s>text</s>
                                                    .replace(/~(.*?)~/g, '<del>$1</del>')
                                            }}
                                        />
                                        <span className="text-[10px] text-gray-400 self-end mt-1 uppercase">12:00</span>
                                    </div>
                                </div>
                            </div>
                            </div>

                            <hr className="border-border my-6"/>

                            <div>
                                <h3 className="text-lg font-medium mb-2">Mensaje de Recordatorio</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Personaliza el mensaje que se sugiere al enviar un recordatorio de cita (usualmente el mismo día).
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <Label>Plantilla del mensaje</Label>
                                        <Controller
                                            name="whatsappReminderTemplate"
                                            control={form.control}
                                            render={({ field }) => (
                                                <Textarea
                                                    {...field}
                                                    rows={10}
                                                    className="font-mono text-sm"
                                                />
                                            )}
                                        />
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <div className="text-xs font-semibold w-full mb-1">Variables disponibles:</div>
                                            {['{nombre}', '{servicios}', '{fecha}', '{hora}', '{profesional}', '{ubicacion}'].map(tag => (
                                                <Badge
                                                    key={tag}
                                                    variant="outline"
                                                    className="cursor-pointer hover:bg-secondary"
                                                    onClick={() => {
                                                        const val = form.getValues('whatsappReminderTemplate') || '';
                                                        form.setValue('whatsappReminderTemplate', val + tag);
                                                    }}
                                                >
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="bg-[#e5ddd5] p-4 rounded-xl shadow-inner relative flex flex-col justify-end">
                                        <div className="mb-2 text-center text-xs text-gray-500 font-semibold uppercase tracking-wider">Vista Previa</div>
                                        <div className="bg-white p-3 rounded-tr-xl rounded-tl-xl rounded-bl-xl shadow flex flex-col max-w-[90%] self-end">
                                            <div 
                                                className="text-sm text-[#303030] whitespace-pre-wrap font-sans leading-snug"
                                                dangerouslySetInnerHTML={{
                                                    __html: (form.watch('whatsappReminderTemplate') || '')
                                                        .replace(/{nombre}/g, 'Juan Pérez')
                                                        .replace(/{servicios}/g, 'Corte de Cabello')
                                                        .replace(/{fecha}/g, 'Lunes, 12 de Octubre, 2026')
                                                        .replace(/{hora}/g, '10:00 AM')
                                                        .replace(/{profesional}/g, 'Carlos Barbero')
                                                        .replace(/{ubicacion}/g, 'VATOS ALFA Barber Shop Suc1 (Av. Cerro Sombrerete 1001)')
                                                        .replace(/\*(.*?)\*/g, '<strong style="font-weight: 600;">$1</strong>')
                                                        .replace(/_(.*?)_/g, '<em style="font-style: italic;">$1</em>')
                                                        .replace(/~(.*?)~/g, '<del>$1</del>')
                                                }}
                                            />
                                            <span className="text-[10px] text-gray-400 self-end mt-1 uppercase">09:00</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <hr className="border-border my-6"/>

                            <div>
                                <h3 className="text-lg font-medium mb-2">Alertas Visuales en Agenda</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Configura las animaciones en la agenda (desvanecido) que indican cuando falta enviar un mensaje.
                                </p>
                                
                                <div className="space-y-4 max-w-2xl">
                                    <div className="flex items-center justify-between p-4 border rounded-lg">
                                        <div className="space-y-0.5">
                                            <Label className="text-base">Alerta de Confirmación Pendiente</Label>
                                            <p className="text-sm text-muted-foreground">Animar la cita si no se ha enviado el mensaje de confirmación.</p>
                                        </div>
                                        <Controller name="whatsappConfirmationAnimation" control={form.control} render={({ field }) => (
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        )} />
                                    </div>

                                    <div className="flex items-center justify-between p-4 border rounded-lg">
                                        <div className="space-y-0.5">
                                            <Label className="text-base">Alerta de Recordatorio Pendiente</Label>
                                            <p className="text-sm text-muted-foreground">Animar la cita si no se ha enviado el mensaje de recordatorio.</p>
                                        </div>
                                        <Controller name="whatsappReminderAnimation" control={form.control} render={({ field }) => (
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        )} />
                                    </div>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* AGENDA COMPORTAMIENTO */}
                    <AccordionItem value="agenda" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6 font-semibold text-base">Comportamiento de reservas</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0">
                            {isLoading ? (
                                <div className="p-4"><Skeleton className="h-48 w-full" /></div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="mb-4">
                                        <h4 className="text-sm font-medium mb-2">Datos requeridos para agendar localmente</h4>
                                        <p className="text-sm text-muted-foreground mb-4">Define qué información es obligatoria al crear una cita desde el panel administrativo.</p>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Datos del cliente</TableHead>
                                                <TableHead className="text-center">Usar en agenda</TableHead>
                                                <TableHead className="text-center">Obligatorio en agenda</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {customerFields.map(field => (
                                                <TableRow key={field.id}>
                                                    <TableCell className="font-medium">{field.label}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Controller
                                                            name={`customerFields.${field.id}.use`}
                                                            control={form.control}
                                                            render={({ field: switchField }) => (
                                                                <Switch checked={switchField.value} onCheckedChange={switchField.onChange} />
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Controller
                                                            name={`customerFields.${field.id}.required`}
                                                            control={form.control}
                                                            render={({ field: switchField }) => (
                                                                <Switch checked={switchField.value} onCheckedChange={switchField.onChange} disabled={!form.watch(`customerFields.${field.id}.use`)} />
                                                            )}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </AccordionContent>
                    </AccordionItem>

                </Accordion>

                <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm z-10">
                    <Button type="submit" disabled={isSubmitting || isLoading}>
                        {(isSubmitting || isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </div>

            </form>
        </div>
    );
}
