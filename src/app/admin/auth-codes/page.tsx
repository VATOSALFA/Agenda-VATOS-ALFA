
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, PlusCircle, Edit, Trash2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AuthCodeModal } from '@/components/admin/auth-codes/auth-code-modal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuthCode } from '@/lib/types';


const PermissionBadge = ({ permitted }: { permitted: boolean }) => (
    <Badge variant={permitted ? 'default' : 'secondary'} className={cn(
        'font-medium',
        permitted ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100' : 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100'
    )}>
        {permitted ? 'Permitido' : 'Denegado'}
    </Badge>
);

const ToggleField = ({ name, label, control, description }: { name: keyof typeof form.getValues, label: string, control: any, description?: string }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
        <div>
            <Label htmlFor={name} className="font-medium">{label}</Label>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Controller
            name={name}
            control={control}
            render={({ field }) => (
                <Switch
                    id={name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                />
            )}
        />
    </div>
);


export default function AuthCodesSettingsPage() {
    const { toast } = useToast();
    const { db } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCode, setEditingCode] = useState<AuthCode | null>(null);
    const [codeToDelete, setCodeToDelete] = useState<AuthCode | null>(null);
    const [queryKey, setQueryKey] = useState(0);

    const { data: authCodes, loading } = useFirestoreQuery<AuthCode>('codigos_autorizacion', queryKey);

    const form = useForm({
        defaultValues: {
            requireForReservations: false,
            requireForCashbox: false,
            requireForDownloads: true,
        }
    });

    const onSubmit = (data: unknown) => {
        setIsSubmitting(true);
        console.log("Authorization codes settings saved:", data);
        setTimeout(() => {
            setIsSubmitting(false);
            toast({
                title: "Configuración guardada con éxito",
                description: "Los cambios en los códigos de autorización han sido guardados."
            })
        }, 1500);
    }

    const openModalForNew = () => {
        setEditingCode(null);
        setIsModalOpen(true);
    }

    const openModalForEdit = (code: AuthCode) => {
        setEditingCode(code);
        setIsModalOpen(true);
    }

    const handleDataUpdated = () => {
        setQueryKey(prev => prev + 1);
        setIsModalOpen(false);
    }
    
    const handleDeleteCode = async () => {
        if (!codeToDelete || !db) return;
        try {
            await deleteDoc(doc(db, 'codigos_autorizacion', codeToDelete.id));
            toast({
                title: "Código eliminado",
                description: `El código para "${codeToDelete.name}" ha sido eliminado.`,
            });
            handleDataUpdated();
        } catch (error) {
            console.error("Error deleting auth code:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el código.' });
        } finally {
            setCodeToDelete(null);
        }
    }

    const handleToggleActive = async (codeId: string, active: boolean) => {
        try {
            if (!db) return;
            const codeRef = doc(db, 'codigos_autorizacion', codeId);
            await updateDoc(codeRef, { active });
            toast({
                title: `Código ${active ? 'activado' : 'desactivado'}`
            });
            handleDataUpdated();
        } catch (error) {
            console.error("Error toggling active status:", error);
            toast({ variant: 'destructive', title: 'Error al actualizar.' });
        }
    }

  return (
    <>
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Códigos de autorización</h2>
            <p className="text-muted-foreground">
                Configura códigos y permisos para tu equipo.
            </p>
        </div>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-5xl">
            <Card>
                <CardHeader>
                    <CardDescription>
                        Aquí puedes configurar los códigos para tu equipo, definiendo permisos para ingresar y modificar reservas, y para hacer uso del sistema de caja e ingresar y modificar sus componentes.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ToggleField name="requireForReservations" label="Requerir código de cajero para acciones de reservas" control={form.control} />
                    <ToggleField name="requireForCashbox" label="Requerir código de cajero para acciones de caja" control={form.control} />
                    <ToggleField name="requireForDownloads" label="Requerir código de cajero para descargar archivos y reportes" control={form.control} />
                </CardContent>
            </Card>

             <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar Cambios
                </Button>
            </div>
        </form>
        
        <Card>
            <CardHeader className="flex flex-row justify-between items-center">
                <div>
                    <CardTitle>Listado de códigos</CardTitle>
                    <CardDescription>Configura códigos y permisos para tu equipo.</CardDescription>
                </div>
                 <Button variant="outline" onClick={openModalForNew}><PlusCircle className="mr-2 h-4 w-4"/> Agregar Código</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Activo</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Reservas</TableHead>
                            <TableHead>Caja</TableHead>
                            <TableHead>Descarga De Archivos</TableHead>
                            <TableHead className="text-right">Opciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({length: 3}).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                                </TableRow>
                            ))
                        ) : authCodes.length === 0 ? (
                             <TableRow>
                                <TableCell colSpan={7} className="text-center h-24">
                                    No hay códigos creados.
                                </TableCell>
                             </TableRow>
                        ) : authCodes.map(code => (
                            <TableRow key={code.id}>
                                <TableCell className="font-medium">{code.name}</TableCell>
                                <TableCell><Switch checked={code.active} onCheckedChange={(checked) => handleToggleActive(code.id, checked)} /></TableCell>
                                <TableCell>••••••</TableCell>
                                <TableCell><PermissionBadge permitted={code.reserves} /></TableCell>
                                <TableCell><PermissionBadge permitted={code.cashbox} /></TableCell>
                                <TableCell><PermissionBadge permitted={code.download} /></TableCell>
                                <TableCell className="text-right">
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="outline" size="sm" style={{backgroundColor: '#f59e0b', color: 'white', borderColor: '#d97706'}} onClick={() => openModalForEdit(code)}>
                                            <Edit className="mr-2 h-4 w-4" /> Editar
                                        </Button>
                                         <Button variant="destructive" size="sm" onClick={() => setCodeToDelete(code)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
    
    <AuthCodeModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleDataUpdated}
        code={editingCode}
    />

    {codeToDelete && (
        <AlertDialog open={!!codeToDelete} onOpenChange={() => setCodeToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Esta acción no se puede deshacer. Se eliminará permanentemente el código de autorización para &quot;{codeToDelete.name}&quot;.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteCode} className="bg-destructive hover:bg-destructive/90">
                        Sí, eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </>
  );
}
