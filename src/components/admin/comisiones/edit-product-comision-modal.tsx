
'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Product } from '@/app/admin/comisiones/page';

interface EditProductComisionModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

export function EditProductComisionModal({ product, isOpen, onClose }: EditProductComisionModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { control, handleSubmit } = useForm({
    defaultValues: {
      commission: product.defaultCommission,
    },
  });

  const onSubmit = (data: any) => {
    setIsSubmitting(true);
    console.log('Datos de comisión por defecto del producto guardados:', data);
    
    // Simular llamada a API
    setTimeout(() => {
      toast({
        title: 'Comisión guardada con éxito',
        description: `La comisión para ${product.name} ha sido actualizada.`,
      });
      setIsSubmitting(false);
      onClose();
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editando comisión por defecto</DialogTitle>
          <DialogDescription>
            Al guardar se modificarán las comisiones generales o específicas de tus productos, servicios o planes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4">
            <Label htmlFor="commission-value">Comisión por defecto</Label>
            <div className="flex items-center gap-2 mt-1">
                <Controller
                    name="commission.value"
                    control={control}
                    render={({ field }) => (
                    <Input
                        id="commission-value"
                        type="number"
                        placeholder="Comisión"
                        className="flex-grow"
                        {...field}
                    />
                    )}
                />
                <Controller
                    name="commission.type"
                    control={control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="w-[80px]">
                                <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="%">%</SelectItem>
                                <SelectItem value="$">$</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>
          </div>
          <DialogFooter className="pt-6 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
