

'use client';

import { useState, useEffect } from 'react';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import type { Sender } from '@/app/settings/emails/page';

interface AddSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (email: string) => void;
  sender: Sender | null;
}

const senderSchema = z.object({
  email: z.string().email("Debe ser un correo electrónico válido."),
});

type SenderFormData = z.infer<typeof senderSchema>;

export function AddSenderModal({ isOpen, onClose, onSave, sender }: AddSenderModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!sender;
  
  const form = useForm<SenderFormData>({
    resolver: zodResolver(senderSchema),
    defaultValues: {
        email: '',
    },
  });
  
  useEffect(() => {
    if (sender) {
        form.setValue('email', sender.email);
    } else {
        form.reset({ email: '' });
    }
  }, [sender, form, isOpen]);

  const onSubmit = (data: SenderFormData) => {
    setIsSubmitting(true);
    // Simular llamada a API
    setTimeout(() => {
      onSave(data.email);
      setIsSubmitting(false);
      form.reset();
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>{isEditMode ? 'Editar correo' : 'Agregar correo'}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <Label htmlFor="email">Ingresa el email</Label>
                                <FormControl>
                                    <Input id="email" placeholder="nombre@ejemplo.com" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                      Cerrar
                    </Button>
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
