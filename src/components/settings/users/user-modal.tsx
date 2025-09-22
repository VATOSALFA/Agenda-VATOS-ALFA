
'use client';

<<<<<<< HEAD
import { useState, useEffect, useMemo, useCallback } from 'react';
=======
import { useState, useEffect, useMemo } from 'react';
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
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
<<<<<<< HEAD
import { Loader2, Sparkles } from 'lucide-react';
import type { User, Local, Role } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
=======
import { Loader2, Check, X } from 'lucide-react';
import type { User, Local } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestoreQuery } from '@/hooks/use-firestore';
<<<<<<< HEAD
import { createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ImageUploader } from '@/components/shared/image-uploader';
import { spellCheck, type SpellCheckOutput } from '@/ai/flows/spell-check-flow';
import { useDebounce } from 'use-debounce';


const userSchema = (isEditMode: boolean) => z.object({
  nombre: z.string().min(1, 'El nombre es requerido.'),
  apellido: z.string().min(1, 'El apellido es requerido.'),
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

const SpellingSuggestion = ({ suggestion, onAccept }: { suggestion: SpellCheckOutput, onAccept: (text: string) => void }) => {
    if (!suggestion.hasCorrection) return null;
    return (
        <button type="button" onClick={() => onAccept(suggestion.correctedText)} className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 transition-colors p-1 rounded-md bg-blue-50 hover:bg-blue-100">
            <Sparkles className="h-3 w-3" />
            ¿Quisiste decir: <span className="font-semibold">{suggestion.correctedText}</span>?
        </button>
    )
}

=======

interface RoleData {
    icon: React.ElementType;
    title: string;
    description: string;
    permissions: { access: boolean, label: string }[];
}
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  user: User | null;
<<<<<<< HEAD
  roles: Role[];
}


export function UserModal({ isOpen, onClose, onDataSaved, user, roles }: UserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const isEditMode = !!user;
  const { toast } = useToast();
  
  const [nombreSuggestion, setNombreSuggestion] = useState<SpellCheckOutput | null>(null);
  const [apellidoSuggestion, setApellidoSuggestion] = useState<SpellCheckOutput | null>(null);
  const [isCheckingNombre, setIsCheckingNombre] = useState(false);
  const [isCheckingApellido, setIsCheckingApellido] = useState(false);
=======
  roles: RoleData[];
}

const userSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  email: z.string().email('El email no es válido.'),
  celular: z.string().optional(),
  password: z.string().optional(),
  role: z.string().min(1, 'El rol es requerido.'),
  local_id: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

type UserFormData = z.infer<typeof userSchema>;

export function UserModal({ isOpen, onClose, onDataSaved, user, roles }: UserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!user;
  const { toast } = useToast();
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  const form = useForm<UserFormData>({
<<<<<<< HEAD
    resolver: zodResolver(userSchema(isEditMode)),
    defaultValues: { nombre: '', apellido: '', email: '', celular: '', role: '', password: '', currentPassword: '', newPassword: '', confirmPassword: '', avatarUrl: '' },
  });

  const selectedRoleName = form.watch('role');
  const nombreValue = form.watch('nombre');
  const apellidoValue = form.watch('apellido');
  
  const [debouncedNombre] = useDebounce(nombreValue, 750);
  const [debouncedApellido] = useDebounce(apellidoValue, 750);
  
  const checkSpelling = useCallback(async (text: string, type: 'nombre' | 'apellido') => {
    if (!text || text.trim().length <= 2) return;
    
    if (type === 'nombre') {
      setIsCheckingNombre(true);
      setNombreSuggestion(null);
    } else {
      setIsCheckingApellido(true);
      setApellidoSuggestion(null);
    }
    
    try {
        const result = await spellCheck(text);
        if (result.hasCorrection) {
            if (type === 'nombre') setNombreSuggestion(result);
            else setApellidoSuggestion(result);
        }
    } catch (error) {
        console.error("Spell check failed:", error);
    } finally {
        if (type === 'nombre') setIsCheckingNombre(false);
        else setIsCheckingApellido(false);
    }
  }, []);
  
  useEffect(() => {
    if (debouncedNombre) {
      checkSpelling(debouncedNombre, 'nombre');
    }
  }, [debouncedNombre, checkSpelling]);
  
  useEffect(() => {
    if (debouncedApellido) {
      checkSpelling(debouncedApellido, 'apellido');
    }
  }, [debouncedApellido, checkSpelling]);
=======
    resolver: zodResolver(userSchema),
    defaultValues: { name: '', email: '', celular: '', password: '', role: '', permissions: [] },
  });

  const selectedRoleName = form.watch('role');

  const selectedRole = useMemo(() => {
    return roles.find(r => r.title === selectedRoleName);
  }, [selectedRoleName, roles]);
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65

  useEffect(() => {
    if (isOpen) {
        if (user) {
<<<<<<< HEAD
          const [nombre = '', ...apellidoParts] = user.name.split(' ');
          const apellido = apellidoParts.join(' ');
          form.reset({ 
            nombre: nombre, 
            apellido: apellido,
=======
          form.reset({ 
            name: user.name, 
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
            email: user.email, 
            role: user.role, 
            local_id: user.local_id,
            celular: user.celular || '', 
<<<<<<< HEAD
            password: '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
            avatarUrl: user.avatarUrl || ''
          });
        } else {
          form.reset({ nombre: '', apellido: '', email: '', celular: '', role: '', password: '', currentPassword: '', newPassword: '', confirmPassword: '', avatarUrl: '' });
        }
    }
  }, [user, isOpen, form]);
=======
            password: user.password || '',
            permissions: user.permissions || roles.find(r => r.title === user.role)?.permissions.filter(p => p.access).map(p => p.label) || []
          });
        } else {
          form.reset({ name: '', email: '', celular: '', password: '', role: '', permissions: [] });
        }
    }
  }, [user, isOpen, form, roles]);
  
  useEffect(() => {
    // This effect runs when the selected role changes.
    // We only want to auto-set permissions if it's NOT in edit mode,
    // or if the role changes in edit mode.
    if (selectedRole) {
      const defaultPermissions = selectedRole.permissions
        .filter(p => p.access)
        .map(p => p.label);
      form.setValue('permissions', defaultPermissions, { shouldDirty: true });
    }
  }, [selectedRole, form]);
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65


  const onSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
