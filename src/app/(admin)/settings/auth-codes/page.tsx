'use client';

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, Pencil, Trash2, Sparkles, Copy, Check, Clock, ShieldCheck } from "lucide-react";
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
import { createOneTimeAuthCode } from '@/lib/auth-code-validator';
import { logAuditAction } from '@/lib/audit-logger';

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

export default function AuthCodesSettingsPage() {
    const { toast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCode, setEditingCode] = useState<AuthCode | null>(null);
    const [codeToDelete, setCodeToDelete] = useState<AuthCode | null>(null);
    const [queryKey, setQueryKey] = useState(0);

    // Estado para generador de códigos de un solo uso (4 dígitos)
    const [oneTimePurpose, setOneTimePurpose] = useState('');
    const [expiresInMinutes, setExpiresInMinutes] = useState<number>(30);
    const [isGeneratingOneTime, setIsGeneratingOneTime] = useState(false);
    const [lastGeneratedCode, setLastGeneratedCode] = useState<{ code: string; expiresAt: string; purpose: string } | null>(null);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    const { data: authCodes, loading } = useFirestoreQuery<AuthCode>('codigos_autorizacion', queryKey);
    const { db, user } = useAuth();

    const fixedCodes = useMemo(
        () => (authCodes || []).filter((c) => !c.is_one_time),
        [authCodes]
    );

    const oneTimeCodes = useMemo(
        () =>
            (authCodes || [])
                .filter((c) => c.is_one_time === true)
                .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
        [authCodes]
    );

    const openModalForNew = () => {
        setEditingCode(null);
        setIsModalOpen(true);
    };

    const openModalForEdit = (code: AuthCode) => {
        setEditingCode(code);
        setIsModalOpen(true);
    };

    const handleDataUpdated = () => {
        setQueryKey((prev) => prev + 1);
        setIsModalOpen(false);
    };

    const handleGenerateOneTimeCode = async () => {
        if (!db || isGeneratingOneTime) return;
        setIsGeneratingOneTime(true);
        try {
            const creatorName = user?.displayName || user?.email || 'Administración';
            const cleanPurpose = oneTimePurpose.trim() || 'Autorización única (Recepción / Caja / Anticipos)';
            const result = await createOneTimeAuthCode({
                db,
                createdBy: creatorName,
                purpose: cleanPurpose,
                expiresInMinutes,
            });

            setLastGeneratedCode({
                code: result.code,
                expiresAt: result.expiresAt,
                purpose: cleanPurpose,
            });
            setOneTimePurpose('');
            setQueryKey((prev) => prev + 1);

            await logAuditAction({
                action: 'Generar Código de 1 Uso (4 dígitos)',
                details: `Se generó el código temporal de 1 uso [${result.code}] válido por ${expiresInMinutes} min. Nota: ${cleanPurpose}`,
                userId: user?.uid || 'unknown',
                userName: creatorName,
                userRole: user?.role,
                severity: 'info',
                localId: user?.local_id || 'default',
            });

            toast({
                title: `Código generado: ${result.code}`,
                description: `Válido por ${expiresInMinutes} minutos para una sola operación.`,
            });
        } catch (error) {
            console.error('Error generating one-time code:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo generar el código de un solo uso.',
            });
        } finally {
            setIsGeneratingOneTime(false);
        }
    };

    const handleCopyCode = (pin: string) => {
        navigator.clipboard?.writeText(pin);
        setCopiedCode(pin);
        toast({
            title: 'Código copiado',
            description: `El código ${pin} se copió al portapapeles.`,
        });
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleDeleteCode = async () => {
        if (!codeToDelete || !db) return;
        try {
            await deleteDoc(doc(db, 'codigos_autorizacion', codeToDelete.id));
            toast({
                title: "Código eliminado",
                description: `El código "${codeToDelete.name}" ha sido eliminado.`,
            });
            handleDataUpdated();
        } catch (error) {
            console.error("Error deleting auth code:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el código.' });
        } finally {
            setCodeToDelete(null);
        }
    };

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
    };

    const getOneTimeStatus = (code: AuthCode): { label: string; status: 'available' | 'used' | 'expired' } => {
        if (code.used) {
            return { label: 'Utilizado', status: 'used' };
        }
        if (code.expires_at) {
            const expMs = Date.parse(code.expires_at);
            if (!isNaN(expMs) && Date.now() > expMs) {
                return { label: 'Expirado', status: 'expired' };
            }
        }
        if (!code.active) {
            return { label: 'Inactivo', status: 'expired' };
        }
        return { label: 'Disponible (1 uso)', status: 'available' };
    };

    return (
        <>
            <div className="flex-1 space-y-5 max-w-5xl pb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-border/60">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Códigos de Autorización</h2>
                        <p className="text-xs text-muted-foreground hidden sm:block">
                            Genera códigos temporales de 4 dígitos de un solo uso o administra tus códigos maestros fijos para autorizar exenciones de anticipo, caja y reservas.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={openModalForNew} variant="outline" className="h-8 sm:h-9 px-3.5 sm:px-4 text-xs font-semibold gap-1.5 w-fit border-border/80">
                            <KeyRound className="h-3.5 w-3.5 text-slate-400" />
                            <span>Agregar Código Fijo</span>
                        </Button>
                    </div>
                </div>

                {/* SECCIÓN 1: CÓDIGOS TEMPORALES DE UN SOLO USO (4 DÍGITOS) */}
                <Card className="border-2 border-blue-500/60 shadow-xs overflow-hidden">
                    <CardHeader className="py-3 px-3.5 sm:px-5 border-b border-border/50 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-[#C5A880] shrink-0" />
                                <CardTitle className="text-sm font-bold tracking-tight text-white">
                                    Códigos Temporales de Un Solo Uso (4 Dígitos)
                                </CardTitle>
                            </div>
                            <Badge variant="outline" className="border-[#C5A880]/40 bg-[#C5A880]/10 text-[#C5A880] text-[10px] font-sans font-semibold py-0 px-2">
                                Se queman automáticamente al primer uso
                            </Badge>
                        </div>
                        <CardDescription className="text-xs text-slate-300 mt-0.5">
                            Úsalos para autorizar a Recepción una sola operación (omitir anticipo por esta ocasión, cancelar reserva, ajuste en caja o descarga) sin revelar tu código maestro fijo. También puedes pedírselos a Janet.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3.5 sm:p-4 space-y-3.5">
                        {/* Generador rápido en 1 clic */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <Input
                                type="text"
                                placeholder="Nota o motivo opcional (ej. Omitir anticipo de cliente en recepción)"
                                value={oneTimePurpose}
                                onChange={(e) => setOneTimePurpose(e.target.value)}
                                className="h-9 text-xs flex-1"
                            />
                            <div className="flex items-center gap-2 shrink-0">
                                <select
                                    value={expiresInMinutes}
                                    onChange={(e) => setExpiresInMinutes(Number(e.target.value) || 30)}
                                    className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value={15}>Vigencia: 15 min</option>
                                    <option value={30}>Vigencia: 30 min</option>
                                    <option value={60}>Vigencia: 60 min</option>
                                </select>
                                <Button
                                    type="button"
                                    onClick={handleGenerateOneTimeCode}
                                    disabled={isGeneratingOneTime}
                                    className="h-9 px-4 text-xs font-bold btn-vatos-alfa shrink-0"
                                >
                                    {isGeneratingOneTime ? (
                                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    ) : (
                                        <KeyRound className="h-3.5 w-3.5 mr-1.5 text-[#C5A880]" />
                                    )}
                                    Generar Código 4 Dígitos
                                </Button>
                            </div>
                        </div>

                        {/* Banner del código recién generado */}
                        {lastGeneratedCode && (
                            <div className="rounded-xl border-2 border-blue-500 bg-[#0d1424] text-white p-3 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="h-5 w-5 text-[#C5A880] shrink-0" />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">
                                                Código Temporal Listo:
                                            </span>
                                            <span className="text-xl font-bold tracking-[0.25em] text-[#C5A880] font-mono bg-white/5 px-2.5 py-0.5 rounded-lg border border-[#C5A880]/30">
                                                {lastGeneratedCode.code}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-300 mt-0.5">
                                            {lastGeneratedCode.purpose} • Válido para 1 sola operación antes de expirar.
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCopyCode(lastGeneratedCode.code)}
                                    className="h-8 px-3 text-xs font-semibold border-blue-400/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20 hover:text-white rounded-lg"
                                >
                                    {copiedCode === lastGeneratedCode.code ? (
                                        <>
                                            <Check className="h-3.5 w-3.5 mr-1.5 text-blue-300" />
                                            Copiado
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-3.5 w-3.5 mr-1.5 text-blue-300" />
                                            Copiar PIN
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* Tabla de códigos de 1 uso y bitácora */}
                        <div className="rounded-xl border border-border/60 overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground w-28">PIN (4 dígitos)</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Motivo / Nota</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground hidden md:table-cell">Generado por</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center w-32">Estado</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Bitácora de Uso</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-right w-14"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow className="h-9">
                                            <TableCell colSpan={6} className="py-2 px-3"><Skeleton className="h-4 w-full" /></TableCell>
                                        </TableRow>
                                    ) : oneTimeCodes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-14 text-xs text-muted-foreground">
                                                Aún no se han generado códigos temporales de un solo uso.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        oneTimeCodes.slice(0, 15).map((item) => {
                                            const st = getOneTimeStatus(item);
                                            return (
                                                <TableRow key={item.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                    <TableCell className="py-1.5 px-3 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={cn(
                                                                "font-mono font-bold tracking-wider px-1.5 py-0.5 rounded border text-xs",
                                                                st.status === 'available'
                                                                    ? "text-[#C5A880] border-[#C5A880]/40 bg-[#C5A880]/10"
                                                                    : "text-muted-foreground border-border/50 bg-muted/20 line-through"
                                                            )}>
                                                                {item.code}
                                                            </span>
                                                            {st.status === 'available' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyCode(item.code)}
                                                                    className="text-slate-400 hover:text-white transition-colors p-1"
                                                                    title="Copiar PIN"
                                                                >
                                                                    <Copy className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">
                                                        {item.purpose || item.name}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-xs text-muted-foreground hidden md:table-cell">
                                                        {item.created_by || 'Administración'}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-center">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "text-[10px] font-sans font-medium py-0 px-2 rounded-full",
                                                                st.status === 'available' && "border-blue-500/40 text-blue-400 bg-blue-500/10",
                                                                st.status === 'used' && "border-[#C5A880]/40 text-[#C5A880] bg-[#C5A880]/10",
                                                                st.status === 'expired' && "border-border/60 text-muted-foreground bg-muted/20"
                                                            )}
                                                        >
                                                            {st.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">
                                                        {item.used ? (
                                                            <div className="leading-tight">
                                                                <span className="font-semibold text-foreground">{item.used_in_module || 'Operación autorizada'}</span>
                                                                {item.used_by && <span className="ml-1">por {item.used_by}</span>}
                                                                {item.used_details && (
                                                                    <span className="block text-[11px] text-muted-foreground truncate max-w-xs" title={item.used_details}>
                                                                        {item.used_details}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : st.status === 'available' && item.expires_at ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-blue-400">
                                                                <Clock className="h-3 w-3" />
                                                                Expira {new Date(item.expires_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-muted-foreground">Sin utilizar (Expirado)</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-right">
                                                        <button
                                                            type="button"
                                                            className="text-slate-400 hover:text-red-400 transition-colors p-1"
                                                            onClick={() => setCodeToDelete(item)}
                                                            title="Eliminar registro"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* VISTA ESCRITORIO: Tabla Compacta de Códigos Fijos (hidden sm:block) */}
                <div className="hidden sm:block">
                    <Card className="border border-border/70 shadow-xs overflow-hidden">
                        <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                            <div className="flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-slate-400 shrink-0" />
                                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                    Códigos Maestros Fijos ({fixedCodes.length})
                                </CardTitle>
                            </div>
                            <CardDescription className="text-xs text-muted-foreground mt-0.5">
                                Códigos PIN permanentes de administración y gerencia.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground">Nombre</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center w-20">Activo</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Código</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center">Reservas / Anticipos</TableHead>
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
                                    ) : fixedCodes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center h-20 text-xs text-muted-foreground">
                                                No hay códigos fijos creados. Haz clic en &quot;Agregar Código Fijo&quot; para registrar uno.
                                            </TableCell>
                                        </TableRow>
                                    ) : fixedCodes.map(code => (
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
                            Códigos Maestros Fijos ({fixedCodes.length})
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
                    ) : fixedCodes.length === 0 ? (
                        <Card className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/80">
                            No hay códigos fijos creados. Toca &quot;Agregar Código Fijo&quot; para registrar uno.
                        </Card>
                    ) : fixedCodes.map(code => (
                        <div
                            key={code.id}
                            className="rounded-xl border border-border/70 bg-card p-3 shadow-xs space-y-2.5"
                        >
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
                                Esta acción no se puede deshacer. Se eliminará permanentemente el código de autorización &quot;{codeToDelete.name}&quot;.
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
