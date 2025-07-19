
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
import type { Professional } from '@/app/admin/comisiones/page';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface EditComisionesModalProps {
  professional: Professional;
  isOpen: boolean;
  onClose: () => void;
}

const mockServices = [
  'Todo para el Campeón',
  'Renovación Alfa',
  'Héroe en descanso',
  'El Caballero Alfa',
  'El Alfa Superior',
  'Facial completo con Masajeador relajante, spa y aceites',
  'Arreglo de ceja',
  'Lavado de cabello',
  'Corte clásico y moderno',
  'Arreglo de barba expres',
  'Arreglo de barba, Afeitado clásico con toalla caliente',
];

const getDefaultValues = () => {
    const defaultCommission = { value: 50, type: '%' };
    const values: { [key: string]: { value: number; type: string } } = {};
    mockServices.forEach(service => {
        values[service] = defaultCommission;
    });
    return values;
}

export function EditComisionesModal({ professional, isOpen, onClose }: EditComisionesModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { control, handleSubmit } = useForm({
    defaultValues: getDefaultValues(),
  });

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
              {mockServices.map((service) => (
                <div key={service}>
                  <Label htmlFor={`value-${service}`}>{service}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Controller
                      name={`${service}.value`}
                      control={control}
                      render={({ field }) => (
                        <Input
                          id={`value-${service}`}
                          type="number"
                          className="flex-grow"
                          {...field}
                        />
                      )}
                    />
                    <Controller
                        name={`${service}.type`}
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
