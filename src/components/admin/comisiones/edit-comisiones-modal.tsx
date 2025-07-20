
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
import type { Professional, Service, Commission } from '@/app/admin/comisiones/page';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface EditComisionesModalProps {
  professional: Professional;
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  services: Service[];
}

const getDefaultValues = (professional: Professional, services: Service[]) => {
    const values: { [key: string]: Commission } = {};
    services.forEach(service => {
        values[service.name] = professional.comisionesPorServicio?.[service.name] || professional.defaultCommission || { value: 0, type: '%' };
    });
    return values;
}

export function EditComisionesModal({ professional, isOpen, onClose, onDataSaved, services }: EditComisionesModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { control, handleSubmit, reset } = useForm({
    defaultValues: getDefaultValues(professional, services),
  });

  useEffect(() => {
    if (isOpen) {
        reset(getDefaultValues(professional, services));
    }
  }, [professional, services, isOpen, reset]);


  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
        const professionalRef = doc(db, 'profesionales', professional.id);
        await updateDoc(professionalRef, {
            comisionesPorServicio: data
        });
        toast({
            title: 'Comisiones guardadas con éxito',
            description: `Las comisiones para ${professional.name} han sido actualizadas.`,
        });
        onDataSaved();
        onClose();

    } catch (error) {
       console.error("Error al guardar comisiones:", error);
       toast({
        variant: "destructive",
        title: 'Error al guardar',
        description: 'No se pudieron guardar las comisiones. Inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editando comisiones para {professional.name}</DialogTitle>
          <DialogDescription>
            Configura el porcentaje o monto fijo de comisión para cada servicio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4 max-h-[60vh] overflow-y-auto px-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {services.map((service) => (
                <div key={service.id}>
                  <Label htmlFor={`value-${service.name}`}>{service.name}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Controller
                      name={`${service.name}.value`}
                      control={control}
                      render={({ field }) => (
                        <Input
                          id={`value-${service.name}`}
                          type="number"
                          className="flex-grow"
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      )}
                    />
                    <Controller
                        name={`${service.name}.type`}
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
