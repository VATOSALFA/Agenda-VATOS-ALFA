
'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller, useFieldArray, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Plus, Upload, Info, ImagePlus } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryModal } from '@/components/admin/servicios/category-modal';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { collection, addDoc, updateDoc, doc, Timestamp, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import type { Service, ServiceCategory, Profesional } from '@/lib/types';
import { ImageUploader } from '@/components/shared/image-uploader';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

interface EditServicioModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: Service | null;
  onDataSaved: () => void;
}

const requiredNumberSchema = z.coerce.string().min(1, 'Este campo es requerido.').pipe(z.coerce.number({ invalid_type_error: 'Debe ser un número válido.' }).min(0, 'Debe ser un número positivo.'));

const serviceSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  price: requiredNumberSchema,
  duration: requiredNumberSchema,
  category: z.string().min(1, 'La categoría es requerida.'),
  description: z.string().max(200, 'La descripción no puede exceder los 200 caracteres.').optional(),
  include_vat: z.boolean().default(false),
  commission_value: requiredNumberSchema,
  commission_type: z.enum(['%', '$']).default('%'),
  professionals: z.array(z.string()).optional(),
  payment_type: z.string().optional(),
  payment_amount_value: z.coerce.string().optional(),
  payment_amount_type: z.enum(['%', '$']).default('%'),
  images: z.array(z.object({ value: z.string() })).optional().default([]),
});

type ServiceFormData = z.infer<typeof serviceSchema>;


