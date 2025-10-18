
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
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ImageUploader } from '@/components/shared/image-uploader';
import { spellCheck, type SpellCheckOutput } from '@/ai/flows/spell-check-flow';
import { useDebounce } from 'use-debounce';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


const userSchema = (isEditMode: boolean) => z.object({
  nombre: z.string().min(1, 'El nombre es requerido.'),
  apellido: z.string().min(1, 'El apellido es requerido.'),
  email: z.string().email('El email no es válido.'),
  password: z.string().optional(),
  celular: z.string().optional(),
  role: z.string().min(1, 'El rol es requerido.'),
  local_id: z.string().optional(),
  avatarUrl: z.string().optional(),
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
    defaultValues: { nombre: '', apellido: '', email: '', celular: '', role: '', password: '', avatarUrl: '' },
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
            avatarUrl: user.avatarUrl || ''
          });
        } else {
          form.reset({ nombre: '', apellido: '', email: '', celular: '', role: '', password: '', avatarUrl: '' });
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
            local_id: data.role === 'Administrador general' ? (data.local_id || null) : data.local_id,
            avatarUrl: data.avatarUrl,
        };
        
        if (isEditMode && user) {
            const userRef = doc(db, 'usuarios', user.id);
            await updateDoc(userRef, dataToSave);
            
            // This logic is complex for an admin. The primary use case here is for an admin to update user details,
            // not to manage their passwords. A password reset flow would be a better pattern.
            // For now, only profile updates are supported here.

            if(auth.currentUser && auth.currentUser.uid === user.id) {
                await updateProfile(auth.currentUser, { displayName: fullName, photoURL: data.avatarUrl });
            }

            toast({ title: "Cambios realizados con éxito" });
        } else {
            if (!data.password) {
                throw new Error("La contraseña es requerida para nuevos usuarios.");
            }
             if (data.password.length < 6) {
                throw new Error("La contraseña debe tener al menos 6 caracteres.");
            }
            // Temporarily create user in Auth to get a UID, then sign out the admin and sign back in.
            // This is a workaround for Firebase Auth client-side limitations.
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error("Admin not signed in");
            
            const tempUserCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
            const newFirebaseUser = tempUserCredential.user;
            
            await updateProfile(newFirebaseUser, { displayName: fullName, photoURL: data.avatarUrl || null });

            const userRef = doc(db, 'usuarios', newFirebaseUser.uid);
            await setDoc(userRef, dataToSave);
            
            // Log out the newly created user and log back in the admin
            await auth.signOut();
            // This is a simplified re-login. A robust solution would use a refresh token or a custom token system.
            if(currentUser.email){
              // This is a security risk in production. For this demo, we assume the admin's password is not available.
              // We are just restoring the state. A full re-auth is needed.
              console.warn("Admin user state was lost during new user creation. A full re-login is recommended.");
            }

            toast({ title: "Usuario creado con éxito" });
        }
        
        onDataSaved();
        onClose();
    } catch (error: any) {
        console.error("Error saving user:", error);
        let description = "No se pudo guardar el usuario. Inténtalo de nuevo.";
        if (error.code === 'auth/email-already-in-use') {
            description = "Este correo electrónico ya está registrado. Por favor, utiliza otro.";
        } else if (error.code === 'auth/weak-password' || error.message.includes('at least 6 characters')) {
            description = "La contraseña es demasiado débil. Debe tener al menos 6 caracteres.";
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
                {!isEditMode && (
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
                )}
                 <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="optional-fields">
                        <AccordionTrigger className="text-sm font-semibold">Datos Opcionales</AccordionTrigger>
                        <AccordionContent className="pt-4 space-y-4">
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
                        </AccordionContent>
                    </AccordionItem>
                 </Accordion>
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
