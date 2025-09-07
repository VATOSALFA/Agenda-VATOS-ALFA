

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
import type { Profesional, Local, Egreso, User as AppUser } from '@/lib/types';
import { addDoc, collection, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLocal } from '@/contexts/local-context';
import { useAuth } from '@/contexts/firebase-auth-context';


const conceptosCostoFijo = ['Pago de renta', 'Insumos', 'Publicidad', 'Internet'];

const egresoSchema = z.object({
  fecha: z.date({ required_error: 'Debes seleccionar una fecha.' }),
  monto: z.coerce.number().min(1, 'El monto debe ser mayor a 0.'),
  concepto: z.string().min(1, 'Debes seleccionar un concepto.'),
  concepto_otro: z.string().optional(),
  aQuien: z.string().min(1, 'Debes seleccionar a quién se le entrega el dinero.'),
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
});


type EgresoFormData = z.infer<typeof egresoSchema>;

interface AddEgresoModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onFormSubmit: () => void;
  egreso?: Egreso | null;
}

const adminConcepts = [
    { id: 'pago_renta', label: 'Pago de renta' },
    { id: 'insumos', label: 'Insumos' },
    { id: 'publicidad', label: 'Publicidad' },
    { id: 'internet', label: 'Internet' },
    { id: 'nomina', label: 'Nómina' },
    { id: 'otro', label: 'Otro' },
];

const cashierConcepts = [
    { id: 'entrega_efectivo', label: 'Entrega de efectivo' }
];

export function AddEgresoModal({ isOpen, onOpenChange, onFormSubmit, egreso }: AddEgresoModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { selectedLocalId } = useLocal();
  const { user } = useAuth();
  const isEditMode = !!egreso;
  
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: users, loading: usersLoading } = useFirestoreQuery<AppUser>('usuarios');

  const isAdmin = user?.role === 'Administrador general' || user?.role === 'Administrador local';

  const conceptosDisponibles = isAdmin ? adminConcepts : cashierConcepts;

  const form = useForm<EgresoFormData>({
    resolver: zodResolver(egresoSchema),
    defaultValues: {
      fecha: new Date(),
      monto: '' as any,
      concepto: '',
      aQuien: '',
      local_id: '',
      comentarios: '',
    },
  });

  const conceptoSeleccionado = form.watch('concepto');
  const localSeleccionadoId = form.watch('local_id');

  const destinatariosDisponibles = useMemo(() => {
    if (usersLoading || professionalsLoading) return [];
    
    let personal = [...professionals, ...users]
      .filter(p => p.local_id === localSeleccionadoId)
      .filter((value, index, self) => index === self.findIndex((t) => (t.id === value.id))); // Remove duplicates

    if (isAdmin) return personal;
    
    // For non-admins, filter to only show admins
    return personal.filter(u => u.role === 'Administrador general' || u.role === 'Administrador local');
  }, [isAdmin, professionals, users, localSeleccionadoId, usersLoading, professionalsLoading]);

  useEffect(() => {
    if (conceptosCostoFijo.includes(conceptoSeleccionado)) {
        form.setValue('aQuien', 'Costos fijos');
    }
  }, [conceptoSeleccionado, form]);

  useEffect(() => {
    if (isOpen) {
        if (isEditMode && egreso) {
            const fechaEgreso = egreso.fecha instanceof Timestamp 
                ? egreso.fecha.toDate() 
                : (egreso.fecha instanceof Date ? egreso.fecha : new Date());

            const isPredefinedConcept = conceptosDisponibles.some(c => c.label === egreso.concepto);

            form.reset({
                ...egreso,
                monto: egreso.monto,
                fecha: fechaEgreso,
                concepto: isPredefinedConcept ? egreso.concepto : 'Otro',
                concepto_otro: isPredefinedConcept ? '' : egreso.concepto
            });
        } else {
            form.reset({
                fecha: new Date(),
                monto: '' as any,
                concepto: !isAdmin ? 'Entrega de efectivo' : '',
                aQuien: '',
                comentarios: '',
                concepto_otro: '',
                local_id: selectedLocalId || (locales.length > 0 ? locales[0].id : ''),
            });
        }
    }
  }, [isOpen, egreso, isEditMode, form, locales, selectedLocalId, isAdmin, conceptosDisponibles]);


  async function onSubmit(data: EgresoFormData) {
    setIsSubmitting(true);
    const finalConcepto = data.concepto === 'Otro' ? data.concepto_otro : data.concepto;
    
    const aQuienValue = isAdmin && conceptosCostoFijo.includes(finalConcepto as string) 
        ? 'Costos fijos' 
        : data.aQuien;

    const dataToSave = {
        fecha: Timestamp.fromDate(data.fecha),
        monto: data.monto,
        concepto: finalConcepto,
        aQuien: aQuienValue,
        local_id: data.local_id,
        comentarios: data.comentarios,
        persona_entrega_id: user?.uid,
        persona_entrega_nombre: user?.displayName
    };

    try {
      if(isEditMode && egreso) {
          const egresoRef = doc(db, 'egresos', egreso.id);
          await updateDoc(egresoRef, dataToSave);
          toast({ title: 'Egreso actualizado' });
      } else {
          await addDoc(collection(db, 'egresos'), dataToSave);
          toast({ title: 'Egreso guardado' });
      }
      
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
  const selectedLocalName = locales.find(l => l.id === selectedLocalId)?.name || 'Cargando...';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader className="flex-row items-center justify-between space-y-0">
              <DialogTitle>{isEditMode ? "Editar Egreso" : "Agregar Egreso Manual"}</DialogTitle>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isEditMode ? 'Guardar Cambios' : 'Guardar Egreso'}
                    </Button>
                </div>
            </DialogHeader>

            <div className="space-y-4 px-1 py-6 max-h-[70vh] overflow-y-auto">
                <FormField
                    control={form.control}
                    name="monto"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center"><DollarSign className="mr-2 h-4 w-4" /> Monto</FormLabel>
                        <FormControl><Input type="number" placeholder="0" {...field} value={field.value || ''} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="aQuien"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> ¿A quién se le entrega?</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={professionalsLoading || esCostoFijo || usersLoading}>
                        <FormControl>
                            <SelectTrigger>
                            <SelectValue placeholder={esCostoFijo ? 'Costos fijos' : (professionalsLoading || usersLoading ? 'Cargando...' : 'Selecciona...')} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {destinatariosDisponibles.map(p => (
                                <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormItem>
                    <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" /> Entrega</FormLabel>
                    <FormControl>
                        <Input readOnly value={user?.displayName || 'Usuario no identificado'} disabled className="bg-muted"/>
                    </FormControl>
                </FormItem>
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
                        className="grid grid-cols-2 gap-2"
                        disabled={!isAdmin}
                      >
                        {conceptosDisponibles.map(c => (
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

             {conceptoSeleccionado === 'Otro' && isAdmin && (
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
                  name="local_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Local</FormLabel>
                       <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading || !isAdmin}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar local..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locales.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
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
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
