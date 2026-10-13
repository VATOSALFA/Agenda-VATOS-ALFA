
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, KeyRound, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { addDoc, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import type { AuthCode } from '@/lib/types';

interface AuthCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  code: AuthCode | null;
}

const authCodeSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  code: z.string().min(1, 'El código es requerido.'),
  active: z.boolean(),
  reserves: z.boolean(),
  cashbox: z.boolean(),
  download: z.boolean(),
  invoiced_sales: z.boolean(),
});

type AuthCodeFormData = z.infer<typeof authCodeSchema>;

export function AuthCodeModal({ isOpen, onClose, onSave, code }: AuthCodeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!code;
  const { toast } = useToast();

  const form = useForm<AuthCodeFormData>({
    resolver: zodResolver(authCodeSchema),
    defaultValues: {
      name: '',
      code: '',
      active: true,
      reserves: true,
      cashbox: true,
      download: true,
      invoiced_sales: true,
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
        invoiced_sales: true,
      });
    }
  }, [code, form, isOpen]);

  const onSubmit = async (data: AuthCodeFormData) => {
    setIsSubmitting(true);
    try {
      if (isEditMode && code) {
        const codeRef = doc(db, 'codigos_autorizacion', code.id);
        await updateDoc(codeRef, data);
        toast({ title: 'Código actualizado con éxito' });
      } else {
        await addDoc(collection(db, 'codigos_autorizacion'), {
          ...data,
          created_at: Timestamp.now(),
        });
        toast({ title: 'Código creado con éxito' });
      }
      onSave();
    } catch (error) {
      console.error("Error saving auth code:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el código.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent hideCloseButton className="p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] sm:max-w-lg bg-card">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Cabecera Oficial Vatos Alfa */}
            <div className="relative px-5 py-3.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white overflow-hidden border-b border-slate-800">
              <div className="header-light-beam" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="h-5 w-5 text-slate-300 shrink-0" />
                  <div>
                    <DialogTitle className="text-sm font-semibold text-white tracking-tight">
                      {isEditMode ? 'Editar Código' : 'Agregar Código'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-300">
                      Configura el PIN y permisos de autorización operativa.
                    </DialogDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-foreground">Nombre / Rol de Referencia</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Supervisor de Turno" className="h-8 text-xs font-sans" {...field} />
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
                    <FormLabel className="text-xs font-semibold text-foreground">Código PIN Secreto</FormLabel>
                    <FormControl>
                      <Input placeholder="Ingresa el PIN" type="password" className="h-8 text-xs font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden bg-muted/5">
                <FormField
                  control={form.control}
                  name="reserves"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-medium text-foreground cursor-pointer">Permiso en Reservas</FormLabel>
                        <p className="text-[11px] text-muted-foreground">Permite anular o sobreescribir citas agendadas.</p>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="scale-90" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cashbox"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-medium text-foreground cursor-pointer">Permiso en Caja</FormLabel>
                        <p className="text-[11px] text-muted-foreground">Permite aperturas, cortes y movimientos de caja manuales.</p>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="scale-90" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="download"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-medium text-foreground cursor-pointer">Descarga de Reportes</FormLabel>
                        <p className="text-[11px] text-muted-foreground">Autoriza la exportación de archivos Excel y métricas confidenciales.</p>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="scale-90" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiced_sales"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-xs font-medium text-foreground cursor-pointer">Ventas Facturadas</FormLabel>
                        <p className="text-[11px] text-muted-foreground">Permite la emisión o cancelación de comprobantes fiscales.</p>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="scale-90" /></FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="border-t border-border/50 p-4 bg-muted/10 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 text-xs rounded-xl border-border/80">
                Cancelar
              </Button>
              <Button type="submit" variant="alfa" disabled={isSubmitting} className="h-9 px-5 text-xs font-semibold">
                {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {isEditMode ? 'Guardar Cambios' : 'Crear Código'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
