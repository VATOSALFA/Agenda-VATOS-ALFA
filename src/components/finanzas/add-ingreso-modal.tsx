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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Calendar as CalendarIcon, DollarSign, MessageSquare, Edit, Tag, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { addDoc, collection, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import type { IngresoManual, User, Local } from '@/lib/types';
import { useLocal } from '@/contexts/local-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

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
  localId?: string;
}

export function AddIngresoModal({ isOpen, onOpenChange, onFormSubmit, ingreso, localId }: AddIngresoModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { selectedLocalId: contextLocalId } = useLocal();
  const activeLocalId = localId || contextLocalId; // Prioritize prop, then context
  const isEditMode = !!ingreso;

  const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  const isAdminGeneral = user?.role === 'Administrador general';

  const filteredLocales = useMemo(() => {
    if (localesLoading || !locales) return [];
    if (isAdminGeneral) return locales;
    // For local admins/others, only show their assigned local
    if (user?.local_id) {
      return locales.filter(l => l.id === user.local_id);
    }
    return [];
  }, [locales, localesLoading, isAdminGeneral, user]);

  const form = useForm<IngresoFormData>({
    resolver: zodResolver(ingresoSchema),
    defaultValues: {
      fecha: new Date(),
      monto: '' as any,
      concepto: '',
      comentarios: '',
    },
  });

  const localAdmins = useMemo(() => {
    if (usersLoading) return [];
    // If specific local selected, filter by it. If 'todos' or none, show all local admins.
    if (activeLocalId && activeLocalId !== 'todos') {
      return users.filter(u => u.role === 'Administrador local' && u.local_id === activeLocalId);
    }
    return users.filter(u => u.role === 'Administrador local');
  }, [users, activeLocalId, usersLoading]);

  const generalAdmins = useMemo(() => {
    if (usersLoading) return [];
    return users.filter(u => u.role === 'Administrador general');
  }, [users, usersLoading]);

  const conceptos = useMemo(() => {
    const baseConcepts: { id: string; label: string }[] = [];

    // Add General Admins
    generalAdmins.forEach(admin => {
      baseConcepts.push({ id: `general_${admin.id}`, label: `Lo ingresó ${admin.name}` });
    });

    // Add Local Admins
    localAdmins.forEach(admin => {
      baseConcepts.push({ id: `local_${admin.id}`, label: `Lo ingresó ${admin.name}` });
    });

    baseConcepts.push({ id: 'otro', label: 'Otro' });
    return baseConcepts;
  }, [localAdmins, generalAdmins]);

  const conceptoSeleccionado = form.watch('concepto');

  useEffect(() => {
    if (isOpen) {
      if (isEditMode && ingreso) {
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
          local_id: activeLocalId && activeLocalId !== 'todos' ? activeLocalId : '',
        });
      }
    }
  }, [isOpen, ingreso, isEditMode, form, activeLocalId, conceptos]);


  async function onSubmit(data: IngresoFormData) {
    setIsSubmitting(true);

    let finalConcepto = data.concepto;
    // Lógica para asignar el concepto final
    if (data.concepto === 'Otro') {
      finalConcepto = data.concepto_otro || 'Otro';
    }

    const dataToSave = {
      ...data,
      fecha: Timestamp.fromDate(data.fecha),
      concepto: finalConcepto,
    };
    delete (dataToSave as any).concepto_otro;

    try {
      if (isEditMode && ingreso) {
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
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Editar Ingreso Manual' : 'Registrar Ingreso de Caja'}</DialogTitle>
              <DialogDescription>
                Añade dinero a la caja chica (fondo inicial, cambios, etc).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-1 py-6 flex-1 overflow-y-auto min-h-0">

              {/* Fila 1: Monto y Fecha */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="monto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><DollarSign className="mr-1 h-3 w-3" /> Monto</FormLabel>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                        <FormControl>
                          <Input type="number" className="pl-7 font-semibold text-lg" placeholder="0.00" {...field} value={field.value || ''} />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="fecha"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><CalendarIcon className="mr-1 h-3 w-3" /> Fecha</FormLabel>
                      <Popover modal={true} open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                              {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Selecciona fecha</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            locale={es}
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              if (date) {
                                const current = field.value || new Date();
                                const newDate = new Date(date);
                                newDate.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                                field.onChange(newDate);
                                setIsCalendarOpen(false);
                              } else {
                                field.onChange(date);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Fila 1.5: Local (Nuevo Campo Requerido) */}
              <FormField
                control={form.control}
                name="local_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><Store className="mr-1 h-3 w-3" /> Local / Sucursal</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isEditMode || (!!activeLocalId && activeLocalId !== 'todos') || (!isAdminGeneral && localesLoading)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona la sucursal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredLocales?.map((local) => (
                          <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fila 2: Concepto (Select) */}
              <FormField
                control={form.control}
                name="concepto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><Tag className="mr-1 h-3 w-3" /> Concepto / Motivo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona el origen del dinero" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {conceptos.map((c) => (
                          <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fila 3: Concepto Otro (Condicional) */}
              {conceptoSeleccionado === 'Otro' && (
                <FormField
                  control={form.control}
                  name="concepto_otro"
                  render={({ field }) => (
                    <FormItem className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <FormControl>
                        <Input placeholder="Especifique el motivo (Ej: Fondo inicial de caja)" {...field} autoFocus />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Fila 4: Comentarios */}
              <FormField
                control={form.control}
                name="comentarios"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-xs text-muted-foreground uppercase font-bold tracking-wide"><MessageSquare className="mr-1 h-3 w-3" /> Notas Adicionales</FormLabel>
                    <FormControl><Textarea className="resize-none" rows={2} placeholder="Detalles opcionales..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
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