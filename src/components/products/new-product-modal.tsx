

'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Loader2, Plus } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Product, ProductCategory, ProductBrand, ProductPresentation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { BrandModal } from './brand-modal';
import { CategoryModal } from './category-modal';
import { PresentationModal } from './presentation-modal';
import { ImageUploader } from '../shared/image-uploader';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { sendStockAlert } from '@/ai/flows/send-stock-alert-flow';

const newProductSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido.'),
  barcode: z.string().optional(),
  brand_id: z.string().min(1, 'La marca es requerida.'),
  category_id: z.string().min(1, 'La categoría es requerida.'),
  presentation_id: z.string().min(1, 'El formato es requerido.'),
  public_price: z.coerce.number().min(0, 'El precio debe ser positivo.'),
  stock: z.coerce.number().min(0, 'El stock debe ser positivo.').default(0),
  purchase_cost: z.coerce.number().optional(),
  internal_price: z.coerce.number().optional(),
  commission_value: z.coerce.number().optional(),
  commission_type: z.enum(['%', '$']).default('%'),
  includes_vat: z.boolean().default(false),
  description: z.string().optional(),
  stock_alarm_threshold: z.coerce.number().optional(),
  notification_email: z.string().email('Email inválido').optional().or(z.literal('')),
  images: z.array(z.string()).optional().default([]),
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isPresentationModalOpen, setIsPresentationModalOpen] = useState(false);
  const [queryKey, setQueryKey] = useState(0);
  
  const { data: categories } = useFirestoreQuery<ProductCategory>('categorias_productos', queryKey);
  const { data: brands } = useFirestoreQuery<ProductBrand>('marcas_productos', queryKey);
  const { data: presentations } = useFirestoreQuery<ProductPresentation>('formatos_productos', queryKey);

  const form = useForm<NewProductFormData>({
    resolver: zodResolver(newProductSchema),
    defaultValues: product ? {
        ...product,
        commission_value: product.commission?.value,
        commission_type: product.commission?.type,
        images: product.images || []
    } : {
      stock: 0,
      includes_vat: false,
      commission_type: '%',
      images: []
    }
  });

   const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "images"
   });

  useEffect(() => {
    form.reset(product ? { 
        ...product,
        commission_value: product.commission?.value,
        commission_type: product.commission?.type,
        images: product.images || []
    } : {
        nombre: '', barcode: '', brand_id: '', category_id: '', presentation_id: '',
        public_price: 0, stock: 0, purchase_cost: 0, internal_price: 0, commission_value: 0,
        commission_type: '%', includes_vat: false, description: '', stock_alarm_threshold: 0, notification_email: '',
        images: []
    })
  }, [product, form]);

  const handleSubModalDataSaved = (entityType: 'category' | 'brand' | 'presentation', newEntityId: string) => {
    setQueryKey(prev => prev + 1); // Refetch entities
    form.setValue(`${entityType}_id` as any, newEntityId, { shouldValidate: true });
  }

  const onSubmit = async (data: NewProductFormData) => {
    setIsSubmitting(true);
    try {
        const dataToSave = {
            ...data,
            commission: {
                value: data.commission_value || 0,
                type: data.commission_type
            },
            created_at: product ? product.created_at : Timestamp.now(),
            updated_at: Timestamp.now(),
        };

        if (product) {
            const productRef = doc(db, 'productos', product.id);
            await updateDoc(productRef, dataToSave);
            toast({ title: "Producto actualizado con éxito" });
        } else {
            await addDoc(collection(db, 'productos'), dataToSave);
            toast({ title: "Producto agregado con éxito" });
        }

        // Check stock alarm after manual update
        if (data.stock_alarm_threshold && data.stock <= data.stock_alarm_threshold && data.notification_email) {
            await sendStockAlert({
                productName: data.nombre,
                currentStock: data.stock,
                recipientEmail: data.notification_email,
            });
            toast({ title: "Alerta de stock enviada", description: `Se notificó que el stock de ${data.nombre} es bajo.`});
        }
      
      onDataSaved();
      onClose();
    } catch (error) {
      console.error("Error saving product: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el producto.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
            <ScrollArea className="flex-grow pr-6 pl-1 -ml-1">
                <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField name="nombre" control={form.control} render={({ field }) => (<FormItem><FormLabel>Nombre *</FormLabel><FormControl><Input placeholder="Indica el nombre del producto" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField name="barcode" control={form.control} render={({ field }) => (<FormItem><FormLabel>Código de barras</FormLabel><FormControl><Input placeholder="Indica el código del producto" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField name="brand_id" control={form.control} render={({ field }) => (<FormItem><FormLabel>Marca *</FormLabel><div className="flex gap-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecciona una marca" /></SelectTrigger></FormControl><SelectContent>{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select><Button type="button" size="sm" variant="outline" onClick={() => setIsBrandModalOpen(true)}><Plus className="h-4 w-4"/></Button></div><FormMessage /></FormItem>)} />
                    <FormField name="category_id" control={form.control} render={({ field }) => (<FormItem><FormLabel>Categoría *</FormLabel><div className="flex gap-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger></FormControl><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><Button type="button" size="sm" variant="outline" onClick={() => setIsCategoryModalOpen(true)}><Plus className="h-4 w-4"/></Button></div><FormMessage /></FormItem>)} />
                    <FormField name="presentation_id" control={form.control} render={({ field }) => (<FormItem><FormLabel>Formato/Presentación *</FormLabel><div className="flex gap-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecciona un formato" /></SelectTrigger></FormControl><SelectContent>{presentations.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select><Button type="button" size="sm" variant="outline" onClick={() => setIsPresentationModalOpen(true)}><Plus className="h-4 w-4"/></Button></div><FormMessage /></FormItem>)} />
                    <FormField name="public_price" control={form.control} render={({ field }) => (<FormItem><FormLabel>Precio de venta al público *</FormLabel><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><FormControl><Input type="number" placeholder="0" className="pl-6" {...field} /></FormControl></div><FormMessage /></FormItem>)} />
                    <FormField name="stock" control={form.control} render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Cantidad en stock *</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Agregar imágenes</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            ¡Carga hasta 3 imágenes de tu servicio! Te recomendamos que tengan un tamaño mínimo de 200x200px y un peso máximo de 3MB.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[0, 1, 2].map(index => (
                                <ImageUploader
                                    key={index}
                                    folder="productos"
                                    currentImageUrl={form.getValues(`images.${index}`)}
                                    onUpload={(url) => form.setValue(`images.${index}`, url)}
                                    onRemove={() => form.setValue(`images.${index}`, '')}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4 pt-6 border-t"><h3 className="text-lg font-semibold">Opciones avanzadas</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField name="purchase_cost" control={form.control} render={({ field }) => (<FormItem><FormLabel>Costo de compra</FormLabel><FormControl><Input type="number" placeholder="$ 0" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField name="internal_price" control={form.control} render={({ field }) => (<FormItem><FormLabel>Precio de venta interna</FormLabel><FormControl><Input type="number" placeholder="$ 0" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <FormField name="commission_value" control={form.control} render={({ field }) => (<FormItem><FormLabel>Comisión de venta</FormLabel><div className="flex gap-2"><FormControl><Input type="number" placeholder="0" className="flex-grow" {...field} /></FormControl><Controller name="commission_type" control={form.control} render={({ field: selectField }) => (<Select onValueChange={selectField.onChange} value={selectField.value}><SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="%">%</SelectItem><SelectItem value="$">$</SelectItem></SelectContent></Select>)} /></div><FormMessage /></FormItem>)} />
                    <FormField name="includes_vat" control={form.control} render={({ field }) => (<FormItem className="flex items-center space-x-2 pt-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} id="includes_vat" /></FormControl><FormLabel htmlFor="includes_vat" className="!mt-0">Precio incluye IVA en comprobante de caja</FormLabel></FormItem>)} />
                    <FormField name="description" control={form.control} render={({ field }) => (<FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea placeholder="Describe el producto..." {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <div className="space-y-4 pt-6 border-t"><Alert><Info className="h-4 w-4" /><AlertTitle>¿Para qué sirven las alarmas de stock?</AlertTitle><AlertDescription>Las alarmas de stock te ayudan a mantener un inventario saludable. Cuando el stock de un producto llegue al mínimo que definas, te enviaremos una notificación para que no te quedes sin unidades.</AlertDescription></Alert><h3 className="text-lg font-semibold">Alarma de stock</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField name="stock_alarm_threshold" control={form.control} render={({ field }) => (<FormItem><FormLabel>Stock en locales</FormLabel><FormControl><Input type="number" placeholder="Ej: 5" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField name="notification_email" control={form.control} render={({ field }) => (<FormItem><FormLabel>Email para notificaciones</FormLabel><FormControl><Input type="email" placeholder="correo@ejemplo.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                </div>
                </div>
            </ScrollArea>
            <DialogFooter className="pt-6 border-t mt-4 flex-shrink-0">
                <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
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
