
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, increment, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { sendStockAlert } from '@/ai/flows/send-stock-alert-flow';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, X, Package } from 'lucide-react';
import type { Product, StockMovement } from '@/lib/types';

interface StockUpdateModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onStockUpdated: () => void;
}

const stockUpdateSchema = z.object({
  changeType: z.enum(['add', 'subtract']),
  quantity: z.coerce.number().min(1, 'La cantidad debe ser mayor a 0.'),
  comment: z.string().optional(),
});

type StockUpdateFormData = z.infer<typeof stockUpdateSchema>;

export function StockUpdateModal({ product, isOpen, onClose, onStockUpdated }: StockUpdateModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedLocalId } = useLocal();
  const { data: locales } = useFirestoreQuery<any>('locales');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<StockUpdateFormData>({
    resolver: zodResolver(stockUpdateSchema),
    defaultValues: {
      changeType: 'add',
      quantity: 1,
      comment: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        changeType: 'add',
        quantity: 1,
        comment: '',
      });
    }
  }, [isOpen, form]);

  const onSubmit = async (data: StockUpdateFormData) => {
    const activeLocalId = selectedLocalId || 'unknown_local';

    if (!selectedLocalId) {
      // Optional: Block if no local selected, or allow Global update. 
      // For now, allow but log as 'unknown' if that fits business logic, 
      // or block if strict. Given "Inventory" page might be global, we proceed with fallback.
      // But warning is good.
      console.warn("No local selected for stock update.");
    }

    setIsSubmitting(true);
    try {
      const productRef = doc(db, 'productos', product.id);
      const stockChange = data.changeType === 'add' ? data.quantity : -data.quantity;

      const currentStock = product.stock || 0;
      const newStock = currentStock + stockChange;

      if (newStock < 0) {
        toast({
          variant: 'destructive',
          title: 'Stock insuficiente',
          description: 'No puedes restar más unidades de las que hay en stock.',
        });
        setIsSubmitting(false);
        return;
      }

      await updateDoc(productRef, {
        stock: increment(stockChange),
      });

      // Registrar movimiento de stock
      const movement: Omit<StockMovement, 'id'> = {
        date: Timestamp.now(),
        local_id: activeLocalId,
        product_id: product.id,
        presentation_id: product.presentation_id || 'default',
        from: currentStock,
        to: newStock,
        cause: 'Manual Adjustment',
        staff_id: user?.uid || 'unknown',
        comment: data.comment || '',
      };


      let localName = 'Local no especificado';
      if (selectedLocalId) {
        const foundLocal = locales?.find((l: any) => l.id === selectedLocalId);
        if (foundLocal) localName = foundLocal.name;
      } else if (activeLocalId === 'unknown_local') {
        localName = 'Inventario Global / Admin';
      }

      await addDoc(collection(db, 'movimientos_inventario'), {
        ...movement,
        product_name: product.nombre,
        staff_name: user?.displayName || user?.email || 'Desconocido',
        local_name: localName,
        concepto: 'Cambio de stock',
      });


      if (product.stock_alarm_threshold && newStock <= product.stock_alarm_threshold && product.notification_email) {
        await sendStockAlert({
          productName: product.nombre,
          currentStock: newStock,
          recipientEmail: product.notification_email,
          productImage: product.images?.[0], // Pass the first image URL if available
        });
        toast({
          variant: "destructive",
          title: "Alerta de stock bajo",
          description: `El producto ${product.nombre} tiene solo ${newStock} unidades.`,
        });
      }


      toast({
        title: 'Stock actualizado',
        description: `El stock de ${product.nombre} ha sido actualizado a ${newStock}.`,
      });

      onStockUpdated();
      onClose();

    } catch (error) {
      console.error('Error updating stock:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el stock.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
        {/* Official Vatos Alfa Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-blue-900/40">
          <div className="header-light-beam" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                  Ajustar Stock
                </DialogTitle>
                <p className="text-xs text-slate-300 truncate max-w-[280px]">
                  {product.nombre} • Stock actual: <strong className="text-white">{product.stock}</strong>
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="p-4 sm:p-6 space-y-4">
              <FormField
                control={form.control}
                name="changeType"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-xs font-semibold">Tipo de Ajuste</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 gap-3"
                      >
                        <FormItem className="flex items-center space-x-2 space-y-0 rounded-xl border border-border/60 p-3 hover:bg-muted/20 cursor-pointer">
                          <FormControl><RadioGroupItem value="add" /></FormControl>
                          <FormLabel className="font-medium text-xs cursor-pointer">Aumentar (+)</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0 rounded-xl border border-border/60 p-3 hover:bg-muted/20 cursor-pointer">
                          <FormControl><RadioGroupItem value="subtract" /></FormControl>
                          <FormLabel className="font-medium text-xs cursor-pointer">Disminuir (-)</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Cantidad de unidades</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" className="rounded-xl h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Comentarios (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Razón del ajuste (ej: recepción de proveedor, merma, rotura)..."
                        className="resize-none rounded-xl"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="p-4 sm:p-5 border-t border-border/60 flex items-center justify-end gap-3 bg-muted/10">
              <Button type="button" variant="outline" className="rounded-xl border-border/60 hover:bg-white/5 font-medium" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="alfa" className="rounded-xl font-bold shadow-md px-5" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Actualizar Stock
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
