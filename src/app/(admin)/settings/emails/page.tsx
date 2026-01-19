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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';


const initialSenders = [
    { email: 'vatosalfa@gmail.com', confirmed: true },
    { email: 'contacto@vatosalfa.com', confirmed: false },
];

export type Sender = typeof initialSenders[0];

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
    const [senders, setSenders] = useState<Sender[]>(initialSenders);
    const [editingSender, setEditingSender] = useState<Sender | null>(null);
    const [senderToDelete, setSenderToDelete] = useState<Sender | null>(null);

    const form = useForm({
        defaultValues: {
            signature: 'Saludos, El equipo de VATOS ALFA Barber Shop',
            enableBirthdayEmail: true,
            birthdayEmailBody: '¡Feliz cumpleaños, [Nombre Cliente]! Esperamos que tengas un día increíble. ¡Te esperamos pronto para celebrar!',
            birthdayButtonLink: '/book',
            confirmationEmailNote: '', // Added field
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
        }
    });

    useEffect(() => {
        const loadSettings = async () => {
            if (!db) return;
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

                // 2. Load Email Config (Signature)
                const emailConfigDoc = await getDoc(doc(db, 'configuracion', 'emails'));
                if (emailConfigDoc.exists()) {
                    form.setValue('signature', emailConfigDoc.data().signature || '');
                }

            } catch (error) {
                console.error("Error loading settings:", error);
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

    const handleSaveSender = (newEmail: string) => {
        if (editingSender) {
            // Edit mode
            setSenders(prev => prev.map(s => s.email === editingSender.email ? { ...s, email: newEmail } : s));
            toast({
                title: "Correo actualizado con éxito",
                description: `El correo ha sido cambiado a ${newEmail}.`,
            });
        } else {
            // Add mode
            setSenders(prev => [...prev, { email: newEmail, confirmed: false }]);
            toast({
                title: "Correo agregado con éxito",
                description: `Se ha enviado un correo de confirmación a ${newEmail}.`,
            });
        }
        closeModal();
    }

    const handleDeleteSender = () => {
        if (!senderToDelete) return;
        setSenders(prev => prev.filter(s => s.email !== senderToDelete.email));
        toast({
            title: "Correo eliminado",
            description: `El correo "${senderToDelete.email}" ha sido eliminado.`,
        });
        setSenderToDelete(null);
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
                                    <TableHead>Confirmado</TableHead>
                                    <TableHead className="text-right">Opciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {senders.map((sender) => (
                                    <TableRow key={sender.email}>
                                        <TableCell className="font-medium">{sender.email}</TableCell>
                                        <TableCell>
                                            <span className={`flex items-center ${sender.confirmed ? 'text-green-600' : 'text-yellow-600'}`}>
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                                {sender.confirmed ? 'Confirmado' : 'Pendiente'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Abrir menú</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
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
                                    <div className="space-y-2">
                                        <Label htmlFor="confirmationEmailNote">Notas predefinidas</Label>
                                        <Textarea
                                            id="confirmationEmailNote"
                                            placeholder="Ej: Favor de llegar 5 minutos antes de la hora de tu cita."
                                            maxLength={75}
                                            {...form.register('confirmationEmailNote')}
                                        />
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            Este mensaje aparecerá en la pantalla de confirmación. Máximo 75 caracteres.
                                        </p>
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
                                            maxLength={75}
                                            {...form.register('profConfirmationEmailNote')}
                                        />
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            Este mensaje aparecerá en el correo. Máximo 75 caracteres.
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
                        title="Email de cumpleaños"
                    >
                        <div className="space-y-6">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <Label htmlFor="enable-birthday-email" className="font-medium">Activar cumpleaños</Label>
                                <Controller
                                    name="enableBirthdayEmail"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Switch id="enable-birthday-email" checked={field.value} onCheckedChange={field.onChange} />
                                    )}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="font-semibold text-center">Previsualización</h4>
                                    <div className="border rounded-lg p-4 bg-muted/30">
                                        <div className="w-full max-w-sm mx-auto bg-background p-6 rounded-md shadow-md">
                                            <div className="flex justify-center mb-4">
                                                <Mail className="h-10 w-10 text-primary" />
                                            </div>
                                            <div className="w-full h-32 bg-muted rounded-md flex items-center justify-center mb-4">
                                                <Cake className="h-16 w-16 text-muted-foreground" />
                                            </div>
                                            <p className="text-center text-sm mb-4">{form.watch('birthdayEmailBody')}</p>
                                            <Button className="w-full" disabled>
                                                {form.watch('birthdayButtonLink') ? 'Visitar Enlace' : 'Botón'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="font-semibold">Contenido del email</h4>
                                    <div className="space-y-2">
                                        <Label htmlFor="birthday-email-body">Cuerpo del email</Label>
                                        <Controller
                                            name="birthdayEmailBody"
                                            control={form.control}
                                            render={({ field }) => (
                                                <Textarea id="birthday-email-body" {...field} rows={6} />
                                            )}
                                        />
                                        <p className="text-xs text-muted-foreground">Usa `[Nombre Cliente]` para personalizar el saludo.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="birthday-button-link">Enlace web del botón</Label>
                                        <Controller
                                            name="birthdayButtonLink"
                                            control={form.control}
                                            render={({ field }) => (
                                                <Input id="birthday-button-link" {...field} placeholder="/book" />
                                            )}
                                        />
                                    </div>
                                </div>
                            </div>
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
