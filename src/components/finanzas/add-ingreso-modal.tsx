
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Calendar as CalendarIcon, DollarSign, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '../ui/alert';

const ingresoSchema = z.object({
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  efectivo: z.number({ coerce: true }).min(0, 'El monto debe ser positivo.').optional().default(0),
  deposito: z.number({ coerce: true }).min(0, 'El monto debe ser positivo.').optional().default(0),
}).refine(data => data.efectivo > 0 || data.deposito > 0, {
    message: 'Debes ingresar un monto en efectivo o depósito.',
    path: ['efectivo'],
});

type IngresoFormData = z.infer<typeof ingresoSchema>;

interface AddIngresoModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onFormSubmit: () => void;
}

export function AddIngresoModal({ isOpen, onOpenChange, onFormSubmit }: AddIngresoModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<IngresoFormData>({
    resolver: zodResolver(ingresoSchema),
    defaultValues: {
      fecha: new Date(),
      efectivo: 0,
      deposito: 0,
    },
  });

  async function onSubmit(data: IngresoFormData) {
    setIsSubmitting(true);
    console.log("Guardando ingreso manual:", data);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: 'Ingreso guardado',
        description: 'El nuevo ingreso ha sido registrado con éxito.',
      });
      form.reset();
      onFormSubmit();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el ingreso. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Agregar Ingreso Manual</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 px-1">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                    Este ingreso se sumará a los ingresos automáticos de la caja de ventas.
                </AlertDescription>
              </Alert>
              <FormField
                control={form.control}
                name="fecha"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="flex items-center"><CalendarIcon className="mr-2 h-4 w-4" /> Fecha</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Selecciona una fecha</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar locale={es} mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="efectivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" /> Efectivo</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deposito"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" /> Depósito</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar Ingreso
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
