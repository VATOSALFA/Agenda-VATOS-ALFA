'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller, useFieldArray, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Info, Loader2, Plus, X, Package, BadgePercent, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Product, ProductCategory, ProductBrand, ProductPresentation } from '@/lib/types';
import { addDoc, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase-client';
import { BrandModal } from './brand-modal';
import { CategoryModal } from './category-modal';
import { PresentationModal } from './presentation-modal';
import { ImageUploader } from '../shared/image-uploader';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { sendStockAlert } from '@/ai/flows/send-stock-alert-flow';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';

const requiredNumberSchema = z.coerce.string().min(1, 'Este campo es requerido.').pipe(z.coerce.number({ invalid_type_error: 'Debe ser un número válido.' }).min(0, 'Debe ser un número positivo.'));

const newProductSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido.'),
  barcode: z.string().optional(),
  brand_id: z.string().min(1, 'La marca es requerida.'),
  category_id: z.string().min(1, 'La categoría es requerida.'),
  presentation_id: z.string().min(1, 'El formato es requerido.'),
  public_price: requiredNumberSchema,
  stock: requiredNumberSchema,
  purchase_cost: requiredNumberSchema,
  internal_price: z.coerce.number().optional().nullable(),
  commission_value: requiredNumberSchema,
  commission_type: z.enum(['%', '$']).default('%'),
  includes_vat: z.boolean().default(false),
  visible_en_web: z.boolean().default(true),
  description: z.string().optional(),
  stock_alarm_threshold: z.coerce.number().optional().nullable(),
  notification_email: z.string().email('Email inválido').optional().or(z.literal('')),

  images: z.array(z.object({ value: z.string() })).optional().default([]),
  payment_type: z.string().optional(),
  payment_amount_value: z.coerce.string().optional(),
  payment_amount_type: z.enum(['%', '$']).default('%'),
});

type NewProductFormData = z.infer<typeof newProductSchema>;

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  product: Product | null;
}

