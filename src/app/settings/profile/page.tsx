'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";

// Mock user data
const user = {
  name: "Alejandro",
  lastName: "Pacheco",
  email: "admin@vatosalfa.com",
  role: "Administrador General",
  avatarUrl: "https://placehold.co/100x100",
  dataAiHint: "man portrait"
};

const profileSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido."),
  lastName: z.string().min(1, "El apellido es requerido."),
  email: z.string().email("Email inválido."),
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
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            firstName: user.name,
            lastName: user.lastName,
            email: user.email,
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        }
    })

    const onSubmit = (data: ProfileFormData) => {
        setIsSubmitting(true);
        console.log("Updating profile:", data);
        // Simulate API call
        setTimeout(() => {
            toast({
                title: "Perfil actualizado con éxito",
            });
            setIsSubmitting(false);
            form.reset({
                ...form.getValues(),
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });
        }, 1500);
    }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Mi perfil</h2>
      
      <Card className="bg-card/50">
        <CardContent className="p-6 flex items-center gap-6">
            <Avatar className="h-20 w-20">
                <AvatarImage src={user.avatarUrl} data-ai-hint={user.dataAiHint} />
                <AvatarFallback>{user.name.charAt(0)}{user.lastName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
                <h3 className="text-xl font-bold">{user.name} {user.lastName}</h3>
                <p className="text-sm font-medium text-primary">{user.role}</p>
                <p className="text-sm text-muted-foreground mt-1">Este es tu perfil personal. Puedes actualizar tu información de contacto y tu contraseña.</p>
            </div>
        </CardContent>
      </Card>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                                    <Label>Nueva contraseña</Label>
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
                                    <Label>Confirmar nueva contraseña</Label>
                                    <FormControl><Input type="password" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
            </div>
             <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar Cambios
                </Button>
            </div>
        </form>
      </Form>
    </div>
  );
}