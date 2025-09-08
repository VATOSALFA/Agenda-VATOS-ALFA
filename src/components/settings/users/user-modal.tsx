
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Check, X } from 'lucide-react';
import type { User, Local } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ImageUploader } from '@/components/shared/image-uploader';


const userSchema = (isEditMode: boolean) => z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  email: z.string().email('El email no es válido.'),
  password: z.string().optional().refine(password => {
    if (isEditMode) {
      return true;
    }
    return !!password && password.length >= 6;
  }, {
      message: 'La contraseña debe tener al menos 6 caracteres.',
  }),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
  celular: z.string().optional(),
  role: z.string().min(1, 'El rol es requerido.'),
  local_id: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  avatarUrl: z.string().optional(),
}).refine(data => {
    if (data.newPassword || data.confirmPassword) {
        return !!data.currentPassword;
    }
    return true;
}, {
    message: "Debes ingresar tu contraseña actual para establecer una nueva.",
    path: ["currentPassword"],
})
.refine(data => {
    if (data.newPassword || data.currentPassword) {
        return data.newPassword === data.confirmPassword;
    }
    return true;
}, {
    message: "Las contraseñas nuevas no coinciden.",
    path: ["confirmPassword"],
});

type UserFormData = z.infer<ReturnType<typeof userSchema>>;


interface RoleData {
    icon: React.ElementType;
    title: string;
    description: string;
    permissions: { access: boolean, label: string }[];
}
interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  user: User | null;
  roles: RoleData[];
}


