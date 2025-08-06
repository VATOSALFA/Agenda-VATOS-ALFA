
'use client';

import { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  user: User | null;
  roles: string[];
}

const userSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  email: z.string().email('El email no es válido.'),
  celular: z.string().optional(),
  role: z.string().min(1, 'El rol es requerido.'),
});

type UserFormData = z.infer<typeof userSchema>;

export function UserModal({ isOpen, onClose, onDataSaved, user, roles }: UserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!user;
  const { toast } = useToast();

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: '', email: '', celular: '', role: '' },
  });

  useEffect(() => {
    if (user) {
      form.reset({ name: user.name, email: user.email, role: user.role, celular: user.celular || '' });
    } else {
      form.reset({ name: '', email: '', celular: '', role: '' });
    }
  }, [user, form, isOpen]);

  const onSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
        const dataToSave: any = { ...data };
        
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
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            </DialogHeader>
            <div className="py-6 space-y-4">
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
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar un rol" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {roles.map(role => (
                                <SelectItem key={role} value={role}>{role}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
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
