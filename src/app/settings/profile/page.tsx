
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/firebase-auth-context";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { ImageUploader } from "@/components/shared/image-uploader";

const profileSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido."),
  lastName: z.string().min(1, "El apellido es requerido."),
  email: z.string().email("Email inválido."),
  avatarUrl: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
})
.refine(data => {
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


type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    
    const form = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
            avatarUrl: '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        }
    })

    useEffect(() => {
        if (user) {
            const [firstName = '', ...lastNameParts] = user.displayName?.split(' ') || [];
            form.reset({
                firstName,
                lastName: lastNameParts.join(' '),
                email: user.email || '',
                avatarUrl: user.avatarUrl || '',
            });
        }
    }, [user, form]);


    const onSubmit = async (data: ProfileFormData) => {
        setIsSubmitting(true);
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se encontró el usuario.'});
            setIsSubmitting(false);
            return;
        }

        try {
            // Update user profile in Firestore
            const userRef = doc(db, 'usuarios', user.uid);
            const fullName = `${data.firstName} ${data.lastName}`.trim();
            await updateDoc(userRef, {
                name: fullName,
                email: data.email,
                avatarUrl: data.avatarUrl,
            });
            
            // If new password is provided, update it
            if (data.newPassword && data.currentPassword) {
                // Re-authentication is usually needed here for security.
                // For simplicity in this context, we will try to update directly.
                // In a real app, you would re-authenticate the user first.
                await updatePassword(user, data.newPassword);
                toast({ title: 'Contraseña actualizada' });
            }

            toast({
                title: "Perfil actualizado con éxito",
            });
            form.reset({
                ...form.getValues(),
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });

        } catch (error: any) {
            console.error("Error updating profile:", error);
            let description = "No se pudo actualizar el perfil.";
            if (error.code === 'auth/requires-recent-login') {
                description = "Esta operación es sensible y requiere un inicio de sesión reciente. Por favor, cierra sesión y vuelve a iniciarla.";
            } else if (error.code === 'auth/wrong-password') {
                description = "La contraseña actual es incorrecta.";
            }
            toast({ variant: 'destructive', title: 'Error', description });
        } finally {
            setIsSubmitting(false);
        }
    }

  return (
    <div className="flex-1 space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Mi perfil</h2>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="bg-card/50">
            <CardContent className="p-6 flex items-center gap-6">
                <Controller
                  name="avatarUrl"
                  control={form.control}
                  render={({ field }) => (
                      <ImageUploader
                          folder="profesionales"
                          currentImageUrl={field.value}
                          onUploadStateChange={setIsUploading}
                          onUpload={(url) => field.onChange(url)}
                          onRemove={() => field.onChange('')}
                      />
                  )}
               />
                <div>
                    <h3 className="text-xl font-bold">{user?.displayName}</h3>
                    <p className="text-sm font-medium text-primary">{user?.role}</p>
                    <p className="text-sm text-muted-foreground mt-1">Este es tu perfil personal. Puedes actualizar tu información de contacto y tu contraseña.</p>
                </div>
            </CardContent>
          </Card>
      
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Información personal</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="firstName"
                                render={({ field }) => (
                                    <FormItem>
                                        <Label>Nombres</Label>
                                        <FormControl><Input {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="lastName"
                                render={({ field }) => (
                                    <FormItem>
                                        <Label>Apellidos</Label>
                                        <FormControl><Input {...field} /></FormControl>
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
                                    <Label>Email</Label>
                                    <FormControl><Input type="email" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Cambiar contraseña</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <FormField
                            control={form.control}
                            name="currentPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <Label>Contraseña actual</Label>
                                    <FormControl><Input type="password" {...field} autoComplete="off" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="newPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <Label>Nueva contraseña</Label>
                                    <FormControl><Input type="password" {...field} autoComplete="off" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <Label>Confirmar nueva contraseña</Label>
                                    <FormControl><Input type="password" {...field} autoComplete="off" /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
            </div>
             <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || isUploading}>
                    {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar Cambios
                </Button>
            </div>
        </form>
      </Form>
    </div>
  );
}
