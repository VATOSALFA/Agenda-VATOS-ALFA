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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddSenderModal } from '@/components/settings/emails/add-sender-modal';
import { EmailPreview } from '@/components/settings/emails/email-preview';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';
import { sendTestCancellationEmail } from '@/lib/actions/booking';

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
                            <h3 className="font-semibold text-base">{title}</h3>
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
    const [companyDetails, setCompanyDetails] = useState({
        name: 'VATOS ALFA Barber Shop',
        logo: 'https://firebasestorage.googleapis.com/v0/b/agenda-1ae08.appspot.com/o/empresa%2Flogo.png?alt=media',
        phone: '442-123-4567',
        address: 'Av. Cerro Sombrerete 1001',
        secondaryColor: '#314177'
    });

    const [testEmailAddress, setTestEmailAddress] = useState('vatosalfa@gmail.com');
    const [isSendingTest, setIsSendingTest] = useState(false);

    const handleSendTestEmail = async () => {
        if (!testEmailAddress || !testEmailAddress.includes('@')) {
            toast({
                variant: 'destructive',
                title: 'Correo inválido',
                description: 'Por favor ingresa un correo electrónico válido.'
            });
            return;
        }
        setIsSendingTest(true);
        try {
            const res = await sendTestCancellationEmail(testEmailAddress);
            if (res.error) {
                toast({
                    variant: 'destructive',
                    title: 'Error al enviar prueba',
                    description: res.error
                });
            } else {
                toast({
                    title: '¡Correo de prueba enviado!',
                    description: `Se ha enviado el correo de cancelación a ${testEmailAddress}.`
                });
            }
        } catch (e: any) {
            toast({
                variant: 'destructive',
                title: 'Error inesperado',
                description: e.message || 'No se pudo enviar el correo de prueba.'
            });
        } finally {
            setIsSendingTest(false);
        }
    };

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
            // Cancellation Settings
            enableCancellationEmail: true,
            cancelSubject: 'Cancelación de Cita',
            cancelHeadline: '¡Hola {nombre}, tu cita ha sido cancelada!',
            cancellationEmailNote: 'Lamentamos informarte que tu cita ha sido cancelada. Si deseas volver a agendar con nosotros, puedes reservar una nueva cita en línea cuando gustes.',
            cancelButtonText: 'AGENDAR NUEVA CITA',
            cancelButtonUrl: 'https://vatosalfa.com/reservar',
            cancelWhatsappText: 'Contáctanos por WhatsApp',
            showCancelButton: true,
            cancelShowDate: true,
            cancelShowTime: true,
            cancelShowLocation: true,
            cancelShowServices: true,
            cancelShowProfessional: true,
            cancelShowReason: true,
            // Professional Email Settings
            enableProfessionalConfirmationEmail: true,
            profConfirmationEmailNote: '',
            profSubject: 'Nueva Cita - {cliente}',
            profHeadline: '¡{profesional}, tienes una nueva cita!',
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
            // Daily Summary Settings
            enableDailySummary: true,
            dailySummaryTime: '08:00',
            dailySummarySubject: 'Tu Agenda del Día',
            dailySummaryHeadline: 'Hola {nombre}, aquí está tu agenda programada para hoy.',
            // CC Admins Config
            notifyGeneralAdmin: false,
            notifyLocalAdmin: false,
            // Quick Actions
            enableQuickActions: false,
            showConfirmAction: true,
            showRescheduleAction: true,
            showCancelAction: true,
            // Reminder Quick Actions
            enableReminderQuickActions: false,
            showReminderConfirmAction: true,
            showReminderRescheduleAction: true,
            showReminderCancelAction: true,
        }
    });

    useEffect(() => {
        const loadSettings = async () => {
            if (!db) return;
            setIsLoadingSenders(true);
            try {
                // 0. Load Company Details for Preview
                const empresaSnap = await getDocs(query(collection(db, 'empresa'), limit(1)));
                if (!empresaSnap.empty) {
                    const eData = empresaSnap.docs[0].data();
                    setCompanyDetails(prev => ({
                        ...prev,
                        name: eData.name || prev.name,
                        logo: eData.logo_url || prev.logo,
                        secondaryColor: eData.theme?.secondaryColor || prev.secondaryColor
                    }));
                }

                const localesSnap = await getDocs(query(collection(db, 'locales'), limit(1)));
                if (!localesSnap.empty) {
                    const lData = localesSnap.docs[0].data();
                    setCompanyDetails(prev => ({
                        ...prev,
                        phone: lData.phone || prev.phone,
                        address: lData.address || prev.address
                    }));
                }

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

                    // Load Cancellation Config
                    if (data.cancellationEmailConfig) {
                        form.setValue('enableCancellationEmail', data.cancellationEmailConfig.enabled ?? true);
                        form.setValue('cancelShowDate', data.cancellationEmailConfig.showDate ?? true);
                        form.setValue('cancelShowTime', data.cancellationEmailConfig.showTime ?? true);
                        form.setValue('cancelShowLocation', data.cancellationEmailConfig.showLocation ?? true);
                        form.setValue('cancelShowServices', data.cancellationEmailConfig.showServices ?? true);
                        form.setValue('cancelShowProfessional', data.cancellationEmailConfig.showProfessional ?? true);
                        form.setValue('cancelShowReason', data.cancellationEmailConfig.showReason ?? true);
                        form.setValue('showCancelButton', data.cancellationEmailConfig.showButton ?? true);
                    }

                    if (data.cancellationEmailTemplate) {
                        const canTpl = data.cancellationEmailTemplate;
                        form.setValue('cancelSubject', canTpl.subject || 'Cancelación de Cita');
                        form.setValue('cancelHeadline', canTpl.headline || '¡Hola {nombre}, tu cita ha sido cancelada!');
                        form.setValue('cancellationEmailNote', canTpl.note || 'Lamentamos informarte que tu cita ha sido cancelada. Si deseas volver a agendar con nosotros, puedes reservar una nueva cita en línea cuando gustes.');
                        form.setValue('cancelButtonText', canTpl.buttonText || 'AGENDAR NUEVA CITA');
                        form.setValue('cancelButtonUrl', canTpl.buttonUrl || 'https://vatosalfa.com/reservar');
                        form.setValue('cancelWhatsappText', canTpl.whatsappText || 'Contáctanos por WhatsApp');
                    }

                    if (data.professionalConfirmationEmailConfig) {
                        form.setValue('enableProfessionalConfirmationEmail', data.professionalConfirmationEmailConfig.enabled ?? true);
                        form.setValue('profConfirmationEmailNote', data.professionalConfirmationEmailConfig.note ?? '');
                        form.setValue('profShowDate', data.professionalConfirmationEmailConfig.showDate ?? true);
                        form.setValue('profShowTime', data.professionalConfirmationEmailConfig.showTime ?? true);
                        form.setValue('profShowLocation', data.professionalConfirmationEmailConfig.showLocation ?? true);
                        form.setValue('profShowServices', data.professionalConfirmationEmailConfig.showServices ?? true);
                        form.setValue('profShowClientName', data.professionalConfirmationEmailConfig.showClientName ?? true);
                    }

                    if (data.professionalConfirmationEmailTemplate) {
                        const pTpl = data.professionalConfirmationEmailTemplate;
                        form.setValue('profSubject', pTpl.subject || 'Nueva Cita - {cliente}');
                        form.setValue('profHeadline', pTpl.headline || '¡{profesional}, tienes una nueva cita!');
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

                // 1.8 Load Daily Summary Config
                if (websiteDoc.exists()) {
                    const data = websiteDoc.data();
                    if (data.dailySummaryConfig) {
                        form.setValue('enableDailySummary', data.dailySummaryConfig.enabled ?? true);
                        form.setValue('dailySummaryTime', data.dailySummaryConfig.time || '08:00');
                        form.setValue('dailySummarySubject', data.dailySummaryConfig.subject || 'Tu Agenda del Día');
                        form.setValue('dailySummaryHeadline', data.dailySummaryConfig.headline || 'Hola {nombre}, aquí está tu agenda programada para hoy.');
                    }

                    if (data.ccAdminsConfig) {
                        form.setValue('notifyGeneralAdmin', data.ccAdminsConfig.notifyGeneralAdmin ?? false);
                        form.setValue('notifyLocalAdmin', data.ccAdminsConfig.notifyLocalAdmin ?? false);
                    }

                    if (data.quickActionsConfig) {
                        form.setValue('enableQuickActions', data.quickActionsConfig.enabled ?? false);
                        form.setValue('showConfirmAction', data.quickActionsConfig.showConfirm ?? true);
                        form.setValue('showRescheduleAction', data.quickActionsConfig.showReschedule ?? true);
                        form.setValue('showCancelAction', data.quickActionsConfig.showCancel ?? true);
                    }

                    if (data.reminderQuickActionsConfig) {
                        form.setValue('enableReminderQuickActions', data.reminderQuickActionsConfig.enabled ?? false);
                        form.setValue('showReminderConfirmAction', data.reminderQuickActionsConfig.showConfirm ?? true);
                        form.setValue('showReminderRescheduleAction', data.reminderQuickActionsConfig.showReschedule ?? true);
                        form.setValue('showReminderCancelAction', data.reminderQuickActionsConfig.showCancel ?? true);
                    }
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
                cancellationEmailConfig: {
                    enabled: data.enableCancellationEmail,
                    showDate: data.cancelShowDate,
                    showTime: data.cancelShowTime,
                    showLocation: data.cancelShowLocation,
                    showServices: data.cancelShowServices,
                    showProfessional: data.cancelShowProfessional,
                    showReason: data.cancelShowReason,
                    showButton: data.showCancelButton,
                },
                cancellationEmailTemplate: {
                    subject: data.cancelSubject,
                    headline: data.cancelHeadline,
                    note: data.cancellationEmailNote,
                    buttonText: data.cancelButtonText,
                    buttonUrl: data.cancelButtonUrl,
                    whatsappText: data.cancelWhatsappText,
                },
                professionalConfirmationEmailConfig: {
                    enabled: data.enableProfessionalConfirmationEmail,
                    note: data.profConfirmationEmailNote,
                    showDate: data.profShowDate,
                    showTime: data.profShowTime,
                    showLocation: data.profShowLocation,
                    showServices: data.profShowServices,
                    showClientName: data.profShowClientName
                },
                professionalConfirmationEmailTemplate: {
                    subject: data.profSubject,
                    headline: data.profHeadline
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

            // 1.8 Save Daily Summary Config (merge into website settings)
            await setDoc(doc(db, 'settings', 'website'), {
                dailySummaryConfig: {
                    enabled: data.enableDailySummary,
                    time: data.dailySummaryTime,
                    subject: data.dailySummarySubject,
                    headline: data.dailySummaryHeadline
                },
                ccAdminsConfig: {
                    notifyGeneralAdmin: data.notifyGeneralAdmin,
                    notifyLocalAdmin: data.notifyLocalAdmin
                },
                quickActionsConfig: {
                    enabled: data.enableQuickActions,
                    showConfirm: data.showConfirmAction,
                    showReschedule: data.showRescheduleAction,
                    showCancel: data.showCancelAction
                },
                reminderQuickActionsConfig: {
                    enabled: data.enableReminderQuickActions,
                    showConfirm: data.showReminderConfirmAction,
                    showReschedule: data.showReminderRescheduleAction,
                    showCancel: data.showReminderCancelAction
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
            <div className="flex-1 space-y-5 max-w-5xl pb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/60">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Configuración de Emails</h2>
                        <p className="text-xs text-muted-foreground">
                            Gestiona los correos remitentes, la firma oficial y las plantillas automáticas de notificación.
                        </p>
                    </div>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-5xl">
                    <CollapsibleCard
                        title="Correos Remitentes"
                        description="Cuentas autorizadas para enviar confirmaciones y recordatorios a tus clientes."
                        action={
                            <Button type="button" variant="alfa" size="sm" className="h-8 px-3 text-xs font-semibold" onClick={(e) => { e.preventDefault(); openAddModal(); }}>
                                <PlusCircle className="mr-1.5 h-3.5 w-3.5 text-white" /> Agregar Correo
                            </Button>
                        }
                    >
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground">Remitente</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Estado</TableHead>
                                    <TableHead className="py-1 px-3 text-right text-xs font-semibold text-foreground">Opciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingSenders ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="py-8 text-center">
                                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" />
                                        </TableCell>
                                    </TableRow>
                                ) : senders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="py-8 text-center text-xs text-muted-foreground">
                                            No hay correos configurados. Agrega uno para comenzar.
                                        </TableCell>
                                    </TableRow>
                                ) : senders.map((sender) => (
                                    <TableRow key={sender.email} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                        <TableCell className="py-1.5 px-3.5 text-xs font-medium">
                                            <div className="flex items-center gap-2">
                                                <span>{sender.email}</span>
                                                {sender.isPrimary && (
                                                    <Badge variant="outline" className="text-[10px] font-sans font-medium py-0 px-1.5 border-border/60 bg-muted/40">
                                                        <Star className="mr-1 h-3 w-3 text-[#C5A880] fill-[#C5A880]" /> Principal
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-xs">
                                            <span className={`inline-flex items-center ${sender.confirmed ? 'text-blue-500 font-medium' : 'text-muted-foreground'}`}>
                                                <CheckCircle className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                                                {sender.confirmed ? 'Verificado' : 'Pendiente'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-right">
                                            <DropdownMenu modal={false}>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white rounded-md hover:bg-white/10">
                                                        <span className="sr-only">Abrir menú</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-44 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card p-1 space-y-0.5">
                                                    {!sender.isPrimary && sender.confirmed && (
                                                        <DropdownMenuItem onClick={() => handleSetPrimary(sender.email)} className="text-xs font-semibold py-2 px-2.5 rounded-lg cursor-pointer">
                                                            <Star className="mr-2 h-3.5 w-3.5 text-[#C5A880]" /> Usar como principal
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => openEditModal(sender)} className="text-xs font-semibold py-2 px-2.5 rounded-lg cursor-pointer">
                                                        <Edit className="mr-2 h-3.5 w-3.5 text-slate-400" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setSenderToDelete(sender)} className="text-xs font-semibold py-2 px-2.5 rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
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


                                                <div className="pt-4 border-t space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <Label className="font-semibold">Acciones Rápidas (WhatsApp)</Label>
                                                            <p className="text-[0.8rem] text-muted-foreground text-xs">Muestra botones interactivos para confirmar, reagendar o cancelar.</p>
                                                        </div>
                                                        <Controller
                                                            name="enableQuickActions"
                                                            control={form.control}
                                                            render={({ field }) => (
                                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                            )}
                                                        />
                                                    </div>

                                                    {form.watch('enableQuickActions') && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-4 pt-1">
                                                            <div className="flex items-center space-x-2">
                                                                <Controller
                                                                    name="showConfirmAction"
                                                                    control={form.control}
                                                                    render={({ field }) => (
                                                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                                    )}
                                                                />
                                                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Confirmar</Label>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <Controller
                                                                    name="showRescheduleAction"
                                                                    control={form.control}
                                                                    render={({ field }) => (
                                                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                                    )}
                                                                />
                                                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Reagendar</Label>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <Controller
                                                                    name="showCancelAction"
                                                                    control={form.control}
                                                                    render={({ field }) => (
                                                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                                    )}
                                                                />
                                                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Cancelar</Label>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="space-y-2 mt-4 pt-4 border-t">
                                                        <Label htmlFor="confirmWhatsappText">Texto botón WhatsApp</Label>
                                                        <Input id="confirmWhatsappText" {...form.register('confirmWhatsappText')} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="order-1 xl:order-2 xl:sticky xl:top-6">
                                                <EmailPreview config={form.watch()} type="confirmation" companyDetails={companyDetails} />
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
                        title="Correo de cancelación de cita (Cliente)"
                        description="Personaliza el correo que reciben tus clientes cuando su cita es cancelada."
                    >
                        <div className="space-y-6">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div>
                                    <Label htmlFor="enable-cancellation-email" className="font-medium">Activar correos de cancelación</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">Envía automáticamente una notificación por correo al cliente cuando una cita se cancela.</p>
                                </div>
                                <Controller
                                    name="enableCancellationEmail"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Switch id="enable-cancellation-email" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>

                            {form.watch('enableCancellationEmail') && (
                                <>
                                    <div className="space-y-4 pt-4 border-t">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-4 rounded-lg border">
                                            <div>
                                                <h4 className="font-semibold text-sm">Enviar correo de prueba</h4>
                                                <p className="text-xs text-muted-foreground">Envía un correo de muestra con este diseño para comprobar cómo lo recibe el cliente.</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="email"
                                                    value={testEmailAddress}
                                                    onChange={(e) => setTestEmailAddress(e.target.value)}
                                                    placeholder="vatosalfa@gmail.com"
                                                    className="w-56 h-9 text-xs"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    disabled={isSendingTest}
                                                    onClick={handleSendTestEmail}
                                                    className="gap-1.5 whitespace-nowrap"
                                                >
                                                    {isSendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                                                    <span>{isSendingTest ? 'Enviando...' : 'Enviar Prueba'}</span>
                                                </Button>
                                            </div>
                                        </div>

                                        <h4 className="font-medium text-sm text-foreground mb-4">Personalizar Mensaje</h4>

                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                                            <div className="space-y-4 order-2 xl:order-1">
                                                <div className="space-y-2">
                                                    <Label htmlFor="cancelSubject">Asunto del Correo</Label>
                                                    <Input id="cancelSubject" {...form.register('cancelSubject')} />
                                                    <p className="text-[0.8rem] text-muted-foreground">El nombre de la empresa se agregará automáticamente al final.</p>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="cancelHeadline">Título Principal</Label>
                                                    <Input id="cancelHeadline" {...form.register('cancelHeadline')} />
                                                    <p className="text-[0.8rem] text-muted-foreground">Usa <code>{'{nombre}'}</code> para insertar el nombre del cliente.</p>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label htmlFor="cancellationEmailNote">Nota en el Recuadro</Label>
                                                    <Textarea
                                                        id="cancellationEmailNote"
                                                        placeholder="Ej: Lamentamos informarte que tu cita ha sido cancelada..."
                                                        rows={3}
                                                        {...form.register('cancellationEmailNote')}
                                                    />
                                                </div>

                                                <div className="pt-3 border-t space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <Label className="font-semibold text-sm">Botón para Agendar Nueva Cita</Label>
                                                            <p className="text-[0.8rem] text-muted-foreground">Permite al cliente volver a reservar desde el correo.</p>
                                                        </div>
                                                        <Controller
                                                            name="showCancelButton"
                                                            control={form.control}
                                                            render={({ field }) => (
                                                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                            )}
                                                        />
                                                    </div>

                                                    {form.watch('showCancelButton') && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2">
                                                            <div className="space-y-1">
                                                                <Label htmlFor="cancelButtonText" className="text-xs">Texto del Botón</Label>
                                                                <Input id="cancelButtonText" {...form.register('cancelButtonText')} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label htmlFor="cancelButtonUrl" className="text-xs">Enlace de Reserva</Label>
                                                                <Input id="cancelButtonUrl" {...form.register('cancelButtonUrl')} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2 pt-3 border-t">
                                                    <Label htmlFor="cancelWhatsappText">Texto botón WhatsApp</Label>
                                                    <Input id="cancelWhatsappText" {...form.register('cancelWhatsappText')} />
                                                </div>
                                            </div>

                                            <div className="order-1 xl:order-2 xl:sticky xl:top-6">
                                                <EmailPreview config={form.watch()} type="cancellation" companyDetails={companyDetails} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t">
                                        <h4 className="font-medium text-sm text-muted-foreground">Datos visibles en el correo</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="cancelShowDate" className="cursor-pointer text-sm">Mostrar Fecha</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="cancelShowDate"
                                                    render={({ field }) => (
                                                        <Switch id="cancelShowDate" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="cancelShowTime" className="cursor-pointer text-sm">Mostrar Hora</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="cancelShowTime"
                                                    render={({ field }) => (
                                                        <Switch id="cancelShowTime" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="cancelShowLocation" className="cursor-pointer text-sm">Mostrar Lugar</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="cancelShowLocation"
                                                    render={({ field }) => (
                                                        <Switch id="cancelShowLocation" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="cancelShowServices" className="cursor-pointer text-sm">Mostrar Servicios</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="cancelShowServices"
                                                    render={({ field }) => (
                                                        <Switch id="cancelShowServices" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="cancelShowProfessional" className="cursor-pointer text-sm">Mostrar Profesional</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="cancelShowProfessional"
                                                    render={({ field }) => (
                                                        <Switch id="cancelShowProfessional" checked={field.value} onCheckedChange={field.onChange} />
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                                <Label htmlFor="cancelShowReason" className="cursor-pointer text-sm">Mostrar Motivo</Label>
                                                <Controller
                                                    control={form.control}
                                                    name="cancelShowReason"
                                                    render={({ field }) => (
                                                        <Switch id="cancelShowReason" checked={field.value} onCheckedChange={field.onChange} />
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
                                                                                                <Textarea id="reminderFooterNote" rows={3} {...form.register('reminderFooterNote')} />

                                            </div>

                                            <div className="space-y-4 pt-4 border-t border-dashed">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor="enableReminderQuickActions" className="font-semibold text-primary">Acciones Rápidas (WhatsApp)</Label>
                                                    <Controller
                                                        name="enableReminderQuickActions"
                                                        control={form.control}
                                                        render={({ field }) => (
                                                            <Switch id="enableReminderQuickActions" checked={field.value} onCheckedChange={field.onChange} />
                                                        )}
                                                    />
                                                </div>
                                                <p className="text-xs text-muted-foreground">Muestra botones interactivos para confirmar, reagendar o cancelar.</p>
                                                
                                                {form.watch('enableReminderQuickActions') && (
                                                    <div className="flex flex-wrap gap-4 pt-2">
                                                        <div className="flex items-center space-x-2">
                                                            <Controller
                                                                name="showReminderConfirmAction"
                                                                control={form.control}
                                                                render={({ field }) => (
                                                                    <Switch id="show-reminder-confirm" checked={field.value} onCheckedChange={field.onChange} />
                                                                )}
                                                            />
                                                            <Label htmlFor="show-reminder-confirm" className="text-[10px] uppercase font-bold text-muted-foreground cursor-pointer">Confirmar</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <Controller
                                                                name="showReminderRescheduleAction"
                                                                control={form.control}
                                                                render={({ field }) => (
                                                                    <Switch id="show-reminder-reschedule" checked={field.value} onCheckedChange={field.onChange} />
                                                                )}
                                                            />
                                                            <Label htmlFor="show-reminder-reschedule" className="text-[10px] uppercase font-bold text-muted-foreground cursor-pointer">Reagendar</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <Controller
                                                                name="showReminderCancelAction"
                                                                control={form.control}
                                                                render={({ field }) => (
                                                                    <Switch id="show-reminder-cancel" checked={field.value} onCheckedChange={field.onChange} />
                                                                )}
                                                            />
                                                            <Label htmlFor="show-reminder-cancel" className="text-[10px] uppercase font-bold text-muted-foreground cursor-pointer">Cancelar</Label>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2 pt-2">
                                                <Label htmlFor="reminderWhatsappText">Texto botón WhatsApp</Label>
                                                <Input id="reminderWhatsappText" {...form.register('reminderWhatsappText')} />
                                            </div>
                                        </div>

                                        <div className="order-1 xl:order-2 xl:sticky xl:top-6">
                                            <EmailPreview config={form.watch()} type="reminder" companyDetails={companyDetails} />
                                        </div>
                                    </div>
                                </div>
                            </>)}
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
                                <div className="space-y-4 pt-4 border-t">
                                    <h4 className="font-medium text-sm text-foreground mb-4">Personalizar Mensajes</h4>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">

                                        <div className="space-y-4 order-2 xl:order-1">
                                            <div className="space-y-2">
                                                <Label htmlFor="profSubject">Asunto del Correo</Label>
                                                <Input id="profSubject" {...form.register('profSubject')} />
                                                <p className="text-[0.8rem] text-muted-foreground">Usa <code>{'{cliente}'}</code> para insertar el nombre del cliente.</p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="profHeadline">Título Principal</Label>
                                                <Input id="profHeadline" {...form.register('profHeadline')} />
                                                <p className="text-[0.8rem] text-muted-foreground">Usa <code>{'{profesional}'}</code> para insertar el nombre del barbero.</p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="profConfirmationEmailNote">Nota al pie (Recuadro)</Label>
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
                                        </div>

                                        <div className="order-1 xl:order-2 xl:sticky xl:top-6">
                                            <EmailPreview config={form.watch()} type="professional" companyDetails={companyDetails} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CollapsibleCard>

                    <CollapsibleCard
                        title="¿Quieres recibir copia de los correos de confirmación de todos los profesionales?"
                        description="Mantén un seguimiento de las citas recibiendo una copia de los correos enviados a los barberos."
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                <div className="space-y-0.5">
                                    <Label htmlFor="notifyGeneralAdmin" className="text-base">Administrador General</Label>
                                    <p className="text-sm text-muted-foreground">Se enviará copia al administrador principal del sistema.</p>
                                </div>
                                <Controller
                                    control={form.control}
                                    name="notifyGeneralAdmin"
                                    render={({ field }) => (
                                        <Switch id="notifyGeneralAdmin" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>
                            
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                                <div className="space-y-0.5">
                                    <Label htmlFor="notifyLocalAdmin" className="text-base">Administradora del Local</Label>
                                    <p className="text-sm text-muted-foreground">Se enviará copia a la persona encargada de la sucursal correspondiente.</p>
                                </div>
                                <Controller
                                    control={form.control}
                                    name="notifyLocalAdmin"
                                    render={({ field }) => (
                                        <Switch id="notifyLocalAdmin" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>
                        </div>
                    </CollapsibleCard>

                    <CollapsibleCard
                        title="Resumen del día para profesionales"
                        description="Configura el envío automático del resumen de agenda para tus profesionales."
                    >
                        <div className="space-y-6">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <Label htmlFor="enable-daily-summary" className="font-medium">activar resumen diario automático</Label>
                                <Controller
                                    name="enableDailySummary"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Switch id="enable-daily-summary" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>

                            {form.watch('enableDailySummary') && (
                                <div className="space-y-4 pt-4 border-t">
                                    <h4 className="font-medium text-sm text-foreground mb-4">Personalizar Mensaje</h4>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                                        <div className="space-y-4 order-2 xl:order-1">

                                            <div className="space-y-2 p-4 border rounded-lg bg-card/50">
                                                <Label htmlFor="dailySummaryTime">Hora de envío automático</Label>
                                                <div className="flex items-center gap-2">
                                                    <Controller
                                                        control={form.control}
                                                        name="dailySummaryTime"
                                                        render={({ field }) => (
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <SelectTrigger className="w-[180px]">
                                                                    <SelectValue placeholder="Selecciona hora" />
                                                                </SelectTrigger>
                                                                <SelectContent className="max-h-[300px]">
                                                                    {Array.from({ length: 48 }).map((_, i) => {
                                                                        const hour = Math.floor(i / 2);
                                                                        const minute = i % 2 === 0 ? '00' : '30';
                                                                        const timeString = `${hour.toString().padStart(2, '0')}:${minute}`;
                                                                        return (
                                                                            <SelectItem key={timeString} value={timeString}>
                                                                                {timeString}
                                                                            </SelectItem>
                                                                        );
                                                                    })}
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                    <span className="text-sm text-muted-foreground">hora local.</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Se enviará todos los días a esta hora.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="dailySummarySubject">Asunto del Correo</Label>
                                                <Input id="dailySummarySubject" {...form.register('dailySummarySubject')} />
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="dailySummaryHeadline">Título Principal</Label>
                                                <Input id="dailySummaryHeadline" {...form.register('dailySummaryHeadline')} />
                                                <p className="text-[0.8rem] text-muted-foreground">Usa <code>{'{nombre}'}</code> para insertar el nombre del profesional.</p>
                                            </div>
                                        </div>

                                        <div className="order-1 xl:order-2 xl:sticky xl:top-6">
                                            <EmailPreview config={form.watch()} type="dailySummary" companyDetails={companyDetails} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CollapsibleCard>

                    <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm z-10 border-t border-border/40">
                        <Button type="submit" variant="alfa" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </div>
                </form>

            </div>

            <AddSenderModal
                isOpen={isSenderModalOpen}
                onClose={closeModal}
                onSave={handleSaveSender}
                sender={editingSender}
            />

            {
                senderToDelete && (
                    <AlertDialog open={!!senderToDelete} onOpenChange={() => setSenderToDelete(null)}>
                        <AlertDialogContent className="border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. El correo "{senderToDelete.email}" será eliminado permanentemente.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl border-border/60">Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteSender} className="rounded-xl bg-destructive hover:bg-destructive/90 text-white">
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
