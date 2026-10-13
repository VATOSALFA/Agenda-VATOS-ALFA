
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Info, Pencil, Trash2, ChevronLeft, ChevronRight, UserPlus, Save, Clock, Mail, Loader2, Users, ShieldCheck, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { useFirestoreQuery } from "@/hooks/use-firestore";
import { User, Local, Role } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { UserModal } from '@/components/settings/users/user-modal';
import { resendUserInvitation } from '@/lib/actions/users';
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
import { deleteUser } from '@/lib/actions/delete-user';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useToast } from '@/hooks/use-toast';
import { allPermissionCategories, roleIcons, initialRoles, type PermissionCategory } from '@/lib/permissions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';

const PermissionGroup = ({ category, currentPermissions, onPermissionChange, isDisabled }: { category: PermissionCategory, currentPermissions: string[], onPermissionChange: (key: string, checked: boolean) => void, isDisabled: boolean }) => {

    const allSubPermissions = category.subCategories?.flatMap(sc => sc.permissions.map(p => p.key)) || [];
    const allCategoryPermissions = [...(category.permissions?.map(p => p.key) || []), ...allSubPermissions];

    const isAllSelected = allCategoryPermissions.every(pKey => currentPermissions.includes(pKey));

    const handleMasterCheckboxChange = (checked: boolean | string) => {
        allCategoryPermissions.forEach(pKey => {
            onPermissionChange(pKey, !!checked);
        });
    }

    return (
        <Collapsible defaultOpen={false}>
            <div className="flex items-center justify-between p-2.5 border border-border/60 rounded-t-lg bg-muted/20 hover:bg-muted/40 transition-colors">
                <CollapsibleTrigger className="flex items-center gap-2 font-medium text-xs flex-grow text-left" disabled={isDisabled}>
                    <category.icon className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-foreground">{category.title}</span>
                </CollapsibleTrigger>
                <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleMasterCheckboxChange}
                    aria-label={`Seleccionar todo para ${category.title}`}
                    onClick={(e) => e.stopPropagation()}
                    disabled={isDisabled}
                    className="scale-90"
                />
            </div>
            <CollapsibleContent className="p-3 border border-t-0 border-border/60 rounded-b-lg bg-card space-y-2">
                <div className="space-y-2">
                    {category.permissions?.map(p => (
                        <div key={p.key} className="flex items-center gap-2">
                            <Checkbox id={`${category.title}-${p.key}`} checked={currentPermissions.includes(p.key)} onCheckedChange={(checked) => onPermissionChange(p.key, !!checked)} disabled={isDisabled} className="scale-90" />
                            <label htmlFor={`${category.title}-${p.key}`} className="text-xs text-muted-foreground cursor-pointer">{p.label}</label>
                        </div>
                    ))}
                    {category.subCategories?.map(sub => (
                        <div key={sub.title} className="ml-3 space-y-1.5 pt-1.5 border-t border-border/40">
                            <p className="font-semibold text-xs text-foreground">{sub.title}</p>
                            <div className="pl-1 space-y-1.5">
                                {sub.permissions.map(p => (
                                    <div key={p.key} className="flex items-center gap-2">
                                        <Checkbox id={`${category.title}-${sub.title}-${p.key}`} checked={currentPermissions.includes(p.key)} onCheckedChange={(checked) => onPermissionChange(p.key, !!checked)} disabled={isDisabled} className="scale-90" />
                                        <label htmlFor={`${category.title}-${sub.title}-${p.key}`} className="text-xs text-muted-foreground cursor-pointer">{p.label}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export default function UsersPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [queryKey, setQueryKey] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [sortBy, setSortBy] = useState<'default' | 'name' | 'role' | 'local'>('default');
    const { toast } = useToast();

    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios', queryKey);
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
    const { data: rolesData, loading: rolesLoading } = useFirestoreQuery<Role>('roles', queryKey);

    const [localRolesState, setLocalRolesState] = useState<Role[]>([]);

    useEffect(() => {
        if (!rolesLoading) {
            const combinedRoles = [...initialRoles];
            const firestoreRolesMap = new Map(rolesData.map(r => [r.title, r]));

            const mergedRoles = combinedRoles.map(initialRole => {
                const firestoreRole = firestoreRolesMap.get(initialRole.title);
                if (firestoreRole) {
                    return {
                        ...initialRole,
                        id: firestoreRole.id,
                        permissions: firestoreRole.permissions,
                        historyRestrictionDays: firestoreRole.historyRestrictionDays
                    };
                }
                return { ...initialRole, id: initialRole.title.toLowerCase().replace(/ /g, '_') };
            });

            setLocalRolesState(mergedRoles);
        }
    }, [rolesData, rolesLoading]);


    const localMap = useMemo(() => new Map(locales.map(l => [l.id, l.name])), [locales]);
    const isLoading = usersLoading || localesLoading || rolesLoading;

    const filteredUsers = useMemo(() => {
        return users.filter(user =>
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const sortedUsers = useMemo(() => {
        const sorted = [...filteredUsers];
        switch (sortBy) {
            case 'name':
                return sorted.sort((a, b) => a.name.localeCompare(b.name));
            case 'role':
                return sorted.sort((a, b) => a.role.localeCompare(b.role));
            case 'local':
                return sorted.sort((a, b) => {
                    const localA = a.local_id ? localMap.get(a.local_id) || '' : 'Todos';
                    const localB = b.local_id ? localMap.get(b.local_id) || '' : 'Todos';
                    return localA.localeCompare(localB);
                });
            default: // 'default' - Admin general first
                return sorted.sort((a, b) => {
                    const roleA = a.role;
                    const roleB = b.role;
                    if (roleA === 'Administrador general' && roleB !== 'Administrador general') return -1;
                    if (roleA !== 'Administrador general' && roleB === 'Administrador general') return 1;
                    return a.name.localeCompare(b.name);
                });
        }
    }, [filteredUsers, sortBy, localMap]);

    const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
    const paginatedUsers = sortedUsers.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleDataUpdated = () => {
        setQueryKey(prev => prev + 1);
    }

    const openNewModal = () => {
        setEditingUser(null);
        setIsModalOpen(true);
    }

    const [resendingUserId, setResendingUserId] = useState<string | null>(null);

    const handleResendInviteFromTable = async (user: User) => {
        setResendingUserId(user.id);
        try {
            const result = await resendUserInvitation(user.email, user.name);
            if (!result.success) {
                throw new Error(result.error);
            }
            toast({
                title: "Invitación reenviada con éxito",
                description: `Se envió un correo a ${user.email} con las instrucciones para configurar su contraseña y acceder.`,
            });
        } catch (error: any) {
            console.error("Error al reenviar invitación:", error);
            toast({
                variant: "destructive",
                title: "Error al reenviar",
                description: error.message || "No se pudo reenviar el correo de invitación.",
            });
        } finally {
            setResendingUserId(null);
        }
    };

    const openEditModal = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    }

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        try {
            const result = await deleteUser(userToDelete.id);
            if (!result.success) {
                throw new Error(result.error);
            }
            toast({ title: 'Usuario eliminado correctamente' });
            handleDataUpdated();
        } catch (error) {
            console.error("Error deleting user:", error);
            toast({ variant: 'destructive', title: 'Error al eliminar', description: 'No se pudo eliminar el usuario de la autenticación.' });
        } finally {
            setUserToDelete(null);
        }
    }



    const handleHistoryRestrictionChange = (roleId: string, days: number | undefined) => {
        setLocalRolesState(currentRoles =>
            currentRoles.map(role => {
                if (role.id === roleId) {
                    return { ...role, historyRestrictionDays: days };
                }
                return role;
            })
        );
    }

    const handlePermissionChange = (roleId: string, permissionKey: string, checked: boolean) => {
        setLocalRolesState(currentRoles =>
            currentRoles.map(role => {
                if (role.id === roleId) {
                    const newPermissions = checked
                        ? [...role.permissions, permissionKey]
                        : role.permissions.filter((p: string) => p !== permissionKey);
                    return { ...role, permissions: Array.from(new Set(newPermissions)) };
                }
                return role;
            })
        );
    }

    const handleSaveRolePermissions = async (roleId: string) => {
        const roleToUpdate = localRolesState.find(r => r.id === roleId);
        if (!roleToUpdate) return;

        try {
            const docId = roleToUpdate.id; // Use consistent ID
            const roleRef = doc(db, 'roles', docId);
            const dataToSave: any = {
                title: roleToUpdate.title,
                permissions: roleToUpdate.permissions
            };

            if (roleToUpdate.historyRestrictionDays !== undefined) {
                dataToSave.historyRestrictionDays = roleToUpdate.historyRestrictionDays;
            } else {
                dataToSave.historyRestrictionDays = null;
            }

            await setDoc(roleRef, dataToSave, { merge: true });

            toast({ title: 'Permisos guardados', description: `Los permisos para el rol ${roleToUpdate.title} se han actualizado.` });
            handleDataUpdated();
        } catch (error) {
            console.error("Error updating role:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los permisos.' });
        }
    }

    return (
        <div className="flex-1 space-y-4 max-w-6xl pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Usuarios del Sistema</h2>
                    <p className="text-xs text-muted-foreground hidden sm:block">
                        Gestiona las cuentas de acceso, roles y permisos de tu personal en la plataforma.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={openNewModal} variant="alfa" className="h-8 sm:h-9 px-3.5 sm:px-4 text-xs font-semibold gap-1.5 shrink-0">
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Nuevo Usuario</span>
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="usuarios" className="w-full space-y-4">
                <TabsList className="grid w-full grid-cols-2 h-auto p-1 bg-muted/20 border border-border/60 rounded-xl">
                    <TabsTrigger
                        value="usuarios"
                        className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                    >
                        <Users className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Usuarios ({sortedUsers.length})</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="roles"
                        className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                    >
                        <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Roles y Permisos</span>
                    </TabsTrigger>
                </TabsList>

                {/* TAB 1: USUARIOS */}
                <TabsContent value="usuarios" className="mt-0 space-y-3.5 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                    {/* Barra de Filtros y Búsqueda */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Buscar por nombre o correo..."
                                className="pl-9 h-8 text-xs rounded-lg"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                                <SelectTrigger className="h-8 text-xs w-full sm:w-[160px] rounded-lg border-border/80">
                                    <SelectValue placeholder="Ordenar por" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                    <SelectItem value="default">Por defecto</SelectItem>
                                    <SelectItem value="name">Nombre</SelectItem>
                                    <SelectItem value="role">Rol</SelectItem>
                                    <SelectItem value="local">Sucursal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* VISTA ESCRITORIO: Tabla Compacta (Regla 6) */}
                    <div className="hidden sm:block">
                        <Card className="border border-border/70 shadow-xs overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground">Nombre</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Email</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Rol asignado</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Local</TableHead>
                                        <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground text-right w-28">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <TableRow key={i} className="h-9">
                                                <TableCell colSpan={5} className="py-2 px-3.5"><Skeleton className="h-4 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : paginatedUsers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-20 text-center text-xs text-muted-foreground">
                                                No se encontraron usuarios.
                                            </TableCell>
                                        </TableRow>
                                    ) : paginatedUsers.map((user) => (
                                        <TableRow key={user.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                            <TableCell className="py-1.5 px-3.5 text-xs font-semibold text-foreground">{user.name}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{user.email}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">
                                                <Badge variant="outline" className="text-[10px] font-sans font-medium py-0 px-2 rounded-full border-border/60">
                                                    {user.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{user.local_id ? localMap.get(user.local_id) : 'Todos'}</TableCell>
                                            <TableCell className="py-1.5 px-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
                                                        disabled={resendingUserId === user.id}
                                                        onClick={() => handleResendInviteFromTable(user)}
                                                        title={`Reenviar correo de invitación a ${user.email}`}
                                                    >
                                                        {resendingUserId === user.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                                        ) : (
                                                            <Mail className="h-3.5 w-3.5" />
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
                                                        onClick={() => openEditModal(user)}
                                                        title="Editar usuario"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-white/10"
                                                        onClick={() => setUserToDelete(user)}
                                                        title="Eliminar usuario"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Card>
                    </div>

                    {/* VISTA MÓVIL: Tarjetas compactas sin scroll horizontal (sm:hidden) */}
                    <div className="sm:hidden space-y-2.5">
                        {isLoading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <Card key={i} className="p-3 border border-border/70">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-5 w-20 rounded-full" />
                                        </div>
                                        <Skeleton className="h-3 w-40" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </Card>
                            ))
                        ) : paginatedUsers.length === 0 ? (
                            <Card className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/80">
                                No se encontraron usuarios.
                            </Card>
                        ) : paginatedUsers.map((user) => (
                            <div
                                key={user.id}
                                className="rounded-xl border border-border/70 bg-card p-3 shadow-xs space-y-2.5"
                            >
                                {/* Fila superior: Nombre, Rol y Acciones */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                                                {user.name}
                                            </span>
                                            <Badge variant="outline" className="text-[10px] font-sans font-medium py-0 px-2 rounded-full border-border/60">
                                                {user.role}
                                            </Badge>
                                        </div>
                                    </div>

                                    {/* Botones de acción limpios (bare icons) */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                            disabled={resendingUserId === user.id}
                                            onClick={() => handleResendInviteFromTable(user)}
                                            title={`Reenviar invitación a ${user.email}`}
                                        >
                                            {resendingUserId === user.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                            ) : (
                                                <Mail className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                            onClick={() => openEditModal(user)}
                                            title="Editar usuario"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                            onClick={() => setUserToDelete(user)}
                                            title="Eliminar usuario"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Fila inferior: Email y Local */}
                                <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                                    <span className="truncate flex items-center gap-1">
                                        <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                                        <span className="truncate">{user.email}</span>
                                    </span>
                                    <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-foreground/80">
                                        <Building className="h-3 w-3 text-slate-400 shrink-0" />
                                        <span>{user.local_id ? localMap.get(user.local_id) : 'Todas las sucursales'}</span>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Paginación */}
                    {!isLoading && totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 pb-2">
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                <span>Resultados por página</span>
                                <Select
                                    value={`${itemsPerPage}`}
                                    onValueChange={(value) => {
                                        setItemsPerPage(Number(value))
                                        setCurrentPage(1)
                                    }}
                                >
                                    <SelectTrigger className="h-7 w-[65px] text-xs rounded-lg border-border/80">
                                        <SelectValue placeholder={`${itemsPerPage}`} />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                        <SelectItem value="5">5</SelectItem>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="20">20</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <div className="flex items-center space-x-1.5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="h-7 px-2 text-xs rounded-lg border-border/80"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="h-7 px-2 text-xs rounded-lg border-border/80"
                                    >
                                        Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* TAB 2: ROLES Y PERMISOS */}
                <TabsContent value="roles" className="mt-0 space-y-4 focus-visible:outline-none data-[state=inactive]:hidden" forceMount>
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">Roles y Permisos de Usuarios</h3>
                        <p className="text-xs text-muted-foreground hidden sm:block">
                            Personaliza los accesos de visualización y edición permitidos para cada nivel del personal.
                        </p>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
                            <Skeleton className="h-72 w-full rounded-xl" />
                            <Skeleton className="h-72 w-full rounded-xl" />
                            <Skeleton className="h-72 w-full rounded-xl" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
                            {localRolesState.map((role) => {
                                const RoleIcon = roleIcons[role.title] || Info;
                                return (
                                    <Card key={role.id} className="border border-border/70 shadow-xs overflow-hidden flex flex-col justify-between">
                                        <div>
                                            <CardHeader className="py-2.5 px-3.5 sm:px-4 border-b border-border/50 bg-muted/10">
                                                <div className="flex items-center gap-2">
                                                    <RoleIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">{role.title}</CardTitle>
                                                </div>
                                                <CardDescription className="text-xs text-muted-foreground mt-0.5 line-clamp-2 hidden sm:block">
                                                    {role.description}
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="p-3 sm:p-4 space-y-2.5">
                                                <div className="space-y-2">
                                                    {allPermissionCategories.map(cat => (
                                                        <PermissionGroup
                                                            key={cat.title}
                                                            category={cat}
                                                            currentPermissions={role.permissions}
                                                            onPermissionChange={(key, checked) => handlePermissionChange(role.id, key, checked)}
                                                            isDisabled={false}
                                                        />
                                                    ))}

                                                    <Collapsible defaultOpen={false}>
                                                        <div className="flex items-center justify-between p-2.5 border border-border/60 rounded-t-lg bg-muted/20 hover:bg-muted/40 transition-colors mt-3">
                                                            <CollapsibleTrigger className="flex items-center gap-2 font-medium text-xs flex-grow text-left">
                                                                <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                                                                <span className="text-foreground">Historial</span>
                                                            </CollapsibleTrigger>
                                                        </div>
                                                        <CollapsibleContent className="p-3 border border-t-0 border-border/60 rounded-b-lg bg-card">
                                                            <div className="space-y-1.5">
                                                                <label className="text-xs font-medium text-foreground">
                                                                    Días visibles en el pasado
                                                                </label>
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    placeholder="Sin límite"
                                                                    className="h-8 text-xs font-sans"
                                                                    value={role.historyRestrictionDays ?? ''}
                                                                    onChange={(e) => handleHistoryRestrictionChange(role.id, e.target.value === '' ? undefined : parseInt(e.target.value))}
                                                                />
                                                                <p className="text-[11px] text-muted-foreground">
                                                                    Define cuántos días hacia atrás puede ver este rol. Dejar vacío para ilimitado.
                                                                </p>
                                                            </div>
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                </div>
                                            </CardContent>
                                        </div>
                                        <div className="p-3 sm:p-4 pt-0">
                                            <Button
                                                variant="alfa"
                                                className="w-full h-8 text-xs font-semibold gap-1.5"
                                                onClick={() => handleSaveRolePermissions(role.id)}
                                            >
                                                <Save className="h-3.5 w-3.5" />
                                                <span>Guardar Permisos</span>
                                            </Button>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {isModalOpen && (
                <UserModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onDataSaved={handleDataUpdated}
                    user={editingUser}
                    roles={localRolesState}
                />
            )}

            {userToDelete && (
                <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
                    <AlertDialogContent className="border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Se eliminará permanentemente al usuario "{userToDelete.name}". Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl border-border/60">Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteUser} className="rounded-xl bg-destructive hover:bg-destructive/90 text-white">
                                Sí, eliminar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
}