export function EditServicioModal({ isOpen, onClose, service, onDataSaved }: EditServicioModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
  const { data: allProfessionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const professionals = allProfessionals.filter(p => !p.deleted);

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '', description: '', price: '' as any, duration: '' as any, category: '', include_vat: false, commission_value: '' as any, commission_type: '%', professionals: [], images: []
    }
  });

  const { control, handleSubmit, setValue, watch, reset } = form;

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "images"
  });

  useEffect(() => {
    if (service) {
      reset({
        ...service,
        commission_value: (service.defaultCommission?.value ?? '') as any,
        commission_type: service.defaultCommission?.type || '%',
        description: service.description || '',
        include_vat: service.include_vat || false, // Ensure boolean
        price: (service.price ?? '') as any,
        duration: (service.duration ?? '') as any,
        images: Array.isArray(service.images) ? service.images.map(imgUrl => ({ value: imgUrl })) : [],
        payment_type: service.payment_type || 'no-payment',
        payment_amount_value: (service.payment_amount_value ?? '') as any,
        payment_amount_type: service.payment_amount_type || '%',
      });
    } else {
      reset({
        name: '',
        description: '',
        price: '' as any,
        duration: '' as any,
        category: '',
        include_vat: false,
        professionals: [],
        payment_type: 'no-payment',
        commission_value: '' as any,
        commission_type: '%',
        images: []
      });
    }
  }, [service, reset]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose(); // Call the parent onClose (which updates parent state)
      // Safety hack: Force unlock body after animation to prevent freezing
      setTimeout(() => {
        document.body.style.removeProperty('pointer-events');
        document.body.style.removeProperty('overflow');
        document.body.removeAttribute('data-scroll-locked');
      }, 500);
    }
  };


  const selectedProfessionals = watch('professionals', []);

  const handleSelectAll = (checked: boolean | string) => {
    if (checked) {
      setValue('professionals', professionals.map(p => p.id));
    } else {
      setValue('professionals', []);
    }
  }

  const handleCategoryCreated = (newCategory: ServiceCategory) => {
    setValue('category', newCategory.id);
  };

  const onSubmit = async (data: ServiceFormData) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      const commissionValue = Number(data.commission_value) || 0;
      const commissionType = data.commission_type || '%';

      // Prepare the object to save, excluding UI-only fields
      const dataToSave = {
        name: data.name,
        description: data.description || '',
        price: Number(data.price),
        duration: Number(data.duration),
        category: data.category,
        include_vat: data.include_vat,
        payment_type: data.payment_type || 'no-payment',
        // Only save payment amount if type is online-deposit
        payment_amount_value: data.payment_type === 'online-deposit' ? (Number(data.payment_amount_value) || 0) : 0,
        payment_amount_type: data.payment_type === 'online-deposit' ? (data.payment_amount_type || '%') : '%',
        defaultCommission: {
          value: commissionValue,
          type: commissionType
        },
        professionals: data.professionals || [],
        images: data.images?.map(img => img.value).filter(Boolean) || [],
      };

      // Sync professionals logic
      const syncProfessionals = async (serviceId: string, newProfessionals: string[]) => {
        const oldProfessionals = service?.professionals || [];
        const addedPros = newProfessionals.filter(p => !oldProfessionals.includes(p));
        const removedPros = oldProfessionals.filter(p => !newProfessionals.includes(p));

        const batch = writeBatch(db);
        let batchCount = 0;

        // Create a Set of existing professional IDs for fast lookup
        // We use allProfessionals (raw from query) to ensure we have the latest list
        const existingProfIds = new Set(allProfessionals.map(p => p.id));

        for (const profId of addedPros) {
          if (existingProfIds.has(profId)) {
            const profRef = doc(db, 'profesionales', profId);
            batch.update(profRef, {
              services: arrayUnion(serviceId)
            });
            batchCount++;
          }
        }

        for (const profId of removedPros) {
          if (existingProfIds.has(profId)) {
            const profRef = doc(db, 'profesionales', profId);
            batch.update(profRef, {
              services: arrayRemove(serviceId)
            });
            batchCount++;
          } else {
            console.warn(`Attempted to unlink service from non-existent professional: ${profId}`);
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }
      };

      if (service) {
        const serviceRef = doc(db, 'servicios', service.id);
        await updateDoc(serviceRef, dataToSave);

        // Sync professionals
        await syncProfessionals(service.id, data.professionals || []);

        toast({ title: "Servicio actualizado con éxito" });
      } else {
        const newServiceRef = await addDoc(collection(db, 'servicios'), {
          ...dataToSave,
          active: true,
          order: 99,
          created_at: Timestamp.now(),
        });

        // Sync professionals for new service
        await syncProfessionals(newServiceRef.id, data.professionals || []);

        toast({ title: "Servicio guardado con éxito" });
      }

      onDataSaved();
      handleOpenChange(false);

    } catch (error) {
      console.error("Error saving service:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el servicio. Inténtalo de nuevo.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onErrors = (errors: FieldErrors<ServiceFormData>) => {
    const missingFields: string[] = [];
    if (errors.name) missingFields.push('Nombre del servicio');
    if (errors.price) missingFields.push('Precio');
    if (errors.duration) missingFields.push('Duración');
    if (errors.category) missingFields.push('Categoría');
    if (errors.commission_value) missingFields.push('Comisión');

    if (missingFields.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Campos requeridos faltantes',
        description: `Por favor completa los siguientes campos: ${missingFields.join(', ')}`,
      });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{service ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle>
            <DialogDescription>
              Configura un nuevo servicio para tu negocio.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit, onErrors)} className="flex-grow flex flex-col overflow-hidden">
              <div className="flex-grow overflow-hidden">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <FormField
                        control={control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre del servicio *</FormLabel>
                            <FormControl>
                              <Input placeholder="El nombre aparecerá en el Sitio Web" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <FormField
                        control={control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Descripción detallada</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Textarea placeholder="Describe el servicio, qué incluye, recomendaciones, etc." {...field} maxLength={200} />
                                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-1 rounded">
                                  {field.value?.length || 0}/200
                                </div>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <FormField
                          control={control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Precio *</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="0" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <FormField
                          control={control}
                          name="duration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duración (min) *</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="0" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    <div className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center space-x-2">
                        <Controller name="include_vat" control={control} render={({ field }) => (
                          <Checkbox id="include-vat" checked={field.value} onCheckedChange={field.onChange} />
                        )} />
                        <Label htmlFor="include-vat" className="font-normal">Precio incluye IVA</Label>
                      </div>
                      <div className="space-y-2">
                        <FormField
                          control={control}
                          name="commission_value"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Comisión *</FormLabel>
                              <div className="flex items-center gap-2">
                                <FormControl>
                                  <Input type="number" placeholder="Porcentaje" className="flex-grow" {...field} />
                                </FormControl>
                                <Controller name="commission_type" control={control} render={({ field: typeField }) => (
                                  <Select onValueChange={typeField.onChange} value={typeField.value || '%'}>
                                    <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="%">%</SelectItem>
                                      <SelectItem value="$">$</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )} />
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <FormField
                        control={control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Categoría *</FormLabel>
                            <div className="flex gap-2">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button variant="outline" type="button" onClick={() => setIsCategoryModalOpen(true)}><Plus className="mr-2 h-4 w-4" />Nueva categoría</Button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold">Selecciona que profesionales realizarán el servicio</h4>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="select-all-professionals"
                            checked={professionals.length > 0 && professionals.every(p => selectedProfessionals?.includes(p.id))}
                            onCheckedChange={handleSelectAll}
                          />
                          <Label htmlFor="select-all-professionals">Seleccionar todos</Label>
                        </div>
                      </div>
                      <Accordion type="single" collapsible className="w-full" defaultValue="item-1">
                        <AccordionItem value="item-1">
                          <AccordionTrigger>Ver/Ocultar lista de profesionales</AccordionTrigger>
                          <AccordionContent>
                            <Controller
                              name="professionals"
                              control={control}
                              render={({ field }) => (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                                  {professionals.map(prof => (
                                    <div key={prof.id} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={prof.id}
                                        checked={field.value?.includes(prof.id)}
                                        onCheckedChange={(checked) => {
                                          const currentValue = field.value || [];
                                          const newValue = checked
                                            ? [...currentValue, prof.id]
                                            : currentValue.filter((id) => id !== prof.id);
                                          field.onChange(newValue);
                                        }}
                                      />
                                      <Label htmlFor={prof.id} className="font-normal cursor-pointer">{prof.name}</Label>
                                    </div>
                                  ))}
                                </div>
                              )}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Pago en línea</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Controller
                          name="payment_type"
                          control={control}
                          render={({ field }) => (
                            <RadioGroup onValueChange={field.onChange} value={field.value} className="space-y-4">
                              <div className="flex items-start space-x-3 rounded-md border p-4">
                                <RadioGroupItem value="online-deposit" id="online-deposit" />
                                <div className="grid gap-1.5 leading-none w-full">
                                  <Label htmlFor="online-deposit">Abono en línea</Label>
                                  <p className="text-sm text-muted-foreground">Tus clientes deberán pagar una parte del servicio al agendar. Podrás cobrar con POS de AgendaPro el monto restante.</p>
                                  {(watch('payment_type') === 'online-deposit') && (
                                    <div className="pt-2">
                                      <Label className="text-xs">Monto del anticipo</Label>
                                      <div className="flex gap-2">
                                        <div className="flex-grow">
                                          <Controller
                                            control={control}
                                            name="payment_amount_value"
                                            render={({ field }) => (
                                              <Input type="number" placeholder="50" className="h-9" {...field} />
                                            )}
                                          />
                                        </div>
                                        <div className="w-[80px]">
                                          <Controller
                                            control={control}
                                            name="payment_amount_type"
                                            render={({ field }) => (
                                              <Select onValueChange={field.onChange} value={field.value || '%'}>
                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="%">%</SelectItem>
                                                  <SelectItem value="$">$</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            )}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start space-x-3 rounded-md border p-4">
                                <RadioGroupItem value="full-payment" id="full-payment" />
                                <div className="grid gap-1.5 leading-none">
                                  <Label htmlFor="full-payment">Se debe pagar en línea</Label>
                                  <p className="text-sm text-muted-foreground">Tus clientes deberán realizar el pago completo de este servicio en línea.</p>
                                  <div className="pt-2">
                                    <Label className="text-xs">Descuento sólo para pago en línea</Label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                                      <Input placeholder="Incentiva el pago en línea" className="pl-6 h-9" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-start space-x-3 rounded-md border p-4">
                                <RadioGroupItem value="no-payment" id="no-payment" />
                                <div className="grid gap-1.5 leading-none">
                                  <Label htmlFor="no-payment">No se puede pagar en línea</Label>
                                  <p className="text-sm text-muted-foreground">Tus clientes no podrán pagar este servicio en línea pero si agendarlo.</p>
                                </div>
                              </div>
                            </RadioGroup>
                          )}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Agregar imágenes</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          ¡Carga hasta 3 imágenes de tu servicio! Te recomendamos que tengan un tamaño mínimo de 200x200px y un peso máximo de 3MB.
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 gap-4">
                          <ImageUploader
                            key={fields[0]?.id || `placeholder-0`}
                            folder="servicios"
                            currentImageUrl={fields[0]?.value}
                            onUpload={(url) => {
                              if (fields[0]) {
                                update(0, { value: url });
                              } else {
                                append({ value: url });
                              }
                            }}
                            onRemove={() => {
                              if (fields[0]) {
                                remove(0);
                              }
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </div>
              <DialogFooter className="pt-6 border-t flex-shrink-0">
                <Button variant="ghost" type="button" onClick={() => handleOpenChange(false)}>Cerrar</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onDataSaved={handleCategoryCreated}
        existingCategories={categories}
      />
    </>
  );
}

