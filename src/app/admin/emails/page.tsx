
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, PlusCircle, Trash2, Edit, MoreHorizontal, CheckCircle, Mail, Cake } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AddSenderModal } from '@/components/admin/emails/add-sender-modal';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


const initialSenders = [
  { email: 'vatosalfa@gmail.com', confirmed: true },
  { email: 'contacto@vatosalfa.com', confirmed: false },
];

export type Sender = typeof initialSenders[0];

export default function EmailsSettingsPage() {
    const { toast } = useToast();
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
            birthdayButtonLink: 'https://vatosalfabarbershop.site.agendapro.com/mx'
        }
    });

    const onSubmit = (data: unknown) => {
        setIsSubmitting(true);
        console.log("Email settings saved:", data);
        setTimeout(() => {
            setIsSubmitting(false);
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en la configuración de tus emails han sido guardados."
            })
        }, 1500);
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
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Configuraciones de emails</CardTitle>
                        <CardDescription>Correos para enviar notificaciones a tus clientes.</CardDescription>
                    </div>
                    <Button type="button" variant="outline" onClick={openAddModal}>
                        <PlusCircle className="mr-2 h-4 w-4"/> Agregar Correo
                    </Button>
                </CardHeader>
                <CardContent>
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
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Firma emails</CardTitle>
                    <CardDescription>Esta firma se agregará al final de todos los correos que envíes a tus clientes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Controller
                        name="signature"
                        control={form.control}
                        render={({ field }) => (
                            <Textarea {...field} rows={6} placeholder="Escribe tu firma aquí..." />
                        )}
                    />
                     <p className="text-xs text-muted-foreground mt-2">Este es un editor de texto simple. Un editor de texto enriquecido (Rich Text Editor) permitiría más opciones de formato.</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Email de cumpleaños</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
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
                                       <Input id="birthday-button-link" {...field} placeholder="https://..." />
                                    )}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
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

    {senderToDelete && (
        <AlertDialog open={!!senderToDelete} onOpenChange={() => setSenderToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. El correo &quot;{senderToDelete.email}&quot; será eliminado permanentemente.
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
    )}
    </>
  );
}
