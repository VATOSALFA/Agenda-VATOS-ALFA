'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
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
import { Loader2, Percent, X, Wand2 } from 'lucide-react';
import type { Product, Profesional as Professional, Commission } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

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
};

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
    } catch (error) {
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
      <DialogContent hideCloseButton={true} className="sm:max-w-lg p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card">
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-border/60">
          <div className="header-light-beam" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Percent className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Comisiones: {product.nombre}
                </DialogTitle>
                <p className="text-xs text-slate-300">
                  Configura la comisión para cada profesional por la venta de este producto.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-4 sm:p-5 space-y-4">
            {/* Aplicar masivamente */}
            <div className="p-3 rounded-xl border border-border/60 bg-muted/10 space-y-2">
              <div className="flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-blue-400" />
                <Label className="text-xs font-semibold text-foreground">Aplicar masivamente a todos</Label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Valor"
                  value={masterValue}
                  onChange={e => setMasterValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="h-8 text-xs bg-background border-border/60 flex-grow"
                />
                <Select value={masterType} onValueChange={(v: '%' | '$') => setMasterType(v)}>
                  <SelectTrigger className="w-[85px] h-8 text-xs border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-2 border-blue-500 rounded-xl">
                    <SelectItem value="%">% Porc.</SelectItem>
                    <SelectItem value="$">$ Fijo</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="alfa" size="sm" onClick={applyToAll} className="h-8 text-xs px-3 shrink-0">
                  Aplicar
                </Button>
              </div>
            </div>

            {/* Listado de Profesionales */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Comisiones individuales por profesional</Label>
              <div className="max-h-[42vh] overflow-y-auto pr-1 space-y-1.5">
                {professionals.map((prof) => (
                  <div key={prof.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/40 hover:bg-muted/20 transition-colors">
                    <span className="text-xs font-medium text-foreground truncate max-w-[180px] sm:max-w-[240px]">
                      {prof.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Controller
                        name={`${prof.id}.value`}
                        control={control}
                        render={({ field }) => (
                          <Input
                            id={`value-${prof.id}`}
                            type="number"
                            className="w-20 h-7 text-xs text-right bg-background border-border/60"
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
                            <SelectTrigger className="w-[65px] h-7 text-xs border-border/60">
                              <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl">
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
          </div>

          <div className="p-3 sm:p-4 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/20">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs h-8">
              Cancelar
            </Button>
            <Button type="submit" variant="alfa" size="sm" disabled={isSubmitting} className="text-xs h-8">
              {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar Comisiones
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
