
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
import type { Service } from '@/app/admin/comisiones/page';

interface EditServiceComisionesModalProps {
  service: Service;
  isOpen: boolean;
  onClose: () => void;
}

const mockProfessionals = [
  { id: 'prof_1', name: 'Beatriz Elizarraga Casas' },
  { id: 'prof_2', name: 'Gloria Ivon' },
  { id: 'prof_3', name: 'Karina Ruiz Rosales' },
  { id: 'prof_4', name: 'Lupita' },
  { id: 'prof_5', name: 'Erick' },
];

const getDefaultValues = (service: Service) => {
    const values: { [key: string]: { value: number; type: string } } = {};
    mockProfessionals.forEach(prof => {
        // In a real app, you would fetch the specific commission for this prof/service
        // For now, we'll use the service's default
        values[prof.name] = service.defaultCommission;
    });
    return values;
}

export function EditServiceComisionesModal({ service, isOpen, onClose }: EditServiceComisionesModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { control, handleSubmit } = useForm({
    defaultValues: getDefaultValues(service),
  });

  const onSubmit = (data: any) => {
    setIsSubmitting(true);
    console.log('Datos de comisiones de servicio guardados:', data);
    
    // Simular llamada a API
    setTimeout(() => {
      toast({
        title: 'Comisiones guardadas con éxito',
        description: `Las comisiones para el servicio ${service.name} han sido actualizadas.`,
      });
      setIsSubmitting(false);
      onClose();
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editando comisiones para {service.name}</DialogTitle>
          <DialogDescription>
            Configura la comisión para cada profesional que realiza este servicio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4 max-h-[60vh] overflow-y-auto px-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {mockProfessionals.map((prof) => (
                <div key={prof.id}>
                  <Label htmlFor={`value-${prof.id}`}>{prof.name}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Controller
                      name={`${prof.name}.value`}
                      control={control}
                      render={({ field }) => (
                        <Input
                          id={`value-${prof.id}`}
                          type="number"
                          className="flex-grow"
                          {...field}
                        />
                      )}
                    />
                    <Controller
                        name={`${prof.name}.type`}
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
