

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
import type { Profesional as Professional } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/firebase';

interface EditDefaultComisionModalProps {
  professional: Professional;
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
}

export function EditDefaultComisionModal({ professional, isOpen, onClose, onDataSaved }: EditDefaultComisionModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { control, handleSubmit, reset } = useForm({
    defaultValues: {
      defaultCommission: professional.defaultCommission || { value: 0, type: '%' }
    },
  });

  useEffect(() => {
    if (isOpen) {
        reset({ defaultCommission: professional.defaultCommission || { value: 0, type: '%' } });
    }
  }, [professional, isOpen, reset]);

  const onSubmit = async (data: any) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
        const professionalRef = doc(db, 'profesionales', professional.id);
        await updateDoc(professionalRef, {
            defaultCommission: data.defaultCommission
        });

        toast({
            title: 'Comisión por defecto guardada con éxito',
            description: `La comisión por defecto para ${professional.name} ha sido actualizada.`,
        });
        onDataSaved();
        onClose();
    } catch (error) {
        console.error("Error al guardar comisión por defecto:", error);
        toast({
            variant: 'destructive',
            title: 'Error al guardar',
            description: 'No se pudo guardar la comisión por defecto. Inténtalo de nuevo.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editando comisión por defecto</DialogTitle>
          <DialogDescription>
            Al guardar se modificarán las comisiones generales o especificas de tus productos, servicios o planes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4">
            <Label htmlFor="commission-value">Comisión por defecto</Label>
            <div className="flex items-center gap-2 mt-1">
                <Controller
                    name="defaultCommission.value"
                    control={control}
                    render={({ field }) => (
                    <Input
                        id="commission-value"
                        type="number"
                        placeholder="Comisión"
                        className="flex-grow"
                        {...field}
                        onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                    )}
                />
                <Controller
                    name="defaultCommission.type"
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
