
'use client';

import { useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import type { AuthCode } from '@/app/settings/auth-codes/page';

interface AuthCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<AuthCode, 'id'>) => void;
  code: AuthCode | null;
}

const authCodeSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  code: z.string().min(1, 'El código es requerido.'),
  active: z.boolean(),
  reserves: z.boolean(),
  cashbox: z.boolean(),
  download: z.boolean(),
});

type AuthCodeFormData = z.infer<typeof authCodeSchema>;

export function AuthCodeModal({ isOpen, onClose, onSave, code }: AuthCodeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!code;

  const form = useForm<AuthCodeFormData>({
    resolver: zodResolver(authCodeSchema),
    defaultValues: {
      name: '',
      code: '',
      active: true,
      reserves: true,
      cashbox: true,
      download: true,
    },
  });

  useEffect(() => {
    if (code) {
      form.reset(code);
    } else {
      form.reset({
        name: '',
        code: '',
        active: true,
        reserves: true,
        cashbox: true,
        download: true,
      });
    }
  }, [code, form, isOpen]);

  const onSubmit = (data: AuthCodeFormData) => {
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      onSave(data);
      setIsSubmitting(false);
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Editar Código' : 'Agregar Código'}</DialogTitle>
              <DialogDescription>
                Configura los detalles y permisos para este código de autorización.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Cajero Turno Mañana" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input placeholder="Ingresa el código secreto" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-3 pt-4 border-t">
                 <FormField
                  control={form.control}
                  name="reserves"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Permiso de Reservas</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="cashbox"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Permiso de Caja</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="download"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Permiso de Descarga de Archivos</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
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
