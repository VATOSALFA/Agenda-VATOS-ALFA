'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useMemo } from 'react';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Calendar as CalendarIcon, DollarSign, MessageSquare, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { addDoc, collection, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { IngresoManual, User } from '@/lib/types';
import { useLocal } from '@/contexts/local-context';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { useFirestoreQuery } from '@/hooks/use-firestore';

const ingresoSchema = z.object({
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  monto: z.coerce.number().min(1, 'El monto debe ser mayor a 0.'),
  concepto: z.string().min(1, 'El concepto es requerido'),
  concepto_otro: z.string().optional(),
  comentarios: z.string().optional(),
  local_id: z.string().min(1, 'El local es requerido'),
}).refine(data => {
    if (data.concepto === 'Otro') {
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
  ingreso?: IngresoManual | null;
}

export function AddIngresoModal({ isOpen, onOpenChange, onFormSubmit, ingreso }: AddIngresoModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { selectedLocalId } = useLocal();
  const isEditMode = !!ingreso;
  
  const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');

  const form = useForm<IngresoFormData>({
    resolver: zodResolver(ingresoSchema),
    defaultValues: {
      fecha: new Date(),
      monto: '' as any,
      concepto: '',
      comentarios: '',
    },
  });

  const localAdmin = useMemo(() => {
      if (usersLoading || !selectedLocalId) return null;
      return users.find(u => u.role === 'Administrador local' && u.local_id === selectedLocalId);
  }, [users, selectedLocalId, usersLoading]);

  const conceptos = useMemo(() => {
      const baseConcepts = [{ id: 'alejandro', label: 'Lo ingresó Alejandro' }];
      if (localAdmin) {
          baseConcepts.push({ id: 'local_admin', label: `Lo ingresó ${localAdmin.name}`});
      }
      baseConcepts.push({ id: 'otro', label: 'Otro' });
      return baseConcepts;
  }, [localAdmin]);

  const conceptoSeleccionado = form.watch('concepto');

  useEffect(() => {
    if (isOpen) {
        if(isEditMode && ingreso) {
            const isPredefined = conceptos.some(c => c.label === ingreso.concepto);
            form.reset({
                ...ingreso,
                fecha: ingreso.fecha.toDate(),
                concepto: isPredefined ? ingreso.concepto : 'Otro',
                concepto_otro: isPredefined ? '' : ingreso.concepto,
            });
        } else {
            form.reset({
                fecha: new Date(),
                monto: '' as any,
                concepto: '',
                concepto_otro: '',
                comentarios: '',
                local_id: selectedLocalId || '',
            });
        }
    }
  }, [isOpen, ingreso, isEditMode, form, selectedLocalId, conceptos]);


  async function onSubmit(data: IngresoFormData) {
    setIsSubmitting(true);
    
    let finalConcepto = data.concepto;
    if (data.concepto === 'Lo ingresó Alejandro') {
        finalConcepto = 'Lo ingresó Alejandro';
    } else if (localAdmin && data.concepto === `Lo ingresó ${localAdmin.name}`) {
        finalConcepto = `Lo ingresó ${localAdmin.name}`;
    } else if (data.concepto === 'Otro') {
        finalConcepto = data.concepto_otro || 'Otro';
    }
    
    const dataToSave = {
        ...data,
        fecha: Timestamp.fromDate(data.fecha),
        concepto: finalConcepto,
    };
    delete (dataToSave as any).concepto_otro;

    try {
      if(isEditMode && ingreso) {
          const ingresoRef = doc(db, 'ingresos_manuales', ingreso.id);
          await updateDoc(ingresoRef, dataToSave);
          toast({ title: 'Ingreso actualizado' });
      } else {
          await addDoc(collection(db, 'ingresos_manuales'), dataToSave);
          toast({ title: 'Ingreso guardado' });
      }
      
      onFormSubmit();
      onOpenChange(false);
    } catch (error) {
      console.error('Error al registrar ingreso:', error);
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
              <DialogTitle>{isEditMode ? 'Editar Ingreso Manual' : 'Agregar Ingreso Manual'}</DialogTitle>
              <DialogDescription>
                Registra un ingreso de dinero a la caja que no provenga de una venta.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-1 py-6">
              <FormField
                control={form.control}
                name="monto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" /> Monto del Ingreso</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} value={field.value || ''} /></FormControl>
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
                        className="grid grid-cols-1 gap-2"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="Lo ingresó Alejandro" /></FormControl>
                          <FormLabel className="font-normal">Lo ingresó Alejandro</FormLabel>
                        </FormItem>
                        {localAdmin && (
                            <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl><RadioGroupItem value={`Lo ingresó ${localAdmin.name}`} /></FormControl>
                                <FormLabel className="font-normal">Lo ingresó {localAdmin.name}</FormLabel>
                            </FormItem>
                        )}
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="Otro" /></FormControl>
                          <FormLabel className="font-normal">Otro</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {conceptoSeleccionado === 'Otro' && (
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
                name="comentarios"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><MessageSquare className="mr-2 h-4 w-4" /> Comentarios (opcional)</FormLabel>
                    <FormControl><Textarea placeholder="Añade detalles adicionales..." {...field} /></FormControl>
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
