

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
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
import { Loader2, Calendar as CalendarIcon, DollarSign, MessageSquare, Edit, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Alert, AlertDescription } from '../ui/alert';
import { useLocal } from '@/contexts/local-context';


const ingresoSchema = z.object({
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  efectivo: z.coerce.number().optional().default(0),
  deposito: z.coerce.number().optional().default(0),
  concepto: z.string().min(1, 'Debes seleccionar o ingresar un concepto.'),
  concepto_otro: z.string().optional(),
  local_id: z.string().min(1, 'Se requiere un local'),
}).refine(data => (data.efectivo || 0) > 0 || (data.deposito || 0) > 0, {
    message: 'Debes ingresar un monto en efectivo o depósito.',
    path: ['efectivo'],
}).refine(data => {
    if (data.concepto === 'Otro (especificar)') {
        return data.concepto_otro && data.concepto_otro.trim().length > 0;
    }
    return true;
}, {
    message: 'Por favor, especifica el concepto.',
    path: ['concepto_otro'],
});


type IngresoFormData = z.infer<typeof ingresoSchema>;

interface AddIngresoModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onFormSubmit: () => void;
}

const conceptosPredefinidos = [
    { id: 'ingreso_alejandro', label: 'Ingreso de Alejandro' },
    { id: 'otro', label: 'Otro (especificar)' },
];

export function AddIngresoModal({ isOpen, onOpenChange, onFormSubmit }: AddIngresoModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { selectedLocalId } = useLocal();

  const form = useForm<IngresoFormData>({
    resolver: zodResolver(ingresoSchema),
    defaultValues: {
      fecha: new Date(),
      concepto: '',
      concepto_otro: '',
      efectivo: '' as any,
      deposito: '' as any,
    },
  });

  const conceptoSeleccionado = form.watch('concepto');
  
  useEffect(() => {
    if(isOpen) {
        form.reset({
            fecha: new Date(),
            efectivo: '' as any,
            deposito: '' as any,
            concepto: '',
            concepto_otro: '',
            local_id: selectedLocalId || ''
        })
    }
  }, [isOpen, selectedLocalId, form])

  async function onSubmit(data: IngresoFormData) {
    setIsSubmitting(true);
    const finalConcepto = data.concepto === 'Otro (especificar)' ? data.concepto_otro : data.concepto;
    try {
      await addDoc(collection(db, 'ingresos_manuales'), {
        fecha: Timestamp.fromDate(data.fecha),
        efectivo: data.efectivo || 0,
        deposito: data.deposito || 0,
        concepto: finalConcepto,
        local_id: data.local_id
      });
      toast({
        title: 'Ingreso guardado',
        description: 'El nuevo ingreso ha sido registrado con éxito.',
      });
      onFormSubmit();
      onOpenChange(false);
    } catch (error) {
        console.error("Error guardando ingreso:", error);
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
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Agregar Ingreso Manual</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 px-1 py-6 max-h-[70vh] overflow-y-auto">
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
                name="concepto"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="flex items-center"><Edit className="mr-2 h-4 w-4" />Concepto</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col space-y-1"
                      >
                        {conceptosPredefinidos.map(c => (
                          <FormItem key={c.id} className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value={c.label} />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {c.label}
                            </FormLabel>
                          </FormItem>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {conceptoSeleccionado === 'Otro (especificar)' && (
                <FormField
                  control={form.control}
                  name="concepto_otro"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="Escribe el concepto aquí..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="efectivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" /> Efectivo</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} value={field.value ?? ''} /></FormControl>
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
                    <FormControl><Input type="number" placeholder="0" {...field} value={field.value ?? ''}/></FormControl>
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
