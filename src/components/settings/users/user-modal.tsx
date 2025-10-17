
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
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
import { Loader2, Sparkles } from 'lucide-react';
import type { User, Local, Role } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase-client';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateEmail, updateProfile } from 'firebase/auth';
import { ImageUploader } from '@/components/shared/image-uploader';
import { spellCheck, type SpellCheckOutput } from '@/ai/flows/spell-check-flow';
import { useDebounce } from 'use-debounce';


const userSchema = (isEditMode: boolean) => z.object({
  nombre: z.string().min(1, 'El nombre es requerido.'),
  apellido: z.string().min(1, 'El apellido es requerido.'),
  email: z.string().email('El email no es válido.'),
  password: z.string().optional().refine(password => {
    if (isEditMode) {
      return true; // Password is not required when editing
    }
    // Password is required for new users and must be at least 6 characters
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
interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  user: User | null;
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

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  const form = useForm<UserFormData>({
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

  useEffect(() => {
    if (isOpen) {
        if (user) {
          const [nombre = '', ...apellidoParts] = user.name.split(' ');
          const apellido = apellidoParts.join(' ');
          form.reset({ 
            nombre: nombre, 
            apellido: apellido,
            email: user.email, 
            role: user.role, 
            local_id: user.local_id,
            celular: user.celular || '', 
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


  const onSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
        const selectedRoleData = roles.find(r => r.title === data.role);
        const permissionsForRole = selectedRoleData ? selectedRoleData.permissions : [];
        const fullName = `${data.nombre} ${data.apellido}`.trim();

        const dataToSave: any = { 
            name: fullName,
            email: data.email,
            celular: data.celular,
            role: data.role,
            permissions: permissionsForRole,
            local_id: data.role === 'Administrador general' ? null : data.local_id,
            avatarUrl: data.avatarUrl,
        };
        
        if (isEditMode && user) {
            const userRef = doc(db, 'usuarios', user.id);
            await updateDoc(userRef, dataToSave);
            
            // This password change logic is flawed for admin changing other users' passwords
            // As it requires re-authentication of the currently logged in user (the admin).
            // A backend function would be required for a secure implementation.
            // For now, it will only work if an admin changes their own password.
            if (data.newPassword && data.currentPassword) {
                const currentUser = auth.currentUser;
                if(currentUser && currentUser.email?.toLowerCase() === user.email.toLowerCase()) {
                    const credential = EmailAuthProvider.credential(currentUser.email, data.currentPassword);
                    await reauthenticateWithCredential(currentUser, credential);
                    await updatePassword(currentUser, data.newPassword);
                    toast({ title: "Contraseña actualizada" });
                } else if (currentUser?.email?.toLowerCase() !== user.email.toLowerCase()) {
                    toast({ variant: 'destructive', title: "Error de permisos", description: "No puedes cambiar la contraseña de otro usuario desde aquí." });
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
            // Temporarily create user in Auth to get a UID
            const tempUserCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
            const newFirebaseUser = tempUserCredential.user;
            
            await updateProfile(newFirebaseUser, { displayName: fullName });

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
        } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            description = "La contraseña actual es incorrecta.";
        }
        toast({ variant: 'destructive', title: "Error", description });
    } finally {
        setIsSubmitting(false);
    }
  };
  
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
                            folder="profesionales"
                            currentImageUrl={field.value}
                            onUploadStateChange={setIsUploading}
                            onUpload={(url) => {
                                form.setValue('avatarUrl', url, { shouldDirty: true });
                            }}
                            onRemove={() => form.setValue('avatarUrl', '', { shouldDirty: true })}
                          />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                        <FormLabel>Contraseña (temporal)</FormLabel>
                        <FormControl><Input type="password" {...field} placeholder="Debe tener al menos 6 caracteres" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="space-y-4 pt-4 border-t">
                      <h4 className="text-sm font-medium">Cambiar Contraseña (Opcional)</h4>
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
                              {roles?.map(role => (
                                  <SelectItem key={role.id} value={role.title}>{role.title}</SelectItem>
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
              </div>
            </div>
            <DialogFooter className="border-t pt-6">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting || isUploading}>
                {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
