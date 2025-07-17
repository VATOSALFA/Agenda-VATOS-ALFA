
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

interface EditDefaultServiceComisionModalProps {
  service: Service;
  isOpen: boolean;
  onClose: () => void;
}

export function EditDefaultServiceComisionModal({ service, isOpen, onClose }: EditDefaultServiceComisionModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { control, handleSubmit } = useForm({
    defaultValues: {
      commission: service.defaultCommission,
    },
  });

  const onSubmit = (data: any) => {
    setIsSubmitting(true);
    console.log('Datos de comisión por defecto del servicio guardados:', data);
    
    // Simular llamada a API
    setTimeout(() => {
      toast({
        title: 'Comisión por defecto guardada',
        description: `La comisión por defecto para ${service.name} ha sido actualizada.`,
      });
      setIsSubmitting(false);
      onClose();
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editando comisión por defecto para {service.name}</DialogTitle>
          <DialogDescription>
            Esta será la comisión aplicada a menos que un profesional tenga una específica.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="py-4">
            <Label htmlFor="commission-value">Comisión por defecto del servicio</Label>
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

