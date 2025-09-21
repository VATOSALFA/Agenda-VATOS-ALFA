
'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Info, Pencil, Trash2, ChevronLeft, ChevronRight, UserPlus, Loader2, Check, X } from "lucide-react";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { User, Local } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { UserModal } from '@/components/settings/users/user-modal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { allPermissionCategories, rolesData, type PermissionCategory, type RoleUIData } from '@/lib/permissions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';


const PermissionGroup = ({ category, currentPermissions }: { category: PermissionCategory, currentPermissions: string[] }) => {
    
    const allSubPermissions = category.subCategories?.flatMap(sc => sc.permissions.map(p => p.key)) || [];
    const allCategoryPermissions = [...(category.permissions?.map(p => p.key) || []), ...allSubPermissions];

    const isAllSelected = allCategoryPermissions.every(pKey => currentPermissions.includes(pKey));

    return (
        <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 border rounded-t-lg bg-muted/50 hover:bg-muted">
                    <div className="flex items-center gap-2 font-semibold">
                        <category.icon className="h-5 w-5 text-primary" />
                        {category.title}
                    </div>
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="p-4 border border-t-0 rounded-b-lg">
                <div className="space-y-3">
                    {category.permissions?.map(p => (
                        <div key={p.key} className="flex items-center gap-2">
                             <Checkbox id={p.key} checked={currentPermissions.includes(p.key)} disabled />
                             <label htmlFor={p.key} className="text-sm text-muted-foreground">{p.label}</label>
                        </div>
                    ))}
                    {category.subCategories?.map(sub => (
                        <div key={sub.title} className="ml-4 space-y-2 pt-2">
                            <p className="font-semibold text-sm">{sub.title}</p>
                            <div className="pl-2 space-y-2">
                                {sub.permissions.map(p => (
                                    <div key={p.key} className="flex items-center gap-2">
                                        <Checkbox id={p.key} checked={currentPermissions.includes(p.key)} disabled />
                                        <label htmlFor={p.key} className="text-sm text-muted-foreground">{p.label}</label>
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
  const { toast } = useToast();
  
  const { data: users, loading } = useFirestoreQuery<User>('usuarios', queryKey);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);

  const localMap = useMemo(() => new Map(locales.map(l => [l.id, l.name])), [locales]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
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

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setIsModalOpen(true);
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
        await deleteDoc(doc(db, 'usuarios', userToDelete.id));
        toast({ title: 'Usuario eliminado' });
        handleDataUpdated();
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error al eliminar' });
    } finally {
        setUserToDelete(null);
    }
  }


  return (
    <>
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>En esta pantalla podrás crear y gestionar usuarios.</AlertTitle>
        <AlertDescription>
          Recuerda que un usuario no es lo mismo que un profesional, los usuarios son ilimitados y sirven para asignar diferentes permisos a cada persona que trabaje en tu compañía.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between space-y-2 pt-4">
        <h2 className="text-3xl font-bold tracking-tight">Usuarios registrados</h2>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar usuario" className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <Button onClick={openNewModal}>
            <UserPlus className="mr-2 h-4 w-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol asignado</TableHead>
                <TableHead>Local asignado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({length: 5}).map((_, i) => (
                    <TableRow key={i}>
                        <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                ))
              ) : paginatedUsers.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                        No se encontraron usuarios.
                    </TableCell>
                 </TableRow>
              ) : paginatedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.local_id ? localMap.get(user.local_id) : 'Todos'}</TableCell>
                  <TableCell className="text-right">
                    {user.role === 'Administrador general' ? (
                        <span className="text-xs text-muted-foreground">No se puede editar</span>
                    ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(user)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setUserToDelete(user)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end space-x-6 pt-2 pb-4">
        <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Resultados por página</p>
            <Select
                value={`${itemsPerPage}`}
                onValueChange={(value) => {
                    setItemsPerPage(Number(value))
                    setCurrentPage(1)
                }}
            >
                <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={itemsPerPage} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <div className="text-sm font-medium">
          Página {currentPage} de {totalPages}
        </div>
        <div className="flex items-center space-x-2">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
            >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
            >
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
        </div>
      </div>
      
      <div className="pt-8 border-t">
        <h2 className="text-3xl font-bold tracking-tight mb-6">Roles de usuarios</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {rolesData.map((role) => (
                <Card key={role.title}>
                    <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                        <role.icon className="h-8 w-8 text-primary" />
                        <CardTitle>{role.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 h-12">{role.description}</p>
                        <div className="space-y-2">
                            {allPermissionCategories.map(cat => (
                                <PermissionGroup key={cat.title} category={cat} currentPermissions={role.permissions} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
      </div>

    </div>
    
    <UserModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDataSaved={handleDataUpdated}
        user={editingUser}
        roles={rolesData.map(r => ({ title: r.title, icon: r.icon, description: r.description, permissions: [] }))}
    />

    {userToDelete && (
        <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Se eliminará permanentemente al usuario "{userToDelete.name}". Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">
                        Sí, eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </>
  );
}
