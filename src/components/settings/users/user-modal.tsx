

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
import { Loader2, Sparkles, Eye, EyeOff } from 'lucide-react';
import type { User, Local, Role, Profesional } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase-client';
import { collection, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { createUserWithEmailAndPassword, updateProfile, getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { ImageUploader } from '@/components/shared/image-uploader';
import { spellCheck, type SpellCheckOutput } from '@/ai/flows/spell-check-flow';
import { useDebounce } from 'use-debounce';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { firebaseConfig } from '@/lib/firebase-client';


const userSchema = (isEditMode: boolean, isGeneralAdmin: boolean) => z.object({
  nombre: z.string().min(1, 'El nombre es requerido.'),
  apellido: z.string().min(1, 'El apellido es requerido.'),
  email: z.string().email('El email no es válido.'),
  password: z.string().optional(),
  celular: z.string().optional(),
  // Make role optional only if it's the general admin being edited
  role: isEditMode && isGeneralAdmin ? z.string().optional() : z.string().min(1, 'El rol es requerido.'),
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
  const [showPassword, setShowPassword] = useState(false);

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');

  const isEditingGeneralAdmin = isEditMode && user?.role === 'Administrador general';

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema(isEditMode, isEditingGeneralAdmin)),
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
      const roleToSave = isEditingGeneralAdmin ? 'Administrador general' : data.role;
      const selectedRoleData = roles.find(r => r.title === roleToSave);
      const permissionsForRole = selectedRoleData ? selectedRoleData.permissions : [];
      const fullName = `${data.nombre} ${data.apellido}`.trim();

      const dataToSave: any = {
        name: fullName,
        email: data.email,
        celular: data.celular,
        role: roleToSave,
        permissions: permissionsForRole,
        avatarUrl: data.avatarUrl,
      };

      dataToSave.local_id = data.local_id || null;

      if (isEditMode && user) {
        const userRef = doc(db, 'usuarios', user.id);
        await updateDoc(userRef, dataToSave);

        // Sync with professional profile if it exists
        const professional = professionals.find(p => p.userId === user.id);
        if (professional) {
          const profRef = doc(db, 'profesionales', professional.id);
          await updateDoc(profRef, { name: fullName, avatarUrl: data.avatarUrl, email: data.email });
        }

        if (auth.currentUser && auth.currentUser.uid === user.id) {
          await updateProfile(auth.currentUser, { displayName: fullName, photoURL: data.avatarUrl });
        }

        toast({ title: "Cambios realizados con éxito" });
      } else {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Admin not signed in");

        // Generate a random temporary password
        const tempPassword = crypto.randomUUID ? crypto.randomUUID().slice(0, 12) + "Aa1!" : Math.random().toString(36).slice(-10) + "Aa1!";

        // USE SECONDARY APP TO AVOID LOGGING OUT ADMIN
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        const secondaryAuth = getAuth(secondaryApp);

        try {
          // 1. Create user with temp password
          const tempUserCredential = await createUserWithEmailAndPassword(secondaryAuth, data.email, tempPassword);
          const newFirebaseUser = tempUserCredential.user;

          // 2. Update profile
          await updateProfile(newFirebaseUser, { displayName: fullName, photoURL: data.avatarUrl || null });

          // 3. Write to Firestore using MAIN db
          const userRef = doc(db, 'usuarios', newFirebaseUser.uid);
          await setDoc(userRef, dataToSave);

          // 4. Send Password Reset Email (Invitation) using MAIN auth to ensure domain/settings correctness
          // Actually, standard practice is sending to the email.
          // Note: sendPasswordResetEmail usually works on the instance that owns the user, but for invitation
          // we are just triggering an email to that address.
          await sendPasswordResetEmail(secondaryAuth, data.email);

          toast({
            title: "Usuario invitado con éxito",
            description: `Se ha enviado un correo a ${data.email} para que establezca su contraseña.`
          });

          // Clean up secondary session
          await secondaryAuth.signOut();
        } finally {
          // Remove secondary app instance
          await deleteApp(secondaryApp);
        }
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
                        <FormLabel>Nombres <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        {isCheckingNombre && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</div>}
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
                        <FormLabel>Apellidos <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        {isCheckingApellido && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando...</div>}
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
                      <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isEditMode && (
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-800 mb-1">
                      <Sparkles className="h-4 w-4" /> Invitación por correo
                    </h4>
                    <p className="text-sm text-blue-700">
                      No necesitas establecer una contraseña. El usuario recibirá un correo electrónico en <strong>{form.watch('email') || 'su dirección'}</strong> con un enlace seguro para crear su propia contraseña.
                    </p>
                  </div>
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
                  {isEditMode && (
                    <AccordionItem value="password-fields">
                      <AccordionTrigger className="text-sm font-semibold">Cambiar Contraseña</AccordionTrigger>
                      <AccordionContent className="pt-4 space-y-4">
                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nueva Contraseña</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input type={showPassword ? "text" : "password"} {...field} placeholder="Dejar en blanco para mantener la actual" />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                  >
                                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                                  </Button>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>

                {!isEditingGeneralAdmin && (
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rol <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar un rol" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {roles?.filter(r => r.title !== 'Administrador general').map(role => (
                              <SelectItem key={role.id} value={role.title}>{role.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

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

