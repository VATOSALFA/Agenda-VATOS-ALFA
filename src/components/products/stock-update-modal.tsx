
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
import { Loader2 } from 'lucide-react';
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
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Actualizar Stock: {product.nombre}</DialogTitle>
              <DialogDescription>Stock actual: {product.stock}</DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <FormField
                control={form.control}
                name="changeType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Acción</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex space-x-4"
                      >
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl><RadioGroupItem value="add" /></FormControl>
                          <FormLabel className="font-normal">Aumentar</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl><RadioGroupItem value="subtract" /></FormControl>
                          <FormLabel className="font-normal">Disminuir</FormLabel>
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
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} />
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
                    <FormLabel>Comentarios (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Razón del ajuste..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
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
