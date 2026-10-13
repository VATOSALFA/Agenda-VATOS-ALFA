
'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, KeyRound, Pencil, Trash2 } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AuthCodeModal } from '@/components/settings/auth-codes/auth-code-modal';
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
    <Badge
        variant="outline"
        className={cn(
            'text-[10px] font-sans font-medium py-0 px-2 rounded-full',
            permitted
                ? 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                : 'border-border/60 text-muted-foreground'
        )}
    >
        {permitted ? 'Permitido' : 'Denegado'}
    </Badge>
);

const ToggleField = ({ name, label, control, description }: { name: string, label: string, control: any, description?: string }) => (
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCode, setEditingCode] = useState<AuthCode | null>(null);
    const [codeToDelete, setCodeToDelete] = useState<AuthCode | null>(null);
    const [queryKey, setQueryKey] = useState(0);

    const { data: authCodes, loading } = useFirestoreQuery<AuthCode>('codigos_autorizacion', queryKey);
    const { db } = useAuth();

    const form = useForm({
        defaultValues: {
            requireForReservations: false,
            requireForCashbox: false,
            requireForDownloads: true,
        }
    });

    const onSubmit = (data: any) => {
        setIsSubmitting(true);
        console.log("Authorization codes settings saved:", data);
        setTimeout(() => {
            setIsSubmitting(false);
            toast({
                title: "Configuración guardada",
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
        if (!db) return;
        try {
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
            <div className="flex-1 space-y-4 max-w-5xl pb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-border/60">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Códigos de Autorización</h2>
                        <p className="text-xs text-muted-foreground hidden sm:block">
                            Configura códigos PIN y permisos para que tu personal autorice operaciones especiales en caja y reservas.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={openModalForNew} variant="alfa" className="h-8 sm:h-9 px-3.5 sm:px-4 text-xs font-semibold gap-1.5 w-fit">
                            <KeyRound className="h-3.5 w-3.5" />
                            <span>Agregar Código</span>
                        </Button>
                    </div>
                </div>

                {/* VISTA ESCRITORIO: Tabla Compacta (hidden sm:block) */}
                <div className="hidden sm:block">
                    <Card className="border border-border/70 shadow-xs overflow-hidden">
                        <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                            <div className="flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-slate-400 shrink-0" />
                                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                    Listado de Códigos Activos
                                </CardTitle>
                            </div>
                            <CardDescription className="text-xs text-muted-foreground mt-0.5">
                                Permisos asignados a cada código PIN registrado en el sistema.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground">Nombre</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center w-20">Activo</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Código</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center">Reservas</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center">Caja</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center">Reportes</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center">Facturación</TableHead>
                                        <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground text-right w-24">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <TableRow key={i} className="h-9">
                                                <TableCell colSpan={8} className="py-2 px-3.5"><Skeleton className="h-4 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : authCodes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center h-20 text-xs text-muted-foreground">
                                                No hay códigos creados. Haz clic en "Agregar Código" para registrar uno.
                                            </TableCell>
                                        </TableRow>
                                    ) : authCodes.map(code => (
                                        <TableRow key={code.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                            <TableCell className="py-1.5 px-3.5 text-xs font-semibold text-foreground">{code.name}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-center">
                                                <Switch
                                                    checked={code.active}
                                                    onCheckedChange={(checked) => handleToggleActive(code.id, checked)}
                                                    className="scale-90"
                                                />
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs font-mono text-muted-foreground">••••••</TableCell>
                                            <TableCell className="py-1.5 px-3 text-center"><PermissionBadge permitted={code.reserves} /></TableCell>
                                            <TableCell className="py-1.5 px-3 text-center"><PermissionBadge permitted={code.cashbox} /></TableCell>
                                            <TableCell className="py-1.5 px-3 text-center"><PermissionBadge permitted={code.download} /></TableCell>
                                            <TableCell className="py-1.5 px-3 text-center"><PermissionBadge permitted={code.invoiced_sales ?? false} /></TableCell>
                                            <TableCell className="py-1.5 px-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
                                                        onClick={() => openModalForEdit(code)}
                                                        title="Editar código"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-white/10"
                                                        onClick={() => setCodeToDelete(code)}
                                                        title="Eliminar código"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                    {/* VISTA MÓVIL: Tarjetas compactas sin desplazamiento horizontal (sm:hidden) */}
                    <div className="sm:hidden space-y-2.5">
                        <div className="flex items-center gap-2 px-1">
                            <KeyRound className="h-4 w-4 text-slate-400 shrink-0" />
                            <h3 className="text-xs font-semibold text-foreground">
                                Listado de Códigos Activos ({authCodes.length})
                            </h3>
                        </div>

                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <Card key={i} className="p-3 border border-border/70">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-5 w-10 rounded-full" />
                                        </div>
                                        <Skeleton className="h-6 w-full" />
                                    </div>
                                </Card>
                            ))
                        ) : authCodes.length === 0 ? (
                            <Card className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/80">
                                No hay códigos creados. Toca "Agregar Código" para registrar uno.
                            </Card>
                        ) : authCodes.map(code => (
                            <div
                                key={code.id}
                                className="rounded-xl border border-border/70 bg-card p-3 shadow-xs space-y-2.5"
                            >
                                {/* Fila superior: Nombre, PIN y Acciones */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1 flex items-center gap-2">
                                        <span className="font-semibold text-xs text-foreground truncate">
                                            {code.name}
                                        </span>
                                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border/40">
                                            ••••••
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                            onClick={() => openModalForEdit(code)}
                                            title="Editar código"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                            onClick={() => setCodeToDelete(code)}
                                            title="Eliminar código"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Fila intermedia: Badges de permisos en 2 columnas */}
                                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-border/40 text-xs">
                                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-border/40">
                                        <span className="text-[11px] text-muted-foreground">Reservas</span>
                                        <PermissionBadge permitted={code.reserves} />
                                    </div>
                                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-border/40">
                                        <span className="text-[11px] text-muted-foreground">Caja</span>
                                        <PermissionBadge permitted={code.cashbox} />
                                    </div>
                                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-border/40">
                                        <span className="text-[11px] text-muted-foreground">Reportes</span>
                                        <PermissionBadge permitted={code.download} />
                                    </div>
                                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-border/40">
                                        <span className="text-[11px] text-muted-foreground">Facturación</span>
                                        <PermissionBadge permitted={code.invoiced_sales ?? false} />
                                    </div>
                                </div>

                                {/* Fila inferior: Estado Activo/Inactivo con Switch */}
                                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                                    <span className="text-[11px] font-medium text-muted-foreground">
                                        {code.active ? 'Código Activo' : 'Código Desactivado'}
                                    </span>
                                    <Switch
                                        checked={code.active}
                                        onCheckedChange={(checked) => handleToggleActive(code.id, checked)}
                                        className="scale-90"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
            </div>

            <AuthCodeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleDataUpdated}
                code={editingCode}
            />

            {codeToDelete && (
                <AlertDialog open={!!codeToDelete} onOpenChange={() => setCodeToDelete(null)}>
                    <AlertDialogContent className="border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente el código de autorización para &quot;{codeToDelete.name}&quot;.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl border-border/60">Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteCode} className="rounded-xl bg-destructive hover:bg-destructive/90 text-white">
                                Sí, eliminar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
}
