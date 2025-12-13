'use client';

import { useState, useEffect } from 'react';
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
import type { Product, Profesional as Professional, Commission } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Separator } from '@/components/ui/separator';

interface EditProductComisionModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  professionals: Professional[];
}

const getDefaultValues = (product: Product, professionals: Professional[]) => {
    const values: { [key: string]: Commission } = {};
    professionals.forEach(prof => {
        values[prof.id] = product.comisionesPorProfesional?.[prof.id] || product.commission || { value: 0, type: '%' };
    });
    return values;
}

export function EditProductComisionModal({ product, isOpen, onClose, onDataSaved, professionals }: EditProductComisionModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [masterValue, setMasterValue] = useState<number | ''>('');
  const [masterType, setMasterType] = useState<'%' | '$'>('%');
  
  const { control, handleSubmit, reset, setValue } = useForm({
    defaultValues: getDefaultValues(product, professionals),
  });

  useEffect(() => {
    if (isOpen) {
        reset(getDefaultValues(product, professionals));
    }
  }, [product, professionals, isOpen, reset]);

  const onSubmit = async (data: Record<string, Commission>) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
        const productRef = doc(db, 'productos', product.id);
        await updateDoc(productRef, {
            comisionesPorProfesional: data
        });
        toast({
            title: 'Comisiones guardadas con éxito',
            description: `Las comisiones para el producto ${product.nombre} han sido actualizadas.`,
        });
        onDataSaved();
        onClose();
    } catch(error) {
        console.error('Error al guardar comisiones de producto:', error);
        toast({
            variant: 'destructive',
            title: 'Error al guardar',
            description: 'No se pudieron guardar las comisiones. Inténtalo de nuevo.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const applyToAll = () => {
    if (masterValue === '') {
      toast({
        variant: 'destructive',
        title: 'Valor no especificado',
        description: 'Por favor, introduce un valor de comisión para aplicar a todos.',
      });
      return;
    }
    professionals.forEach(prof => {
      setValue(`${prof.id}.value`, masterValue, { shouldDirty: true });
      setValue(`${prof.id}.type`, masterType, { shouldDirty: true });
    });
    toast({
      title: 'Valores aplicados',
      description: 'Se ha establecido la comisión para todos los profesionales.',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editando comisiones para producto</DialogTitle>
          <DialogDescription>
            Configura la comisión para cada profesional que vende <strong>{product.nombre}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4 space-y-4">
             <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
              <Label className="font-semibold">Aplicar a todos</Label>
               <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Valor"
                    value={masterValue}
                    onChange={e => setMasterValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="flex-grow"
                  />
                  <Select value={masterType} onValueChange={(v: '%' | '$') => setMasterType(v)}>
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="%">%</SelectItem>
                      <SelectItem value="$">$</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={applyToAll}>Aplicar</Button>
               </div>
            </div>

            <Separator />
            <div className="max-h-[40vh] overflow-y-auto px-1 space-y-4">
              {professionals.map((prof) => (
                <div key={prof.id}>
                  <Label htmlFor={`value-${prof.id}`}>{prof.name}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Controller
                      name={`${prof.id}.value`}
                      control={control}
                      render={({ field }) => (
                        <Input
                          id={`value-${prof.id}`}
                          type="number"
                          className="flex-grow"
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      )}
                    />
                    <Controller
                        name={`${prof.id}.type`}
                        control={control}
                        render={({ field }) => (
                             <Select onValueChange={field.onChange} value={field.value}>
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
              ))}
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