<<<<<<< HEAD
        const selectedRoleData = roles.find(r => r.title === data.role);
        const permissionsForRole = selectedRoleData ? selectedRoleData.permissions : [];
        
        const dataToSave: any = { 
            name: `${data.nombre} ${data.apellido}`.trim(),
            email: data.email,
            celular: data.celular,
            role: data.role,
            permissions: permissionsForRole,
            local_id: data.role === 'Administrador general' ? null : data.local_id,
            avatarUrl: data.avatarUrl,
        };
=======
        const dataToSave: any = { ...data };
        if (!data.password || data.password === '') {
            delete dataToSave.password;
        }

        if(data.role === 'Administrador general') {
          dataToSave.local_id = null;
        }
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
        
        if (isEditMode && user) {
            const userRef = doc(db, 'usuarios', user.id);
            await updateDoc(userRef, dataToSave);
<<<<<<< HEAD
            
            if (data.newPassword && data.currentPassword) {
                const currentUser = auth.currentUser;
                if(currentUser && currentUser.email) {
                    const credential = EmailAuthProvider.credential(currentUser.email, data.currentPassword);
                    await reauthenticateWithCredential(currentUser, credential);
                    await updatePassword(currentUser, data.newPassword);
                    toast({ title: "Contraseña actualizada" });
                } else {
                   throw new Error("No hay un usuario activo para reautenticar.");
                }
            } else if (data.newPassword && !data.currentPassword) {
                 toast({ variant: 'destructive', title: "Error", description: "Debes ingresar tu contraseña actual para cambiarla." });
                 setIsSubmitting(false);
                 return;
            }

            toast({ title: "Usuario actualizado" });
        } else {
            if (!data.password) {
                throw new Error("La contraseña es requerida para nuevos usuarios.");
            }
            const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
            const newFirebaseUser = userCredential.user;

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
        } else if (error.code === 'auth/wrong-password') {
            description = "La contraseña actual es incorrecta.";
        }
        toast({ variant: 'destructive', title: "Error", description });
=======
            toast({ title: "Usuario actualizado" });
        } else {
            await addDoc(collection(db, 'usuarios'), dataToSave);
            toast({ title: "Usuario creado" });
        }
        onDataSaved();
        onClose();
    } catch (error) {
        toast({ variant: 'destructive', title: "Error", description: "No se pudo guardar el usuario." });
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
    } finally {
        setIsSubmitting(false);
    }
  };
  
<<<<<<< HEAD
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
=======
  const availableRoles = isEditMode ? roles : roles.filter(r => r.title !== 'Administrador general');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            </DialogHeader>
            <div className="py-6 px-1 max-h-[70vh] overflow-y-auto">
              <div className="px-4 space-y-4">
                <FormField
<<<<<<< HEAD
                  name="avatarUrl"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="flex justify-center">
                      <FormControl>
                          <ImageUploader 
                            folder="profesionales"
                            currentImageUrl={field.value}
                            onUploadStateChange={setIsUploading}
                            onUploadEnd={(url) => {
                                form.setValue('avatarUrl', url, { shouldDirty: true });
                            }}
                            onRemove={() => form.setValue('avatarUrl', '', { shouldDirty: true })}
                          />
                      </FormControl>
=======
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre completo</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
                      <FormMessage />
                    </FormItem>
                  )}
                />
<<<<<<< HEAD
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombres</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        {isCheckingNombre && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Verificando...</div>}
                        {nombreSuggestion && <SpellingSuggestion suggestion={nombreSuggestion} onAccept={(text) => form.setValue('nombre', text)} />}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="apellido"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellidos</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        {isCheckingApellido && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/> Verificando...</div>}
                        {apellidoSuggestion && <SpellingSuggestion suggestion={apellidoSuggestion} onAccept={(text) => form.setValue('apellido', text)} />}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
<<<<<<< HEAD
                      <FormControl><Input type="email" {...field} disabled={isEditMode} /></FormControl>
=======
                      <FormControl><Input type="email" {...field} /></FormControl>
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
                      <FormMessage />
                    </FormItem>
                  )}
                />
<<<<<<< HEAD
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
                                  <FormControl><Input type="password" {...field} autoComplete="current-password" /></FormControl>
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
                                  <FormControl><Input type="password" {...field} autoComplete="new-password"/></FormControl>
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
                                  <FormControl><Input type="password" {...field} autoComplete="new-password"/></FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                  </div>
                )}
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
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
<<<<<<< HEAD
=======
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl><Input type="text" {...field} placeholder={isEditMode ? 'Dejar en blanco para no cambiar' : ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar un rol" /></SelectTrigger></FormControl>
                          <SelectContent>
<<<<<<< HEAD
                              {roles?.map(role => (
                                  <SelectItem key={role.id} value={role.title}>{role.title}</SelectItem>
=======
                              {availableRoles.map(role => (
                                  <SelectItem key={role.title} value={role.title}>{role.title}</SelectItem>
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
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
<<<<<<< HEAD
=======
                
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
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
              </div>
            </div>
            <DialogFooter className="border-t pt-6">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
<<<<<<< HEAD
              <Button type="submit" disabled={isSubmitting || isUploading}>
                {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
=======
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
