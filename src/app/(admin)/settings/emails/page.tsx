'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, PlusCircle, Trash2, Edit, MoreHorizontal, CheckCircle, Mail, Cake, ChevronDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AddSenderModal } from '@/components/settings/emails/add-sender-modal';
import { EmailPreview } from '@/components/settings/emails/email-preview';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';

// Verified domain - emails with this domain are auto-confirmed
const VERIFIED_DOMAIN = 'vatosalfa.com';

export type Sender = {
    email: string;
    confirmed: boolean;
    isPrimary?: boolean;
};

function CollapsibleCard({ title, description, children, defaultOpen = false, action }: { title: string, description?: string, children: React.ReactNode, defaultOpen?: boolean, action?: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <Card>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors flex flex-row items-center justify-between space-y-0">
                        <div className="space-y-1.5 text-left pr-4">
                            <CardTitle>{title}</CardTitle>
                            {description && <CardDescription>{description}</CardDescription>}
                        </div>
                        <div className="flex items-center gap-2">
                            {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
                            <Button variant="ghost" size="sm" className="w-9 p-0 bg-transparent hover:bg-transparent" type="button">
                                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                                <span className="sr-only">Toggle</span>
                            </Button>
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="pt-0">
                        {children}
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    )
}

export default function EmailsSettingsPage() {
    const { toast } = useToast();
    const { db } = useAuth(); // Get db
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSenderModalOpen, setIsSenderModalOpen] = useState(false);
    const [senders, setSenders] = useState<Sender[]>([]);
    const [editingSender, setEditingSender] = useState<Sender | null>(null);
    const [senderToDelete, setSenderToDelete] = useState<Sender | null>(null);
    const [isLoadingSenders, setIsLoadingSenders] = useState(true);

    const form = useForm({
        defaultValues: {
            signature: 'Saludos, El equipo de VATOS ALFA Barber Shop',

            confirmationEmailNote: '', // Added field
            // Confirmation Template Defaults
            confirmSubject: 'Confirmación de Cita',
            confirmHeadline: '¡Hola {nombre}, tu cita está confirmada!',
            confirmWhatsappText: 'Contáctanos por WhatsApp',
            // New visibility flags
            showDate: true,
            showTime: true,
            showLocation: true,
            showServices: true,
            showProfessional: true,
            enableConfirmationEmail: true,
            // Professional Email Settings
            enableProfessionalConfirmationEmail: true,
            profConfirmationEmailNote: '',
            profShowDate: true,
            profShowTime: true,
            profShowLocation: true,
            profShowServices: true,
            profShowClientName: true,
            // Reminder Settings
            enableReminders: true,
            reminderHoursBefore: 24,
            // Reminder Template Defaults
            reminderSubject: '¡Recordatorio de Cita!',
            reminderHeadline: '¡{nombre}, recordatorio de tu cita!',
            reminderSubHeadline: 'Reserva Agendada',
            reminderFooterNote: 'Te esperamos 5 minutos antes de tu cita.',
            reminderWhatsappText: 'Contáctanos por WhatsApp',
        }
    });

    useEffect(() => {
        const loadSettings = async () => {
            if (!db) return;
            setIsLoadingSenders(true);
            try {
                // 1. Load Website Settings (Confirmation Note + Visibility Flags)
                const websiteDoc = await getDoc(doc(db, 'settings', 'website'));
                if (websiteDoc.exists()) {
                    const data = websiteDoc.data();
                    form.setValue('confirmationEmailNote', data.predefinedNotes || '');

                    // Load visibility flags if they exist, otherwise default to true
                    if (data.confirmationEmailConfig) {
                        form.setValue('showDate', data.confirmationEmailConfig.showDate ?? true);
                        form.setValue('showTime', data.confirmationEmailConfig.showTime ?? true);
                        form.setValue('showLocation', data.confirmationEmailConfig.showLocation ?? true);
                        form.setValue('showServices', data.confirmationEmailConfig.showServices ?? true);
                        form.setValue('showProfessional', data.confirmationEmailConfig.showProfessional ?? true);
                        form.setValue('enableConfirmationEmail', data.confirmationEmailConfig.enabled ?? true);
                    }

                    const cTpl = data.confirmationEmailTemplate || {};
                    form.setValue('confirmSubject', cTpl.subject || 'Confirmación de Cita');
                    form.setValue('confirmHeadline', cTpl.headline || '¡Hola {nombre}, tu cita está confirmada!');
                    form.setValue('confirmWhatsappText', cTpl.whatsappText || 'Contáctanos por WhatsApp');

                    if (data.professionalConfirmationEmailConfig) {
                        form.setValue('enableProfessionalConfirmationEmail', data.professionalConfirmationEmailConfig.enabled ?? true);
                        form.setValue('profConfirmationEmailNote', data.professionalConfirmationEmailConfig.note ?? '');
                        form.setValue('profShowDate', data.professionalConfirmationEmailConfig.showDate ?? true);
                        form.setValue('profShowTime', data.professionalConfirmationEmailConfig.showTime ?? true);
                        form.setValue('profShowLocation', data.professionalConfirmationEmailConfig.showLocation ?? true);
                        form.setValue('profShowServices', data.professionalConfirmationEmailConfig.showServices ?? true);
                        form.setValue('profShowClientName', data.professionalConfirmationEmailConfig.showClientName ?? true);
                    }
                }

                // 1.5 Load Reminder Config
                const reminderDoc = await getDoc(doc(db, 'configuracion', 'recordatorios'));
                if (reminderDoc.exists()) {
                    const data = reminderDoc.data();
                    const config = data.notifications?.appointment_reminder ?? {};
                    form.setValue('enableReminders', config.enabled !== false);
                    form.setValue('reminderHoursBefore', config.timing?.hours_before || 24);

                    const tpl = config.template || {};
                    form.setValue('reminderSubject', tpl.subject || '¡Recordatorio de Cita!');
                    form.setValue('reminderHeadline', tpl.headline || '¡{nombre}, recordatorio de tu cita!');
                    form.setValue('reminderSubHeadline', tpl.subHeadline || 'Reserva Agendada');
                    form.setValue('reminderFooterNote', tpl.footerNote || 'Te esperamos 5 minutos antes de tu cita.');
                    form.setValue('reminderWhatsappText', tpl.whatsappText || 'Contáctanos por WhatsApp');
                }

                // 2. Load Email Config (Signature + Senders)
                const emailConfigDoc = await getDoc(doc(db, 'configuracion', 'emails'));
                if (emailConfigDoc.exists()) {
                    const emailData = emailConfigDoc.data();
                    form.setValue('signature', emailData.signature || '');

                    // Load senders from Firebase
                    if (emailData.senders && Array.isArray(emailData.senders)) {
                        setSenders(emailData.senders);
                    } else {
                        // Default sender if none configured
                        setSenders([{ email: 'contacto@vatosalfa.com', confirmed: true, isPrimary: true }]);
                    }
                } else {
                    // Default sender if no config exists
                    setSenders([{ email: 'contacto@vatosalfa.com', confirmed: true, isPrimary: true }]);
                }

            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setIsLoadingSenders(false);
            }
        };
        loadSettings();
    }, [db, form]);

    const onSubmit = async (data: any) => {
        if (!db) return;
        setIsSubmitting(true);
        try {
            // 1. Save Website Settings
            await setDoc(doc(db, 'settings', 'website'), {
                predefinedNotes: data.confirmationEmailNote,
                confirmationEmailConfig: {
                    showDate: data.showDate,
                    showTime: data.showTime,
                    showLocation: data.showLocation,
                    showServices: data.showServices,
                    showProfessional: data.showProfessional,
                    enabled: data.enableConfirmationEmail
                },
                confirmationEmailTemplate: {
                    subject: data.confirmSubject,
                    headline: data.confirmHeadline,
                    whatsappText: data.confirmWhatsappText
                },
                professionalConfirmationEmailConfig: {
                    enabled: data.enableProfessionalConfirmationEmail,
                    note: data.profConfirmationEmailNote,
                    showDate: data.profShowDate,
                    showTime: data.profShowTime,
                    showLocation: data.profShowLocation,
                    showServices: data.profShowServices,
                    showClientName: data.profShowClientName
                }
            }, { merge: true });

            // 1.5 Save Reminder Config
            await setDoc(doc(db, 'configuracion', 'recordatorios'), {
                notifications: {
                    appointment_reminder: {
                        enabled: data.enableReminders,
                        timing: {
                            hours_before: data.reminderHoursBefore,
                            type: 'hours_before'
                        },
                        template: {
                            subject: data.reminderSubject,
                            headline: data.reminderHeadline,
                            subHeadline: data.reminderSubHeadline,
                            footerNote: data.reminderFooterNote,
                            whatsappText: data.reminderWhatsappText,
                        }
                    }
                }
            }, { merge: true });

            // 2. Save Email Config
            await setDoc(doc(db, 'configuracion', 'emails'), {
                signature: data.signature
            }, { merge: true });

            console.log("Email settings saved:", data);

            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en la configuración de tus emails han sido guardados."
            });
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Hubo un problema al guardar la configuración."
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    // Helper to check if email is from verified domain
    const isEmailFromVerifiedDomain = (email: string) => {
        return email.toLowerCase().endsWith(`@${VERIFIED_DOMAIN}`);
    };

    // Save senders to Firebase
    const saveSendersToFirebase = async (newSenders: Sender[]) => {
        if (!db) return;
        try {
            await setDoc(doc(db, 'configuracion', 'emails'), {
                senders: newSenders
            }, { merge: true });
        } catch (error) {
            console.error('Error saving senders:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        }
    };

    const handleSaveSender = async (newEmail: string) => {
        // Auto-confirm if from verified domain
        const isConfirmed = isEmailFromVerifiedDomain(newEmail);

        let newSenders: Sender[];

        if (editingSender) {
            // Edit mode
            newSenders = senders.map(s =>
                s.email === editingSender.email
                    ? { ...s, email: newEmail, confirmed: isConfirmed }
                    : s
            );
            toast({
                title: "Correo actualizado con éxito",
                description: `El correo ha sido cambiado a ${newEmail}.`,
            });
        } else {
            // Add mode - if it's the first sender, make it primary
            const isPrimary = senders.length === 0;
            newSenders = [...senders, { email: newEmail, confirmed: isConfirmed, isPrimary }];

            if (isConfirmed) {
                toast({
                    title: "Correo agregado con éxito",
                    description: `El correo ${newEmail} está listo para usar (dominio verificado).`,
                });
            } else {
                toast({
                    title: "Correo agregado",
                    description: `El correo ${newEmail} requiere verificación de dominio en Resend.`,
                    variant: 'destructive'
                });
            }
        }

        setSenders(newSenders);
        await saveSendersToFirebase(newSenders);
        closeModal();
    };

    const handleDeleteSender = async () => {
        if (!senderToDelete) return;

        // Don't allow deleting the primary sender if it's the only one
        if (senderToDelete.isPrimary && senders.length === 1) {
            toast({
                variant: 'destructive',
                title: 'No se puede eliminar',
                description: 'Debes tener al menos un correo remitente.',
            });
            setSenderToDelete(null);
            return;
        }

        let newSenders = senders.filter(s => s.email !== senderToDelete.email);

        // If we deleted the primary, make the first remaining one primary
        if (senderToDelete.isPrimary && newSenders.length > 0) {
            newSenders[0].isPrimary = true;
        }

        setSenders(newSenders);
        await saveSendersToFirebase(newSenders);

        toast({
            title: "Correo eliminado",
            description: `El correo "${senderToDelete.email}" ha sido eliminado.`,
        });
        setSenderToDelete(null);
    };

    const handleSetPrimary = async (email: string) => {
        const newSenders = senders.map(s => ({
            ...s,
            isPrimary: s.email === email
        }));

        setSenders(newSenders);
        await saveSendersToFirebase(newSenders);

        toast({
            title: "Correo principal actualizado",
            description: `${email} es ahora el remitente principal.`,
        });
    };

    const openAddModal = () => {
        setEditingSender(null);
        setIsSenderModalOpen(true);
    };

    const openEditModal = (sender: Sender) => {
        setEditingSender(sender);
        setIsSenderModalOpen(true);
    };

    const closeModal = () => {
        setIsSenderModalOpen(false);
        setEditingSender(null);
        // Force cleanup of body styles in case dialog didn't clean up properly
        setTimeout(() => {
            document.body.style.pointerEvents = "";
            document.body.style.overflow = "";
        }, 0);
    };



    return (
        <>
            <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Configuración de Emails</h2>
                    <p className="text-muted-foreground">
                        Gestiona los correos remitentes, la firma y las notificaciones automáticas.
                    </p>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-5xl">
                    <CollapsibleCard
                        title="Configuraciones de emails"
                        description="Correos para enviar notificaciones a tus clientes."
                        action={
                            <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); openAddModal(); }}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Agregar Correo
                            </Button>
                        }
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Remitente</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Opciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingSenders ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center h-24">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : senders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                            No hay correos configurados. Agrega uno para comenzar.
                                        </TableCell>
                                    </TableRow>
                                ) : senders.map((sender) => (
                                    <TableRow key={sender.email}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                {sender.email}
                                                {sender.isPrimary && (
                                                    <Badge className="bg-primary/10 text-primary border-primary/30">
                                                        <Star className="mr-1 h-3 w-3 fill-current" /> Principal
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`flex items-center ${sender.confirmed ? 'text-primary' : 'text-yellow-600'}`}>
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                                {sender.confirmed ? 'Verificado' : 'Pendiente'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu modal={false}>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Abrir menú</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {!sender.isPrimary && sender.confirmed && (
                                                        <DropdownMenuItem onClick={() => handleSetPrimary(sender.email)}>
                                                            <Star className="mr-2 h-4 w-4" /> Usar como principal
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => openEditModal(sender)}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setSenderToDelete(sender)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                    </CollapsibleCard>

                    <CollapsibleCard
                        title="Firma emails"
                        description="Esta firma se agregará al final de todos los correos que envíes a tus clientes."
                    >
                        <Controller
                            name="signature"
                            control={form.control}
                            render={({ field }) => (
                                <Textarea {...field} rows={6} placeholder="Escribe tu firma aquí..." />
                            )}
                        />
                        <p className="text-xs text-muted-foreground mt-2">Este es un editor de texto simple. Un editor de texto enriquecido (Rich Text Editor) permitiría más opciones de formato.</p>
                    </CollapsibleCard>

                    <CollapsibleCard
                        title="Correo para confirmar cita (Cliente)"
                        description="Personaliza el correo que reciben tus clientes al confirmar una reserva."
                    >
                        <div className="space-y-6">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <Label htmlFor="enable-confirmation-email" className="font-medium">Activar correos de confirmación</Label>
                                <Controller
                                    name="enableConfirmationEmail"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Switch id="enable-confirmation-email" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>

                            {form.watch('enableConfirmationEmail') && (
                                <>
                                    <div className="space-y-4 pt-4 border-t">
                                        <h4 className="font-medium text-sm text-foreground mb-4">Personalizar Mensaje</h4>

                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                                            <div className="space-y-4 order-2 xl:order-1">
                                                <div className="space-y-2">
                                                    <Label htmlFor="confirmSubject">Asunto del Correo</Label>
                                                    <Input id="confirmSubject" {...form.register('confirmSubject')} />
                                                    <p className="text-[0.8rem] text-muted-foreground">El nombre de la empresa se agregará automáticamente al final.</p>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="confirmHeadline">Título Principal</Label>
                                                    <Input id="confirmHeadline" {...form.register('confirmHeadline')} />
                                                    <p className="text-[0.8rem] text-muted-foreground">Usa <code>{'{nombre}'}</code> para insertar el nombre del cliente.</p>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="confirmationEmailNote">Nota al pie (Recuadro)</Label>
                                                    <Textarea
                                                        id="confirmationEmailNote"
                                                        placeholder="Ej: Favor de llegar 5 minutos antes de la hora de tu cita."
                                                        maxLength={150}
                                                        {...form.register('confirmationEmailNote')}
                                                    />
                                                    <p className="text-[0.8rem] text-muted-foreground">
                                                        Este mensaje también aparecerá en la pantalla de confirmación.
                                                    </p>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="confirmWhatsappText">Texto botón WhatsApp</Label>
                                                    <Input id="confirmWhatsappText" {...form.register('confirmWhatsappText')} />
                                                </div>
                                            </div>

                                            <div className="order-1 xl:order-2 xl:sticky xl:top-6">
                                                <EmailPreview config={form.watch()} type="confirmation" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t">
                                        <h4 className="font-medium text-sm text-muted-foreground">Datos visibles en el correo</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="showDate" className="cursor-pointer">Mostrar Fecha</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="showDate"
                                                    render={({ field }) => (
                                                        <Switch id="showDate" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="showTime" className="cursor-pointer">Mostrar Hora</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="showTime"
                                                    render={({ field }) => (
                                                        <Switch id="showTime" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="showLocation" className="cursor-pointer">Mostrar Lugar</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="showLocation"
                                                    render={({ field }) => (
                                                        <Switch id="showLocation" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="showServices" className="cursor-pointer">Mostrar Servicios</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="showServices"
                                                    render={({ field }) => (
                                                        <Switch id="showServices" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="showProfessional" className="cursor-pointer">Mostrar Profesional</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="showProfessional"
                                                    render={({ field }) => (
                                                        <Switch id="showProfessional" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </CollapsibleCard>

                    <CollapsibleCard
                        title="Correo para confirmar cita (Profesional)"
                        description="Personaliza el correo que reciben los profesionales al confirmar una reserva."
                    >
                        <div className="space-y-6">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <Label htmlFor="enable-prof-confirmation-email" className="font-medium">Activar correos de confirmación</Label>
                                <Controller
                                    name="enableProfessionalConfirmationEmail"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Switch id="enable-prof-confirmation-email" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>

                            {form.watch('enableProfessionalConfirmationEmail') && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="profConfirmationEmailNote">Notas predefinidas</Label>
                                        <Textarea
                                            id="profConfirmationEmailNote"
                                            placeholder="Mensaje para el profesional..."
                                            maxLength={150}
                                            {...form.register('profConfirmationEmailNote')}
                                        />
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            Este mensaje aparecerá en el correo. Máximo 150 caracteres.
                                        </p>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t">
                                        <h4 className="font-medium text-sm text-muted-foreground">Datos visibles en el correo</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="profShowDate" className="cursor-pointer">Mostrar Fecha</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="profShowDate"
                                                    render={({ field }) => (
                                                        <Switch id="profShowDate" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="profShowTime" className="cursor-pointer">Mostrar Hora</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="profShowTime"
                                                    render={({ field }) => (
                                                        <Switch id="profShowTime" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="profShowLocation" className="cursor-pointer">Mostrar Lugar</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="profShowLocation"
                                                    render={({ field }) => (
                                                        <Switch id="profShowLocation" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="profShowServices" className="cursor-pointer">Mostrar Servicios</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="profShowServices"
                                                    render={({ field }) => (
                                                        <Switch id="profShowServices" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="profShowClientName" className="cursor-pointer">Nombre del cliente</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="profShowClientName"
                                                    render={({ field }) => (
                                                        <Switch id="profShowClientName" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </CollapsibleCard>

                    <CollapsibleCard
                        title="Recordatorios de citas"
                        description="Configura el envío automático de recordatorios por correo."
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <Label htmlFor="enable-reminders">Activar recordatorios</Label>
                                <Controller
                                    name="enableReminders"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Switch id="enable-reminders" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>

                            {form.watch('enableReminders') && (<>
                                <div className="space-y-2 p-4 border rounded-lg bg-card/50">
                                    <Label htmlFor="reminderHoursBefore">Anticipación (Horas)</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id="reminderHoursBefore"
                                            type="number"
                                            min={1}
                                            max={48}
                                            {...form.register('reminderHoursBefore', { valueAsNumber: true })}
                                            className="w-24"
                                        />
                                        <span className="text-sm text-muted-foreground">horas antes de la cita.</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Se recomienda <strong>24 horas</strong>. El sistema revisará y enviará recordatorios a las citas que comiencen dentro de este tiempo.
                                    </p>
                                </div>

                                <div className="space-y-4 pt-4 border-t">
                                    <h4 className="font-medium text-sm text-foreground mb-4">Personalizar Mensajes</h4>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                                        <div className="space-y-4 order-2 xl:order-1">
                                            <div className="space-y-2">
                                                <Label htmlFor="reminderSubject">Asunto del Correo</Label>
                                                <Input id="reminderSubject" {...form.register('reminderSubject')} />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="reminderHeadline">Título Principal</Label>
                                                <Input id="reminderHeadline" {...form.register('reminderHeadline')} />
                                                <p className="text-[0.8rem] text-muted-foreground">Usa <code>{'{nombre}'}</code> para insertar el nombre del cliente.</p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="reminderSubHeadline">Subtítulo</Label>
                                                <Input id="reminderSubHeadline" {...form.register('reminderSubHeadline')} />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="reminderFooterNote">Nota al pie (Recuadro)</Label>
                                                <Input id="reminderFooterNote" {...form.register('reminderFooterNote')} />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="reminderWhatsappText">Texto botón WhatsApp</Label>
                                                <Input id="reminderWhatsappText" {...form.register('reminderWhatsappText')} />
                                            </div>
                                        </div>

                                        <div className="order-1 xl:order-2 xl:sticky xl:top-6">
                                            <EmailPreview config={form.watch()} type="reminder" />
                                        </div>
                                    </div>
                                </div>
                            </>)}
                        </div>
                    </CollapsibleCard>

                    <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </div>
                </form >


            </div >

            <AddSenderModal
                isOpen={isSenderModalOpen}
                onClose={closeModal}
                onSave={handleSaveSender}
                sender={editingSender}
            />

            {
                senderToDelete && (
                    <AlertDialog open={!!senderToDelete} onOpenChange={() => setSenderToDelete(null)}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. El correo "{senderToDelete.email}" será eliminado permanentemente.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteSender} className="bg-destructive hover:bg-destructive/90">
                                    Sí, eliminar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )
            }
        </>
    );
}
