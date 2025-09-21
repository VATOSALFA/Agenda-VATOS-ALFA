
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, CalendarIcon } from 'lucide-react';
import type { Profesional } from '@/app/admin/profesionales/page';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface SpecialDayModalProps {
  profesional: Profesional;
  isOpen: boolean;
  onClose: () => void;
}

const timeOptions = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${minute}`;
});

interface SpecialDay {
    id: number;
    date: Date;
    start: string;
    end: string;
}

export function SpecialDayModal({ profesional, isOpen, onClose }: SpecialDayModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  
  const { control, handleSubmit, watch, reset } = useForm({
    defaultValues: {
      date: new Date(),
      start: '09:00',
      end: '18:00',
    }
  });

  const handleAddDay = () => {
    const newDay: SpecialDay = {
        id: Date.now(),
        date: watch('date'),
        start: watch('start'),
        end: watch('end')
    };
    setSpecialDays(prev => [...prev, newDay]);
  }

  const handleDeleteDay = (id: number) => {
    setSpecialDays(prev => prev.filter(day => day.id !== id));
  }

  const onSubmit = async () => {
    if (specialDays.length === 0) {
        toast({ variant: 'destructive', title: 'No hay días para guardar.' });
        return;
    }
    setIsSubmitting(true);
    
    try {
        const promises = specialDays.map(day => {
            const dataToSave = {
                profesionalId: profesional.id,
                profesionalName: profesional.name,
                fecha: format(day.date, 'yyyy-MM-dd'),
                hora_inicio: day.start,
                hora_fin: day.end,
                creado_en: Timestamp.now(),
            };
            return addDoc(collection(db, 'jornadas_especiales'), dataToSave);
        });

        await Promise.all(promises);

        toast({
            title: 'Jornada(s) especial(es) guardada(s) con éxito',
        });
        setSpecialDays([]);
        onClose();
    } catch (error) {
        console.error("Error guardando jornada especial:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudieron guardar las jornadas. Inténtalo de nuevo."
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Abrir día para {profesional.name}</DialogTitle>
          <DialogDescription>
            Agrega fechas y horarios especiales donde este profesional estará disponible.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
            <div className="py-4 space-y-4">
                <div className="p-4 border rounded-lg space-y-4">
                    <h4 className="font-semibold text-sm">Abrir el local en la siguiente fecha y horario</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <Controller
                            name="date"
                            control={control}
                            render={({ field }) => (
                                <div className="space-y-1">
                                    <Label>Fecha</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value ? format(field.value, "PPP", { locale: es }) : <span>Selecciona fecha</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus/></PopoverContent>
                                    </Popover>
                                </div>
                            )}
                        />
                         <Controller
                            name="start"
                            control={control}
                            render={({ field }) => (
                                <div className="space-y-1">
                                    <Label>Apertura</Label>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{timeOptions.map(time => <SelectItem key={`start-${time}`} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                                </div>
                            )}
                        />
                        <Controller
                            name="end"
                            control={control}
                            render={({ field }) => (
                                <div className="space-y-1">
                                    <Label>Cierre</Label>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{timeOptions.map(time => <SelectItem key={`end-${time}`} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                                </div>
                            )}
                        />
                    </div>
                     <div className="flex justify-end">
                        <Button type="button" size="sm" onClick={handleAddDay}><Plus className="mr-2 h-4 w-4"/>Agregar Día</Button>
                    </div>
                </div>

                {specialDays.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Días a agregar</h4>
                        <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-2">
                            {specialDays.map(day => (
                                <div key={day.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                                    <span className="text-sm font-medium">{format(day.date, "eeee, dd 'de' MMMM", { locale: es })}</span>
                                    <span className="text-sm">{day.start} - {day.end}</span>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteDay(day.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <DialogFooter className="pt-6 border-t">
                <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting || specialDays.length === 0}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
