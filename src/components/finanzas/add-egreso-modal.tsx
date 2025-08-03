

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Calendar as CalendarIcon, DollarSign, Edit, User, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Profesional, Local } from '@/lib/types';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLocal } from '@/contexts/local-context';


const conceptosCostoFijo = ['Pago de renta', 'Insumos', 'Publicidad', 'Internet'];

const egresoSchema = z.object({
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  monto: z.number({ coerce: true }).min(1, 'El monto debe ser mayor a 0.'),
  concepto: z.string().min(1, 'Debes seleccionar un concepto.'),
  concepto_otro: z.string().optional(),
  aQuien: z.string(),
  local_id: z.string().min(1, 'Debes seleccionar un local.'),
  comentarios: z.string().optional(),
}).refine(data => {
    if (data.concepto === 'Otro') {
        return data.concepto_otro && data.concepto_otro.trim().length > 0;
    }
    return true;
}, {
    message: 'Por favor, especifica el concepto.',
    path: ['concepto_otro'],
}).refine(data => {
    if (conceptosCostoFijo.includes(data.concepto)) {
        return true; 
    }
    return data.aQuien && data.aQuien.trim().length > 0 && data.aQuien !== 'Costos fijos';
}, {
    message: 'Debes seleccionar un profesional.',
    path: ['aQuien'],
});


type EgresoFormData = z.infer<typeof egresoSchema>;

interface AddEgresoModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onFormSubmit: () => void;
}

const conceptosPredefinidos = [
    { id: 'nomina', label: 'Nómina' },
    { id: 'pago_renta', label: 'Pago de renta' },
    { id: 'insumos', label: 'Insumos' },
    { id: 'publicidad', label: 'Publicidad' },
    { id: 'internet', label: 'Internet' },
    { id: 'comision_servicios', label: 'Comisión Servicios' },
    { id: 'comision_producto', label: 'Comisión Venta de producto' },
    { id: 'propina_terminal', label: 'Propina en terminal' },
    { id: 'otro', label: 'Otro' },
];


export function AddEgresoModal({ isOpen, onOpenChange, onFormSubmit }: AddEgresoModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { selectedLocalId } = useLocal();
  
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  const form = useForm<EgresoFormData>({
    resolver: zodResolver(egresoSchema),
    defaultValues: {
      fecha: new Date(),
      concepto: '',
      aQuien: '',
      local_id: '',
      comentarios: '',
    },
  });

  const conceptoSeleccionado = form.watch('concepto');

  useEffect(() => {
    if (conceptosCostoFijo.includes(conceptoSeleccionado)) {
        form.setValue('aQuien', 'Costos fijos');
    }
  }, [conceptoSeleccionado, form]);

  useEffect(() => {
    if (!isOpen) {
        form.reset({
            fecha: new Date(),
            monto: 0,
            concepto: '',
            aQuien: '',
            comentarios: '',
            concepto_otro: '',
            local_id: selectedLocalId || (locales.length > 0 ? locales[0].id : ''),
        });
    } else if (selectedLocalId) {
        form.setValue('local_id', selectedLocalId);
    } else if (locales.length > 0) {
        form.setValue('local_id', locales[0].id);
    }
  }, [isOpen, form, locales, selectedLocalId]);


  async function onSubmit(data: EgresoFormData) {
    setIsSubmitting(true);
    const finalConcepto = data.concepto === 'Otro' ? data.concepto_otro : data.concepto;
    
    try {
      await addDoc(collection(db, 'egresos'), {
        fecha: Timestamp.fromDate(data.fecha),
        monto: data.monto,
        concepto: finalConcepto,
        aQuien: data.aQuien,
        local_id: data.local_id,
        comentarios: data.comentarios,
      });

      toast({
        title: 'Egreso guardado',
        description: 'El nuevo egreso ha sido registrado con éxito.',
      });
      onFormSubmit();
    } catch (error) {
      console.error('Error al registrar egreso:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el egreso. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  
  const esCostoFijo = conceptosCostoFijo.includes(conceptoSeleccionado);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Agregar Egreso Manual</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 px-1 max-h-[70vh] overflow-y-auto">
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
                name="monto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" /> Monto</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
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
                        className="grid grid-cols-2 gap-2"
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
                name="aQuien"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> ¿A quién se le entrega?</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value} disabled={professionalsLoading || esCostoFijo}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={esCostoFijo ? 'Costos fijos' : (professionalsLoading ? 'Cargando...' : 'Selecciona un profesional')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {professionals.map(prof => (
                            <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="local_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Local</FormLabel>
                     <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={localesLoading ? 'Cargando...' : 'Selecciona un local'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locales.map(local => (
                            <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    Guardar Egreso
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