export function UserModal({ isOpen, onClose, onDataSaved, user, roles }: UserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!user;
  const { toast } = useToast();

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema(isEditMode)),
    defaultValues: { name: '', email: '', celular: '', role: '', permissions: [], password: '', currentPassword: '', newPassword: '', confirmPassword: '', avatarUrl: '' },
  });

  const selectedRoleName = form.watch('role');

  const selectedRole = useMemo(() => {
    return roles.find(r => r.title === selectedRoleName);
  }, [selectedRoleName, roles]);

  useEffect(() => {
    if (isOpen) {
        if (user) {
          form.reset({ 
            name: user.name, 
            email: user.email, 
            role: user.role, 
            local_id: user.local_id,
            celular: user.celular || '', 
            password: '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
            permissions: user.permissions || roles.find(r => r.title === user.role)?.permissions.filter(p => p.access).map(p => p.label) || [],
            avatarUrl: user.avatarUrl || ''
          });
        } else {
          form.reset({ name: '', email: '', celular: '', role: '', permissions: [], password: '', currentPassword: '', newPassword: '', confirmPassword: '', avatarUrl: '' });
        }
    }
  }, [user, isOpen, form, roles]);
  
  useEffect(() => {
    if (selectedRole) {
      const defaultPermissions = selectedRole.permissions
        .filter(p => p.access)
        .map(p => p.label);
      form.setValue('permissions', defaultPermissions, { shouldDirty: true });
    }
  }, [selectedRole, form]);


  const onSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
        const dataToSave: any = { 
            name: data.name,
            email: data.email,
            celular: data.celular,
            role: data.role,
            permissions: data.permissions,
            local_id: data.role === 'Administrador general' ? null : data.local_id,
            avatarUrl: data.avatarUrl,
        };
        
        if (isEditMode && user) {
            const userRef = doc(db, 'usuarios', user.id);
            await updateDoc(userRef, dataToSave);
            // Password update logic should be handled with a call to a backend function for security
            // For now, we'll just show a toast.
            if (data.newPassword) {
                toast({ title: "Contraseña actualizada (simulado)" });
            }
            toast({ title: "Usuario actualizado" });
        } else {
            // Create user in Firebase Auth
            if (!data.password) {
                throw new Error("La contraseña es requerida para nuevos usuarios.");
            }
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
            const newFirebaseUser = userCredential.user;

            // Create user profile in Firestore with the same UID
            const userRef = doc(db, 'usuarios', newFirebaseUser.uid);
            await setDoc(userRef, dataToSave);
            toast({ title: "Usuario creado con éxito" });
        }
        
        onDataSaved();
        onClose();
    } catch (error: any) {
        console.error("Error saving user:", error);
        let description = "No se pudo guardar el usuario. Inténtalo de nuevo.";
        if (error.code === 'auth/email-already-in-use') {
            description = "Este correo electrónico ya está registrado. Por favor, utiliza otro.";
        } else if (error.code === 'auth/weak-password') {
            description = "La contraseña es demasiado débil. Debe tener al menos 6 caracteres.";
        }
        toast({ variant: 'destructive', title: "Error", description });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const availableRoles = isEditMode ? roles : roles.filter(r => r.title !== 'Administrador general');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            </DialogHeader>
            <div className="py-6 px-1 max-h-[70vh] overflow-y-auto">
              <div className="px-4 space-y-4">
                <FormField
                  name="avatarUrl"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="flex justify-center">
                      <FormControl>
                        <ImageUploader
                          folder="user_avatars"
                          currentImageUrl={field.value}
                          onUpload={(url) => field.onChange(url)}
                          onRemove={() => field.onChange('')}
                          className="w-24 h-24"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre completo</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} disabled={isEditMode} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!isEditMode ? (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl><Input type="password" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="space-y-4 pt-4 border-t">
                      <h4 className="text-sm font-medium">Cambiar Contraseña</h4>
                      <FormField
                          control={form.control}
                          name="currentPassword"
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Contraseña actual</FormLabel>
                                  <FormControl><Input type="password" {...field} /></FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                      <FormField
                          control={form.control}
                          name="newPassword"
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Nueva contraseña</FormLabel>
                                  <FormControl><Input type="password" {...field} /></FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                      <FormField
                          control={form.control}
                          name="confirmPassword"
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Confirmar nueva contraseña</FormLabel>
                                  <FormControl><Input type="password" {...field} /></FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="celular"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Celular</FormLabel>
                      <FormControl><Input type="tel" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar un rol" /></SelectTrigger></FormControl>
                          <SelectContent>
                              {roles.map(role => (
                                  <SelectItem key={role.title} value={role.title}>{role.title}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedRoleName !== 'Administrador general' && (
                  <FormField
                    control={form.control}
                    name="local_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Local asignado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={localesLoading ? 'Cargando locales...' : "Seleccionar un local"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {!localesLoading && locales.map(local => (
                                  <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                              ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {selectedRole && (
                    <div className="space-y-2 pt-4 border-t">
                        <h4 className="font-semibold">Permisos</h4>
                        <ScrollArea className="h-40 rounded-md border p-3">
                           <FormField
                              control={form.control}
                              name="permissions"
                              render={() => (
                                <FormItem className="space-y-3">
                                  {selectedRole.permissions.map((permission) => (
                                    <FormField
                                      key={permission.label}
                                      control={form.control}
                                      name="permissions"
                                      render={({ field }) => {
                                        return (
                                          <FormItem
                                            key={permission.label}
                                            className="flex flex-row items-center space-x-3 space-y-0"
                                          >
                                            <FormControl>
                                              <Checkbox
                                                checked={field.value?.includes(permission.label)}
                                                onCheckedChange={(checked) => {
                                                  return checked
                                                    ? field.onChange([...(field.value || []), permission.label])
                                                    : field.onChange(
                                                        (field.value || []).filter(
                                                          (value) => value !== permission.label
                                                        )
                                                      )
                                                }}
                                              />
                                            </FormControl>
                                            <FormLabel className="font-normal text-sm">
                                              {permission.label}
                                            </FormLabel>
                                          </FormItem>
                                        )
                                      }}
                                    />
                                  ))}
                                </FormItem>
                              )}
                            />
                        </ScrollArea>
                    </div>
                )}
              </div>
            </div>
            <DialogFooter className="border-t pt-6">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
