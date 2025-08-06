
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
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

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

const userSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  email: z.string().email('El email no es válido.'),
  celular: z.string().optional(),
  password: z.string().optional(),
  role: z.string().min(1, 'El rol es requerido.'),
  permissions: z.array(z.string()).optional(),
});

type UserFormData = z.infer<typeof userSchema>;

export function UserModal({ isOpen, onClose, onDataSaved, user, roles }: UserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!user;
  const { toast } = useToast();

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: '', email: '', celular: '', password: '', role: '', permissions: [] },
  });

  const selectedRoleName = form.watch('role');

  const selectedRole = useMemo(() => {
    return roles.find(r => r.title === selectedRoleName);
  }, [selectedRoleName, roles]);

  useEffect(() => {
    if (user) {
      form.reset({ 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        celular: user.celular || '', 
        password: user.password || '',
        permissions: user.permissions || selectedRole?.permissions.filter(p => p.access).map(p => p.label) || []
      });
    } else {
      form.reset({ name: '', email: '', celular: '', password: '', role: '', permissions: [] });
    }
  }, [user, form, isOpen, selectedRole]);
  
  useEffect(() => {
    if (selectedRole) {
      const defaultPermissions = selectedRole.permissions.filter(p => p.access).map(p => p.label);
      form.setValue('permissions', defaultPermissions);
    }
  }, [selectedRole, form]);


  const onSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
        const dataToSave: any = { ...data };
        if (!data.password) {
            delete dataToSave.password;
        }
        
        if (isEditMode && user) {
            const userRef = doc(db, 'usuarios', user.id);
            await updateDoc(userRef, dataToSave);
            toast({ title: "Usuario actualizado" });
        } else {
            await addDoc(collection(db, 'usuarios'), dataToSave);
            toast({ title: "Usuario creado" });
        }
        onDataSaved();
        onClose();
    } catch (error) {
        toast({ variant: 'destructive', title: "Error", description: "No se pudo guardar el usuario." });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] p-1">
              <div className="py-6 px-5 space-y-4">
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
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl><Input type="password" {...field} placeholder={isEditMode ? 'Dejar en blanco para no cambiar' : ''} /></FormControl>
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
                
                {selectedRole && (
                    <div className="space-y-2 pt-4 border-t">
                        <h4 className="font-semibold">Permisos</h4>
                        <FormField
                            control={form.control}
                            name="permissions"
                            render={() => (
                                <FormItem className="space-y-2">
                                {selectedRole.permissions.map(permission => (
                                    <FormField
                                        key={permission.label}
                                        control={form.control}
                                        name="permissions"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value?.includes(permission.label)}
                                                        onCheckedChange={(checked) => {
                                                            const currentValue = field.value || [];
                                                            return checked
                                                                ? field.onChange([...currentValue, permission.label])
                                                                : field.onChange(currentValue.filter(value => value !== permission.label))
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal text-sm">{permission.label}</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                                </FormItem>
                            )}
                        />
                    </div>
                )}
              </div>
            </ScrollArea>
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
