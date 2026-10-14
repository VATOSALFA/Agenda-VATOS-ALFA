
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
import { Loader2, Plus, Upload, Info, ImagePlus, Scissors, X, HelpCircle, Users, CreditCard, Camera, Check, Globe } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  visible_en_web: z.boolean().default(true),
  commission_value: requiredNumberSchema,
  commission_type: z.enum(['%', '$']).default('%'),
  professionals: z.array(z.string()).optional(),
  payment_type: z.string().optional(),
  payment_amount_value: z.coerce.string().optional(),
  payment_amount_type: z.enum(['%', '$']).default('%'),
  images: z.array(z.object({ value: z.string() })).optional().default([]),
  durationPorProfesional: z.record(z.string(), z.union([z.coerce.number(), z.string().transform(v => v === "" ? "" : Number(v))]).optional()).optional(),
});

type ServiceFormData = z.infer<typeof serviceSchema>;


export function EditServicioModal({ isOpen, onClose, service, onDataSaved }: EditServicioModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
  const { data: allProfessionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  const professionals = allProfessionals.filter(p => !p.deleted);

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '', description: '', price: '' as any, duration: '' as any, category: '', include_vat: false, visible_en_web: true, commission_value: '' as any, commission_type: '%', professionals: [], images: []
    }
  });

  const { control, handleSubmit, setValue, watch, reset } = form;

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "images"
  });

  useEffect(() => {
    setActiveTab('general');
    if (service) {
      reset({
        ...service,
        commission_value: (service.defaultCommission?.value ?? '') as any,
        commission_type: service.defaultCommission?.type || '%',
        description: service.description || '',
        include_vat: service.include_vat || false, // Ensure boolean
        visible_en_web: service.visible_en_web ?? true,
        price: (service.price ?? '') as any,
        duration: (service.duration ?? '') as any,
        images: Array.isArray(service.images) ? service.images.map(imgUrl => ({ value: imgUrl })) : [],
        payment_type: service.payment_type || 'no-payment',
        payment_amount_value: (service.payment_amount_value ?? '') as any,
        payment_amount_type: service.payment_amount_type || '%',
        durationPorProfesional: service.durationPorProfesional || {},
      });
    } else {
      reset({
        name: '',
        description: '',
        price: '' as any,
        duration: '' as any,
        category: '',
        include_vat: false,
        visible_en_web: true,
        professionals: [],
        payment_type: 'no-payment',
        commission_value: '' as any,
        commission_type: '%',
        images: [],
        durationPorProfesional: {}
      });
    }
  }, [service, reset]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose(); // Call the parent onClose (which updates parent state)
      setActiveTab('general');
      // Safety hack: Force unlock body after animation to prevent freezing
      setTimeout(() => {
        document.body.style.removeProperty('pointer-events');
        document.body.style.removeProperty('overflow');
        document.body.removeAttribute('data-scroll-locked');
      }, 500);
    }
  };


  const rawSelectedProfessionals = watch('professionals') || [];
  const validProfessionalIds = new Set(professionals.map(p => p.id));
  const selectedProfessionals = professionalsLoading
    ? rawSelectedProfessionals
    : rawSelectedProfessionals.filter(id => validProfessionalIds.has(id));

  const handleSelectAll = (checked: boolean | string) => {
    if (checked) {
      setValue('professionals', professionals.map(p => p.id), { shouldDirty: true });
    } else {
      setValue('professionals', [], { shouldDirty: true });
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
      const cleanSelectedProfessionals = (data.professionals || []).filter(id => validProfessionalIds.has(id));

      // Clean durationPorProfesional to avoid saving undefined/empty values
      const cleanDurationPorProfesional = Object.entries(data.durationPorProfesional || {})
        .filter(([profId, val]) => validProfessionalIds.has(profId) && val !== undefined && val !== null && val !== "")
        .reduce((acc, [key, val]) => {
          acc[key] = val;
          return acc;
        }, {} as Record<string, any>);

      // Prepare the object to save, excluding UI-only fields
      const dataToSave = {
        name: data.name,
        description: data.description || '',
        price: Number(data.price),
        duration: Number(data.duration),
        category: data.category,
        include_vat: data.include_vat,
        visible_en_web: data.visible_en_web,
        payment_type: data.payment_type || 'no-payment',
        // Only save payment amount if type is online-deposit
        payment_amount_value: data.payment_type === 'online-deposit' ? (Number(data.payment_amount_value) || 0) : 0,
        payment_amount_type: data.payment_type === 'online-deposit' ? (data.payment_amount_type || '%') : '%',
        defaultCommission: {
          value: commissionValue,
          type: commissionType
        },
        professionals: cleanSelectedProfessionals,
        durationPorProfesional: cleanDurationPorProfesional,
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
        await syncProfessionals(service.id, cleanSelectedProfessionals);

        toast({ title: "Servicio actualizado con éxito" });
      } else {
        const newServiceRef = await addDoc(collection(db, 'servicios'), {
          ...dataToSave,
          active: true,
          order: 99,
          created_at: Timestamp.now(),
        });

        // Sync professionals for new service
        await syncProfessionals(newServiceRef.id, cleanSelectedProfessionals);

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
    console.log("Validation errors:", errors);
    if (errors.name || errors.price || errors.duration || errors.category || errors.commission_value) {
      setActiveTab('general');
    }
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
    } else if (Object.keys(errors).length > 0) {
      toast({
        variant: 'destructive',
        title: 'Error de validación',
        description: `Error detectado: ${Object.keys(errors).map(key => `${key}: ${(errors as any)[key]?.message}`).join(', ')}`,
      });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Cabecera Oficial VATOS ALFA */}
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-border/60 shrink-0">
            <div className="header-light-beam" />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scissors className="h-5 w-5 text-slate-300" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    {service ? 'Editar Servicio' : 'Nuevo Servicio'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    Configura los detalles, duración, comisión y profesionales del servicio.
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit, onErrors)} className="flex-grow flex flex-col overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-grow flex flex-col overflow-hidden">
                {/* Navegación de Pestañas Compacta */}
                <div className="px-4 sm:px-6 pt-3 shrink-0">
                  <TabsList className="grid grid-cols-3 p-1 bg-muted/30 rounded-xl border border-border/60 h-10 w-full">
                    <TabsTrigger 
                      value="general" 
                      className="rounded-lg text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all gap-1.5"
                    >
                      <Scissors className="h-3.5 w-3.5" />
                      <span className="truncate">Datos y Precios</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="professionals" 
                      className="rounded-lg text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all gap-1.5"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span className="truncate">Profesionales</span>
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                        {selectedProfessionals.length}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="payment-photo" 
                      className="rounded-lg text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all gap-1.5"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span className="truncate">Pago y Foto</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Contenido scrolleable optimizado */}
                <div className="flex-grow overflow-hidden p-4 sm:p-6 pt-3">
                  <ScrollArea className="h-full pr-2">
                    {/* TAB 1: DATOS Y PRECIOS */}
                    <TabsContent value="general" className="space-y-3.5 mt-0 pr-1">
                      {/* Nombre y Categoría en 2 columnas simétricas */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <FormField
                          control={control}
                          name="name"
                          render={({ field }) => (
                            <FormItem className="space-y-1.5">
                              <FormLabel className="text-xs font-semibold text-foreground">Nombre del servicio *</FormLabel>
                              <FormControl>
                                <Input placeholder="Ej. Corte Tradicional, Afeitado Clásico..." className="h-9 text-xs bg-background border-border/60" {...field} />
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={control}
                          name="category"
                          render={({ field }) => (
                            <FormItem className="space-y-1.5">
                              <FormLabel className="text-xs font-semibold text-foreground">Categoría *</FormLabel>
                              <div className="flex gap-2">
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="h-9 text-xs border-border/60 bg-background"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                    {categories.map(cat => (
                                      <SelectItem key={cat.id} value={cat.id} className="text-xs">{cat.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button variant="outline" size="sm" type="button" onClick={() => setIsCategoryModalOpen(true)} className="h-9 text-xs shrink-0 border-border/60 hover:bg-muted/20 gap-1 px-2.5">
                                  <Plus className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Categorías</span>
                                </Button>
                              </div>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Precio, Duración y Comisión en 3 columnas en PC */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <FormField
                          control={control}
                          name="price"
                          render={({ field }) => (
                            <FormItem className="space-y-1.5">
                              <FormLabel className="text-xs font-semibold text-foreground">Precio ($ MXN) *</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.5" placeholder="0.00" className="h-9 text-xs bg-background border-border/60 font-medium" {...field} />
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={control}
                          name="duration"
                          render={({ field }) => (
                            <FormItem className="space-y-1.5">
                              <FormLabel className="text-xs font-semibold text-foreground">Duración estándar (min) *</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="30" className="h-9 text-xs bg-background border-border/60" {...field} />
                              </FormControl>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={control}
                          name="commission_value"
                          render={({ field }) => (
                            <FormItem className="space-y-1.5">
                              <FormLabel className="text-xs font-semibold text-foreground">Comisión por defecto *</FormLabel>
                              <div className="flex items-center gap-1.5">
                                <FormControl>
                                  <Input type="number" placeholder="50" className="h-9 text-xs bg-background border-border/60 flex-grow" {...field} />
                                </FormControl>
                                <Controller 
                                  name="commission_type" 
                                  control={control} 
                                  render={({ field: typeField }) => (
                                    <Select onValueChange={typeField.onChange} value={typeField.value || '%'}>
                                      <SelectTrigger className="w-[82px] h-9 text-xs border-border/60 px-2 shrink-0 font-medium"><SelectValue /></SelectTrigger>
                                      <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                        <SelectItem value="%" className="text-xs">% Porc.</SelectItem>
                                        <SelectItem value="$" className="text-xs">$ Fijo</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )} 
                                />
                              </div>
                              <FormMessage className="text-[11px]" />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Tarjeta de Reservas Online */}
                      <div 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none",
                          watch('visible_en_web') 
                            ? "border-blue-500/40 bg-blue-500/5 text-foreground shadow-xs" 
                            : "border-border/60 bg-muted/10 text-muted-foreground"
                        )}
                        onClick={() => setValue('visible_en_web', !watch('visible_en_web'), { shouldDirty: true })}
                      >
                        <div className="flex items-center gap-2.5">
                          <Globe className={cn("h-4 w-4 shrink-0", watch('visible_en_web') ? "text-blue-400" : "text-slate-400")} />
                          <div>
                            <p className="text-xs font-semibold text-foreground">Mostrar en sitio web para reservas online</p>
                            <p className="text-[11px] text-muted-foreground">Permite a los clientes seleccionar y apartar este servicio desde el catálogo web y app móvil.</p>
                          </div>
                        </div>
                        <Switch 
                          checked={watch('visible_en_web')} 
                          onCheckedChange={(val) => setValue('visible_en_web', val, { shouldDirty: true })} 
                          onClick={(e) => e.stopPropagation()} 
                          className="scale-90"
                        />
                      </div>

                      {/* Descripción */}
                      <FormField
                        control={control}
                        name="description"
                        render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <FormLabel className="text-xs font-semibold text-foreground">Descripción del servicio (opcional)</FormLabel>
                              <span className="text-[10px] text-muted-foreground">{field.value?.length || 0}/200 caracteres</span>
                            </div>
                            <FormControl>
                              <Textarea 
                                placeholder="Describe el servicio, técnica, recomendaciones o qué incluye..." 
                                rows={3} 
                                maxLength={200} 
                                className="text-xs font-sans leading-relaxed text-foreground bg-background border-border/60 min-h-[64px]" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    {/* TAB 2: PROFESIONALES ASIGNADOS */}
                    <TabsContent value="professionals" className="space-y-3 mt-0 pr-1">
                      <div className="p-3 bg-muted/10 rounded-xl border border-border/60 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-blue-400 shrink-0" />
                          <div>
                            <h4 className="text-xs sm:text-sm font-bold text-foreground">Profesionales Asignados</h4>
                            <p className="text-[11px] text-muted-foreground">Selecciona qué barberos realizan este servicio y ajusta su duración individual.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-[11px] font-medium">
                            {selectedProfessionals.length} de {professionals.length} asignados
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="h-7 text-[11px] border-border/60 text-foreground hover:bg-muted/20 gap-1.5 px-2.5"
                            onClick={() => handleSelectAll(selectedProfessionals.length !== professionals.length)}
                          >
                            <Check className={cn("h-3 w-3", selectedProfessionals.length === professionals.length ? "text-blue-400" : "text-slate-400")} />
                            {selectedProfessionals.length === professionals.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          </Button>
                        </div>
                      </div>

                      <Controller
                        name="professionals"
                        control={control}
                        render={({ field }) => (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                            {professionals.map(prof => {
                              const isChecked = field.value?.includes(prof.id);
                              return (
                                <div
                                  key={prof.id}
                                  className={cn(
                                    "flex flex-col justify-between p-2.5 rounded-xl border transition-all text-xs select-none",
                                    isChecked
                                      ? "border-blue-500/40 bg-blue-500/5 text-foreground shadow-xs"
                                      : "border-border/60 bg-muted/10 text-muted-foreground hover:border-border/80"
                                  )}
                                >
                                  <div 
                                    className="flex items-center space-x-2.5 cursor-pointer"
                                    onClick={() => {
                                      const currentValue = field.value || [];
                                      const newValue = isChecked
                                        ? currentValue.filter((id: string) => id !== prof.id)
                                        : [...currentValue, prof.id];
                                      field.onChange(newValue);
                                      if (isChecked) {
                                        const currentDurations = { ...watch('durationPorProfesional') };
                                        delete currentDurations[prof.id];
                                        setValue('durationPorProfesional', currentDurations);
                                      }
                                    }}
                                  >
                                    <Checkbox
                                      id={prof.id}
                                      checked={isChecked}
                                      onCheckedChange={(checked) => {
                                        const currentValue = field.value || [];
                                        const newValue = checked
                                          ? [...currentValue, prof.id]
                                          : currentValue.filter((id: string) => id !== prof.id);
                                        field.onChange(newValue);
                                        if (!checked) {
                                          const currentDurations = { ...watch('durationPorProfesional') };
                                          delete currentDurations[prof.id];
                                          setValue('durationPorProfesional', currentDurations);
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <Label htmlFor={prof.id} className="text-xs font-semibold cursor-pointer truncate text-foreground">
                                      {prof.name}
                                    </Label>
                                  </div>

                                  {isChecked && (
                                    <div className="flex items-center justify-between pl-6 mt-2 pt-1.5 border-t border-border/40">
                                      <span className="text-[11px] text-muted-foreground">Duración en cabina:</span>
                                      <div className="flex items-center gap-1">
                                        <Controller
                                          name={`durationPorProfesional.${prof.id}`}
                                          control={control}
                                          render={({ field: durField }) => (
                                            <Input
                                              type="number"
                                              placeholder={watch('duration') ? watch('duration').toString() : '30'}
                                              className="h-6.5 text-xs w-16 text-center bg-background border-border/60 font-medium px-1"
                                              value={durField.value === undefined || durField.value === null ? '' : durField.value}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                durField.onChange(val === '' ? '' : Number(val));
                                              }}
                                            />
                                          )}
                                        />
                                        <span className="text-[11px] text-muted-foreground">min</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      />
                    </TabsContent>

                    {/* TAB 3: PAGO EN LÍNEA Y FOTO */}
                    <TabsContent value="payment-photo" className="space-y-4 mt-0 pr-1">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Política de Pago en Línea */}
                        <div className="rounded-xl border border-border/60 bg-card/60 p-3.5 sm:p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-blue-400 shrink-0" />
                              <h4 className="text-xs sm:text-sm font-bold text-foreground">Política de Pago en Línea</h4>
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className="text-slate-400 hover:text-white transition-colors p-1">
                                  <HelpCircle className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3 text-xs border-2 border-blue-500 rounded-xl bg-card shadow-xl">
                                Define si el cliente debe abonar un anticipo de garantía al agendar por la web, liquidar el total o pagar directo en el local.
                              </PopoverContent>
                            </Popover>
                          </div>

                          <Controller
                            name="payment_type"
                            control={control}
                            render={({ field }) => (
                              <RadioGroup onValueChange={field.onChange} value={field.value} className="space-y-2">
                                {/* Opción 1: Sin cobro */}
                                <div className={cn(
                                  "flex items-start space-x-2.5 rounded-lg border p-2.5 transition-colors cursor-pointer select-none",
                                  field.value === 'no-payment' ? "border-blue-500/50 bg-blue-500/5" : "border-border/60 hover:bg-muted/10"
                                )}>
                                  <RadioGroupItem value="no-payment" id="no-payment" className="mt-0.5" />
                                  <div className="grid gap-0.5 leading-none">
                                    <Label htmlFor="no-payment" className="text-xs font-semibold cursor-pointer text-foreground">Sin cobro anticipado</Label>
                                    <p className="text-[11px] text-muted-foreground">El cliente aparta gratis y paga el total al presentarse en sucursal.</p>
                                  </div>
                                </div>

                                {/* Opción 2: Anticipo */}
                                <div className={cn(
                                  "flex items-start space-x-2.5 rounded-lg border p-2.5 transition-colors cursor-pointer select-none",
                                  field.value === 'online-deposit' ? "border-blue-500/50 bg-blue-500/5" : "border-border/60 hover:bg-muted/10"
                                )}>
                                  <RadioGroupItem value="online-deposit" id="online-deposit" className="mt-0.5" />
                                  <div className="grid gap-1 leading-none w-full">
                                    <Label htmlFor="online-deposit" className="text-xs font-semibold cursor-pointer text-foreground">Abono en línea (Anticipo de Garantía)</Label>
                                    <p className="text-[11px] text-muted-foreground">Paga un anticipo para apartar su lugar y liquida el resto en el local.</p>
                                    {field.value === 'online-deposit' && (
                                      <div className="pt-2">
                                        <Label className="text-[11px] font-medium text-foreground mb-1 block">Monto o porcentaje del anticipo</Label>
                                        <div className="flex gap-2">
                                          <div className="flex-grow">
                                            <Controller
                                              control={control}
                                              name="payment_amount_value"
                                              render={({ field: subField }) => (
                                                <Input type="number" placeholder="50" className="h-8 text-xs bg-background border-border/60 font-medium" {...subField} />
                                              )}
                                            />
                                          </div>
                                          <div className="w-[80px]">
                                            <Controller
                                              control={control}
                                              name="payment_amount_type"
                                              render={({ field: subType }) => (
                                                <Select onValueChange={subType.onChange} value={subType.value || '%'}>
                                                  <SelectTrigger className="h-8 text-xs border-border/60 font-medium px-2"><SelectValue /></SelectTrigger>
                                                  <SelectContent className="border-2 border-blue-500 rounded-xl">
                                                    <SelectItem value="%" className="text-xs">% Porc.</SelectItem>
                                                    <SelectItem value="$" className="text-xs">$ Fijo</SelectItem>
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

                                {/* Opción 3: Pago completo */}
                                <div className={cn(
                                  "flex items-start space-x-2.5 rounded-lg border p-2.5 transition-colors cursor-pointer select-none",
                                  field.value === 'full-payment' ? "border-blue-500/50 bg-blue-500/5" : "border-border/60 hover:bg-muted/10"
                                )}>
                                  <RadioGroupItem value="full-payment" id="full-payment" className="mt-0.5" />
                                  <div className="grid gap-0.5 leading-none">
                                    <Label htmlFor="full-payment" className="text-xs font-semibold cursor-pointer text-foreground">Pago completo en línea (100%)</Label>
                                    <p className="text-[11px] text-muted-foreground">El cliente liquida el valor total del servicio al reservar en la web.</p>
                                  </div>
                                </div>
                              </RadioGroup>
                            )}
                          />
                        </div>

                        {/* Fotografía del Servicio */}
                        <div className="rounded-xl border border-border/60 bg-card/60 p-3.5 sm:p-4 space-y-3 flex flex-col">
                          <div className="flex items-center gap-2">
                            <Camera className="h-4 w-4 text-blue-400 shrink-0" />
                            <div>
                              <h4 className="text-xs sm:text-sm font-bold text-foreground">Fotografía del Servicio</h4>
                              <p className="text-[11px] text-muted-foreground">Imagen cuadrada de mínimo 200x200px (máx. 3MB).</p>
                            </div>
                          </div>
                          <div className="flex-grow flex items-center justify-center pt-1">
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
                        </div>
                      </div>
                    </TabsContent>
                  </ScrollArea>
                </div>
              </Tabs>

              {/* Footer */}
              <div className="p-3 sm:p-4 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/20 shrink-0">
                <Button variant="ghost" size="sm" type="button" onClick={() => handleOpenChange(false)} className="text-xs border-border/60">
                  Cancelar
                </Button>
                <Button variant="alfa" size="sm" type="submit" disabled={isSubmitting} className="text-xs px-5">
                  {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {service ? 'Guardar Cambios' : 'Crear Servicio'}
                </Button>
              </div>
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