export function NewProductModal({ isOpen, onClose, onDataSaved, product }: NewProductModalProps) {
  const { toast } = useToast();
  const { db, user } = useAuth(); // Get user for audit
  const { selectedLocalId } = useLocal(); // Get active local for context
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isPresentationModalOpen, setIsPresentationModalOpen] = useState(false);
  const [queryKey, setQueryKey] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'finanzas' | 'online'>('general');

  const handleCancel = async () => {
    // Clean up any images uploaded during this session but not saved
    if (uploadedImages.length > 0) {
      await Promise.all(uploadedImages.map(async (url) => {
        try {
          const imageRef = ref(storage, url);
          await deleteObject(imageRef);
        } catch (error) {
          console.warn("Error cleaning up image:", error);
        }
      }));
    }
    setUploadedImages([]);
    onClose();
  };

  const { data: categories } = useFirestoreQuery<ProductCategory>('categorias_productos', queryKey);
  const { data: brands } = useFirestoreQuery<ProductBrand>('marcas_productos', queryKey);
  const { data: presentations } = useFirestoreQuery<ProductPresentation>('formatos_productos', queryKey);
  const { data: locales } = useFirestoreQuery<any>('locales', queryKey);

  const form = useForm<NewProductFormData>({
    resolver: zodResolver(newProductSchema),
    defaultValues: {
      stock: 0,
      includes_vat: false,
      visible_en_web: true,
      commission_type: '%',

      images: [],
      payment_type: 'no-payment',
    }
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "images"
  });

  useEffect(() => {
    if (product) {
      form.reset({
        ...product,
        visible_en_web: product.visible_en_web ?? true,
        public_price: product.public_price || 0,
        stock: product.stock || 0,
        commission_value: product.commission?.value,
        commission_type: product.commission?.type,

        images: Array.isArray(product.images) ? product.images.map((imgUrl: string) => ({ value: imgUrl })) : [],
        payment_type: product.payment_type || 'no-payment',
        payment_amount_value: (product.payment_amount_value ?? '') as any,
        payment_amount_type: product.payment_amount_type || '%',
      });
    } else {
      form.reset({
        nombre: '', barcode: '', brand_id: '', category_id: '', presentation_id: '',
        public_price: '' as any, stock: '' as any, purchase_cost: '' as any, internal_price: null, commission_value: '' as any,
        commission_type: '%', includes_vat: false, visible_en_web: true, description: '', stock_alarm_threshold: null, notification_email: '',

        images: [], payment_type: 'no-payment', payment_amount_value: '' as any, payment_amount_type: '%'
      });
    }
  }, [product, form, isOpen]);


  const handleSubModalDataSaved = (entityType: 'category' | 'brand' | 'presentation', newEntityId: string) => {
    setQueryKey(prev => prev + 1); // Refetch entities
    form.setValue(`${entityType}_id` as any, newEntityId, { shouldValidate: true });
  }

  const onSubmit = async (data: NewProductFormData) => {
    if (!db) {
      toast({ variant: 'destructive', title: 'Error', description: 'La base de datos no está disponible.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { commission_value, commission_type, ...restOfData } = data;

      const parseOptionalNumber = (value: any): number | null => {
        if (value === '' || value === null || value === undefined || isNaN(Number(value))) return null;
        return Number(value);
      };

      const dataToSave: Partial<Product> = {
        ...restOfData,
        visible_en_web: restOfData.visible_en_web,
        public_price: Number(restOfData.public_price),
        stock: Number(restOfData.stock),
        purchase_cost: parseOptionalNumber(restOfData.purchase_cost) ?? undefined,
        internal_price: parseOptionalNumber(restOfData.internal_price) ?? undefined,
        stock_alarm_threshold: parseOptionalNumber(restOfData.stock_alarm_threshold) ?? undefined,
        commission: {
          value: parseOptionalNumber(commission_value) ?? 0,
          type: commission_type || '%'
        },
        payment_type: (data.payment_type as any) || 'no-payment',
        payment_amount_value: Number(data.payment_amount_value) || 0,
        payment_amount_type: data.payment_amount_type || '%',
        images: data.images?.map((img: any) => img.value).filter(Boolean) || [],
        updated_at: Timestamp.now(),
      };

      if (product) {
        // Stock Movement Tracking Logic
        const oldStock = product.stock || 0;
        const newStock = Number(restOfData.stock);

        if (oldStock !== newStock) {
          const activeLocalId = selectedLocalId || 'unknown_local';

          // Find local name
          let localName = 'Local no especificado';
          if (selectedLocalId) {
            const foundLocal = locales?.find((l: any) => l.id === selectedLocalId);
            if (foundLocal) localName = foundLocal.name;
          } else if (activeLocalId === 'unknown_local') {
            localName = 'Inventario Global / Admin';
          }

          try {
            await addDoc(collection(db, 'movimientos_inventario'), {
              date: Timestamp.now(),
              local_id: activeLocalId,
              product_id: product.id,
              presentation_id: product.presentation_id || 'default',
              from: oldStock,
              to: newStock,
              cause: 'Manual Adjustment (Edit)',
              staff_id: user?.uid || 'unknown',
              staff_name: user?.displayName || user?.email || 'Desconocido',
              comment: 'Ajuste realizado desde "Editar Producto"',
              product_name: product.nombre,
              local_name: localName,
              concepto: 'Cambio de stock - Edición',
            });
            console.log("Stock movement recorded with local:", localName);
          } catch (err) {
            console.error("Failed to record stock movement:", err);
            // Non-blocking error
          }
        }

        const productRef = doc(db, 'productos', product.id);
        await updateDoc(productRef, dataToSave as any);
        toast({ title: "Producto actualizado con éxito" });
      } else {
        await addDoc(collection(db, 'productos'), {
          ...dataToSave,
          active: true,
          order: 99,
          created_at: Timestamp.now(),
        });
        toast({ title: "Producto agregado con éxito" });
      }

      const currentStock = Number(data.stock);
      const alarmThreshold = parseOptionalNumber(data.stock_alarm_threshold);
      if (alarmThreshold !== null && currentStock <= alarmThreshold && data.notification_email) {
        await sendStockAlert({
          productName: data.nombre,
          currentStock: currentStock,
          recipientEmail: data.notification_email,
        });
        toast({
          variant: "destructive",
          title: "Alerta de stock bajo",
          description: `El producto ${data.nombre} tiene solo ${data.stock} unidades.`,
        });
      }

      setUploadedImages([]);
      onDataSaved();
      onClose();
    } catch (error: any) {
      console.error("Error saving product: ", error);
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: `No se pudo guardar el producto. Verifique que todos los campos numéricos tengan un valor.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onErrors = (errors: FieldErrors<NewProductFormData>) => {
    const missingFields: string[] = [];
    let targetTab: 'general' | 'finanzas' | 'online' = 'general';

    if (errors.nombre) missingFields.push('Nombre');
    if (errors.brand_id) missingFields.push('Marca');
    if (errors.category_id) missingFields.push('Categoría');
    if (errors.presentation_id) missingFields.push('Formato/Presentación');
    if (errors.public_price) missingFields.push('Precio de venta al público');
    if (errors.stock) missingFields.push('Cantidad en stock');

    if (errors.purchase_cost || errors.commission_value) {
      if (errors.purchase_cost) missingFields.push('Costo de compra');
      if (errors.commission_value) missingFields.push('Comisión de venta');
      if (missingFields.length <= 2) {
        targetTab = 'finanzas';
      }
    }

    if (errors.notification_email) {
      missingFields.push('Email de notificación');
      if (missingFields.length === 1) {
        targetTab = 'online';
      }
    }

    setActiveTab(targetTab);

    if (missingFields.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Campos requeridos faltantes',
        description: `Por favor completa: ${missingFields.join(', ')}`,
      });
    }
  };

  const publicPrice = Number(form.watch('public_price') || 0);
  const purchaseCost = Number(form.watch('purchase_cost') || 0);
  const profit = publicPrice > 0 && purchaseCost > 0 ? publicPrice - purchaseCost : null;
  const marginPercent = profit !== null && publicPrice > 0 ? (profit / publicPrice) * 100 : null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent hideCloseButton={true} className="max-w-2xl sm:max-w-3xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
          {/* Official Vatos Alfa Header */}
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-blue-900/40 flex-shrink-0">
            <div className="header-light-beam" />
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-slate-300" />
                <div>
                  <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                    {product ? 'Editar Producto' : 'Nuevo Producto'}
                  </DialogTitle>
                  <p className="text-xs text-slate-300">
                    {product ? 'Actualiza los datos del producto seleccionado' : 'Ingresa la información para dar de alta un producto'}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-border/60 px-4 sm:px-6 pt-2 bg-muted/20 flex-shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer rounded-t-lg",
                activeTab === 'general'
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/60 dark:bg-blue-950/30"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-muted/30"
              )}
            >
              <Package className={cn("h-3.5 w-3.5", activeTab === 'general' ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('finanzas')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer rounded-t-lg",
                activeTab === 'finanzas'
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/60 dark:bg-blue-950/30"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-muted/30"
              )}
            >
              <BadgePercent className={cn("h-3.5 w-3.5", activeTab === 'finanzas' ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
              Costos y Comisiones
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer rounded-t-lg",
                activeTab === 'online'
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/60 dark:bg-blue-950/30"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-muted/30"
              )}
            >
              <Globe className={cn("h-3.5 w-3.5", activeTab === 'online' ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
              Venta Online y Alarmas
            </button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onErrors)} className="flex-grow flex flex-col overflow-hidden">
              <ScrollArea className="flex-grow p-4 sm:p-5 overflow-y-auto">
                {/* TAB 1: GENERAL */}
                <div className={activeTab === 'general' ? 'block' : 'hidden'}>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                    {/* Left Column: Compact Image & Web Switch (4 cols on sm) */}
                    <div className="sm:col-span-4 flex flex-col items-center gap-3 bg-muted/10 p-3.5 rounded-xl border border-border/60">
                      <div className="w-full text-center">
                        <Label className="text-xs font-semibold text-foreground">Imagen del Producto</Label>
                        <p className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG o WebP</p>
                      </div>
                      
                      <div className="w-32 h-32 sm:w-36 sm:h-36 relative rounded-xl overflow-hidden flex items-center justify-center">
                        <ImageUploader
                          folder="productos"
                          currentImageUrl={fields[0]?.value}
                          onUpload={(url) => {
                            setUploadedImages(prev => [...prev, url]);
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

                      <FormField
                        name="visible_en_web"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between w-full pt-2 border-t border-border/60 space-y-0">
                            <FormLabel htmlFor="visible_en_web" className="text-xs font-normal cursor-pointer">
                              Visible en web
                            </FormLabel>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} id="visible_en_web" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Right Column: Main Fields (8 cols on sm) */}
                    <div className="sm:col-span-8 space-y-3">
                      <FormField name="nombre" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Nombre del producto *</FormLabel>
                          <FormControl><Input placeholder="Indica el nombre del producto" className="rounded-xl h-9 text-xs" {...field} /></FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )} />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField name="barcode" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Código de barras</FormLabel>
                            <FormControl><Input placeholder="Indica el código..." className="rounded-xl h-9 text-xs" {...field} /></FormControl>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                        <FormField name="public_price" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Precio al público *</FormLabel>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <FormControl><Input type="number" placeholder="0" className="pl-6 rounded-xl h-9 text-xs font-bold" {...field} /></FormControl>
                            </div>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField name="brand_id" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Marca *</FormLabel>
                            <div className="flex gap-1.5">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger className="rounded-xl h-9 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                  {brands.map((b: any) => <SelectItem key={b.id} value={b.id} className="rounded-lg text-xs">{b.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-xl border-border/60 hover:bg-white/5 text-slate-300 flex-shrink-0" onClick={() => setIsBrandModalOpen(true)} title="Nueva marca">
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                        <FormField name="category_id" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Categoría *</FormLabel>
                            <div className="flex gap-1.5">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger className="rounded-xl h-9 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                  {categories.map((c: any) => <SelectItem key={c.id} value={c.id} className="rounded-lg text-xs">{c.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-xl border-border/60 hover:bg-white/5 text-slate-300 flex-shrink-0" onClick={() => setIsCategoryModalOpen(true)} title="Nueva categoría">
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField name="presentation_id" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Formato / Presentación *</FormLabel>
                            <div className="flex gap-1.5">
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger className="rounded-xl h-9 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                  {presentations.map((p: any) => <SelectItem key={p.id} value={p.id} className="rounded-lg text-xs">{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-xl border-border/60 hover:bg-white/5 text-slate-300 flex-shrink-0" onClick={() => setIsPresentationModalOpen(true)} title="Nuevo formato">
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                        <FormField name="stock" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Cantidad en stock *</FormLabel>
                            <FormControl><Input type="number" placeholder="0" className="rounded-xl h-9 text-xs" {...field} /></FormControl>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                      </div>

                      <FormField name="description" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Descripción (Opcional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe brevemente el producto o modo de uso..." 
                              className="rounded-xl text-xs resize-none" 
                              rows={2} 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </div>

                {/* TAB 2: COSTOS Y COMISIONES */}
                <div className={activeTab === 'finanzas' ? 'block' : 'hidden'}>
                  <div className="space-y-4 max-w-xl mx-auto py-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="purchase_cost" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Costo de compra *</FormLabel>
                          <p className="text-[11px] text-muted-foreground">Lo que pagas al proveedor</p>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                            <FormControl><Input type="number" placeholder="0" className="pl-6 rounded-xl h-9 text-xs" {...field} value={field.value ?? ''} /></FormControl>
                          </div>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )} />

                      <FormField name="internal_price" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Precio de venta interna</FormLabel>
                          <p className="text-[11px] text-muted-foreground">Precio especial para colaboradores</p>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                            <FormControl><Input type="number" placeholder="0" className="pl-6 rounded-xl h-9 text-xs" {...field} value={field.value ?? ''} /></FormControl>
                          </div>
                          <FormMessage className="text-[11px]" />
                        </FormItem>
                      )} />
                    </div>

                    <FormField name="commission_value" control={form.control} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">Comisión de venta al barbero/vendedor *</FormLabel>
                        <p className="text-[11px] text-muted-foreground">Comisión otorgada a quien realice la venta del producto</p>
                        <div className="flex gap-2">
                          <FormControl><Input type="number" placeholder="0" className="flex-grow rounded-xl h-9 text-xs" {...field} value={field.value ?? ''} /></FormControl>
                          <Controller
                            name="commission_type"
                            control={form.control}
                            render={({ field: selectField }) => (
                              <Select onValueChange={selectField.onChange} value={selectField.value}>
                                <SelectTrigger className="w-[90px] rounded-xl h-9 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                  <SelectItem value="%" className="rounded-lg text-xs">% (Porc.)</SelectItem>
                                  <SelectItem value="$" className="rounded-lg text-xs">$ (Fijo)</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <FormMessage className="text-[11px]" />
                      </FormItem>
                    )} />

                    {/* Real-time Profit & Margin Indicator */}
                    {profit !== null && marginPercent !== null && (
                      <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between text-xs mt-3">
                        <div>
                          <span className="text-muted-foreground">Ganancia bruta estimada:</span>
                          <strong className="ml-1.5 text-foreground">${profit.toFixed(2)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Margen de ganancia:</span>
                          <strong className="ml-1.5 text-foreground">{marginPercent.toFixed(1)}%</strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* TAB 3: VENTA ONLINE Y ALARMAS */}
                <div className={activeTab === 'online' ? 'block' : 'hidden'}>
                  <div className="space-y-4 max-w-xl mx-auto py-1">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Configuración de Cobro Online</Label>
                      <Controller
                        name="payment_type"
                        control={form.control}
                        render={({ field }) => (
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div
                              className={cn(
                                "flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer",
                                field.value === 'no-payment'
                                  ? "border-blue-500 bg-blue-500/10 text-white"
                                  : "border-border/60 hover:bg-muted/20"
                              )}
                              onClick={() => field.onChange('no-payment')}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold">Solo en local</span>
                                <RadioGroupItem value="no-payment" id="no-payment" />
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-tight">No se cobra online, solo se exhibe.</p>
                            </div>

                            <div
                              className={cn(
                                "flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer",
                                field.value === 'full-payment'
                                  ? "border-blue-500 bg-blue-500/10 text-white"
                                  : "border-border/60 hover:bg-muted/20"
                              )}
                              onClick={() => field.onChange('full-payment')}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold">Pago total</span>
                                <RadioGroupItem value="full-payment" id="full-payment" />
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-tight">Cobro del 100% al comprar en la web.</p>
                            </div>

                            <div
                              className={cn(
                                "flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer",
                                field.value === 'deposit'
                                  ? "border-blue-500 bg-blue-500/10 text-white"
                                  : "border-border/60 hover:bg-muted/20"
                              )}
                              onClick={() => field.onChange('deposit')}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold">Anticipo / Abono</span>
                                <RadioGroupItem value="deposit" id="deposit" />
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-tight">Se cobra un anticipo al agendar.</p>
                            </div>
                          </RadioGroup>
                        )}
                      />

                      {form.watch('payment_type') === 'deposit' && (
                        <div className="mt-2.5 p-3 rounded-xl border border-blue-500/40 bg-blue-500/5 flex items-center gap-2">
                          <div className="flex-1">
                            <Label className="text-[11px] mb-1 block">Monto del anticipo</Label>
                            <FormField
                              name="payment_amount_value"
                              control={form.control}
                              render={({ field }) => (
                                <FormControl>
                                  <Input type="number" placeholder="Ej: 50" className="rounded-xl h-8 text-xs" {...field} />
                                </FormControl>
                              )}
                            />
                          </div>
                          <div className="w-24">
                            <Label className="text-[11px] mb-1 block">Tipo</Label>
                            <FormField
                              name="payment_amount_type"
                              control={form.control}
                              render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    <SelectItem value="%" className="text-xs">%</SelectItem>
                                    <SelectItem value="$" className="text-xs">$</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Alerta de Stock Mínimo */}
                    <div className="pt-3 border-t border-border/60 space-y-2">
                      <div>
                        <Label className="text-xs font-semibold">Alerta de Stock Mínimo</Label>
                        <p className="text-[11px] text-muted-foreground">Notificación por email cuando las existencias alcancen el umbral.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField name="stock_alarm_threshold" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[11px]">Unidades mínimas de aviso</FormLabel>
                            <FormControl><Input type="number" placeholder="Ej: 3" className="rounded-xl h-8 text-xs" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                        <FormField name="notification_email" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[11px]">Email para notificaciones</FormLabel>
                            <FormControl><Input type="email" placeholder="correo@ejemplo.com" className="rounded-xl h-8 text-xs" {...field} /></FormControl>
                            <FormMessage className="text-[11px]" />
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <DialogFooter className="p-4 sm:p-5 border-t border-border/60 flex-shrink-0 flex items-center justify-end gap-3 bg-muted/10">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCancel}
                  className="rounded-xl border-border/60 hover:bg-white/5 font-medium"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  variant="alfa"
                  className="rounded-xl font-bold shadow-md px-5"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {product ? 'Guardar Cambios' : 'Agregar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onDataSaved={(newId) => handleSubModalDataSaved('category', newId)}
      />
      <BrandModal
        isOpen={isBrandModalOpen}
        onClose={() => setIsBrandModalOpen(false)}
        onDataSaved={(newId) => handleSubModalDataSaved('brand', newId)}
      />
      <PresentationModal
        isOpen={isPresentationModalOpen}
        onClose={() => setIsPresentationModalOpen(false)}
        onDataSaved={(newId) => handleSubModalDataSaved('presentation', newId)}
      />
    </>
  );
}
