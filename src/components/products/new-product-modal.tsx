
'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Loader2 } from 'lucide-react';
import Link from 'next/link';

const newProductSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido.'),
  barcode: z.string().optional(),
  brand: z.string().min(1, 'La marca es requerida.'),
  category: z.string().min(1, 'La categoría es requerida.'),
  presentation: z.string().min(1, 'El formato es requerido.'),
  public_price: z.number().min(0, 'El precio debe ser positivo.'),
  stock: z.number().min(0, 'El stock debe ser positivo.').default(0),
  purchase_cost: z.number().optional(),
  internal_price: z.number().optional(),
  commission_value: z.number().optional(),
  commission_type: z.enum(['%', '$']).default('%'),
  includes_vat: z.boolean().default(false),
  description: z.string().optional(),
  stock_alarm_threshold: z.number().optional(),
  notification_email: z.string().email('Email inválido').optional().or(z.literal('')),
});

type NewProductFormData = z.infer<typeof newProductSchema>;

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewProductModal({ isOpen, onClose }: NewProductModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { control, handleSubmit, register, formState: { errors } } = useForm<NewProductFormData>({
    resolver: zodResolver(newProductSchema),
    defaultValues: {
      stock: 0,
      includes_vat: false,
      commission_type: '%'
    }
  });

  const onSubmit = async (data: NewProductFormData) => {
    setIsSubmitting(true);
    console.log("New product data:", data);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    toast({
      title: "Producto agregado con éxito",
    });
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
          <ScrollArea className="flex-grow pr-6 pl-1 -ml-1">
            <div className="space-y-6">
              {/* Información Básica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input id="name" placeholder="Indica el nombre del producto" {...register('name')} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="barcode">Código de barras</Label>
                  <Input id="barcode" placeholder="Indica el código del producto" {...register('barcode')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brand">Marca *</Label>
                  <Select name="brand" onValueChange={(value) => control._form.setValue('brand', value)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona una marca" /></SelectTrigger>
                    <SelectContent><SelectItem value="vatos-alfa">VATOS ALFA</SelectItem></SelectContent>
                  </Select>
                  <Link href="#" className="text-xs text-primary hover:underline">+ Nueva marca</Link>
                  {errors.brand && <p className="text-sm text-destructive">{errors.brand.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="category">Categoría *</Label>
                  <Select name="category" onValueChange={(value) => control._form.setValue('category', value)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                    <SelectContent><SelectItem value="facial">Facial</SelectItem><SelectItem value="capilar">Capilar</SelectItem></SelectContent>
                  </Select>
                   <Link href="#" className="text-xs text-primary hover:underline">+ Nueva categoría</Link>
                   {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="presentation">Formato/Presentación *</Label>
                   <Select name="presentation" onValueChange={(value) => control._form.setValue('presentation', value)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona un formato" /></SelectTrigger>
                    <SelectContent><SelectItem value="30ml">30 ml</SelectItem><SelectItem value="50ml">50 ml</SelectItem></SelectContent>
                  </Select>
                  <Link href="#" className="text-xs text-primary hover:underline">+ Nuevo formato</Link>
                  {errors.presentation && <p className="text-sm text-destructive">{errors.presentation.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="public_price">Precio de venta al público *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input id="public_price" type="number" placeholder="0" className="pl-6" {...register('public_price', { valueAsNumber: true })}/>
                  </div>
                  {errors.public_price && <p className="text-sm text-destructive">{errors.public_price.message}</p>}
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="stock">Cantidad en stock *</Label>
                  <Input id="stock" type="number" placeholder="0" {...register('stock', { valueAsNumber: true })} />
                  {errors.stock && <p className="text-sm text-destructive">{errors.stock.message}</p>}
                </div>
              </div>

              {/* Opciones Avanzadas */}
              <div className="space-y-4 pt-6 border-t">
                 <h3 className="text-lg font-semibold">Opciones avanzadas</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="purchase_cost">Costo de compra</Label>
                      <Input id="purchase_cost" type="number" placeholder="$ 0" {...register('purchase_cost', { valueAsNumber: true })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="internal_price">Precio de venta interna</Label>
                      <Input id="internal_price" type="number" placeholder="$ 0" {...register('internal_price', { valueAsNumber: true })} />
                    </div>
                 </div>
                 <div className="space-y-1">
                    <Label>Comisión de venta</Label>
                    <div className="flex gap-2">
                      <Input type="number" placeholder="0" className="flex-grow" {...register('commission_value', { valueAsNumber: true })} />
                       <Controller
                          name="commission_type"
                          control={control}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="%">%</SelectItem>
                                    <SelectItem value="$">$</SelectItem>
                                </SelectContent>
                            </Select>
                          )}
                        />
                    </div>
                 </div>
                 <div className="flex items-center space-x-2 pt-2">
                    <Controller
                        name="includes_vat"
                        control={control}
                        render={({ field }) => (
                            <Switch id="includes_vat" checked={field.value} onCheckedChange={field.onChange} />
                        )}
                    />
                    <Label htmlFor="includes_vat">Precio incluye IVA en comprobante de caja</Label>
                 </div>
                 <div className="space-y-1">
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea id="description" placeholder="Describe el producto..." {...register('description')} />
                 </div>
              </div>

              {/* Alarmas de Stock */}
              <div className="space-y-4 pt-6 border-t">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>¿Para qué sirven las alarmas de stock?</AlertTitle>
                  <AlertDescription>
                    Las alarmas de stock te ayudan a mantener un inventario saludable. Cuando el stock de un producto llegue al mínimo que definas, te enviaremos una notificación para que no te quedes sin unidades.
                  </AlertDescription>
                </Alert>
                <h3 className="text-lg font-semibold">Alarma de stock</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="stock_alarm_threshold">Stock en locales</Label>
                        <Input id="stock_alarm_threshold" type="number" placeholder="Ej: 5" {...register('stock_alarm_threshold', { valueAsNumber: true })}/>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="notification_email">Email para notificaciones</Label>
                        <Input id="notification_email" type="email" placeholder="correo@ejemplo.com" {...register('notification_email')} />
                        {errors.notification_email && <p className="text-sm text-destructive">{errors.notification_email.message}</p>}
                    </div>
                </div>
              </div>

            </div>
          </ScrollArea>
          <DialogFooter className="pt-6 border-t mt-4 flex-shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
