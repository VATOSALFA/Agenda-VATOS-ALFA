
'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { Local } from '@/app/admin/locales/page';
import { Loader2 } from 'lucide-react';

interface EditLocalModalProps {
  local: Local;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

const daysOfWeek = [
    { id: 'lunes', label: 'Lunes' },
    { id: 'martes', label: 'Martes' },
    { id: 'miercoles', label: 'Miércoles' },
    { id: 'jueves', label: 'Jueves' },
    { id: 'viernes', label: 'Viernes' },
    { id: 'sabado', label: 'Sábado' },
    { id: 'domingo', label: 'Domingo' },
];

export function EditLocalModal({ local, isOpen, onOpenChange }: EditLocalModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<Local>({
    defaultValues: local,
  });

  const onSubmit = (data: Local) => {
    setIsSubmitting(true);
    console.log(data);
    setTimeout(() => {
        toast({
            title: "Local Actualizado",
            description: `La información de ${data.name} ha sido guardada.`,
        });
        setIsSubmitting(false);
        onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editando {local.name}</DialogTitle>
          <DialogDescription>
            Modifica la información y el horario de atención de tu local.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
            <Tabs defaultValue="basic" className="flex-grow flex flex-col">
                <TabsList className="mb-4">
                    <TabsTrigger value="basic">Datos básicos</TabsTrigger>
                    <TabsTrigger value="website">Sitio Web</TabsTrigger>
                </TabsList>
                <ScrollArea className="flex-grow pr-2">
                    <TabsContent value="basic" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre del local</Label>
                                <Input id="name" {...form.register('name')} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Dirección del local</Label>
                                <Input id="address" {...form.register('address')} />
                            </div>
                            <div className="space-y-2">
                                <Label>Zona horaria</Label>
                                <Select defaultValue={local.timezone} onValueChange={(value) => form.setValue('timezone', value)}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="America/Mexico_City">(GMT-06:00) Ciudad de México</SelectItem>
                                        <SelectItem value="America/Bogota">(GMT-05:00) Bogotá</SelectItem>
                                        <SelectItem value="America/Santiago">(GMT-04:00) Santiago</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Teléfono</Label>
                                <Input id="phone" {...form.register('phone')} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email del local</Label>
                                <Input id="email" type="email" {...form.register('email')} />
                            </div>
                        </div>

                        <div className="space-y-4 pt-6 border-t">
                            <h4 className="text-lg font-semibold">Horario de inicio y fin de la jornada</h4>
                            {daysOfWeek.map((day) => (
                                <div key={day.id} className="grid grid-cols-4 items-center gap-4">
                                    <Controller
                                        name={`schedule.${day.id}.enabled` as any}
                                        control={form.control}
                                        render={({ field }) => (
                                            <div className="flex items-center space-x-2">
                                                <Switch id={`switch-${day.id}`} checked={field.value} onCheckedChange={field.onChange} />
                                                <Label htmlFor={`switch-${day.id}`} className="capitalize">{day.label}</Label>
                                            </div>
                                        )}
                                    />
                                    <div className="col-span-3 grid grid-cols-2 gap-2 items-center">
                                       <Controller
                                            name={`schedule.${day.id}.start` as any}
                                            control={form.control}
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!form.watch(`schedule.${day.id}.enabled` as any)}>
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        {timeOptions.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        <Controller
                                            name={`schedule.${day.id}.end` as any}
                                            control={form.control}
                                            render={({ field }) => (
                                                 <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!form.watch(`schedule.${day.id}.enabled` as any)}>
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        {timeOptions.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="website">
                        <div className="text-center text-muted-foreground py-10">
                            <p>Configuración del sitio web para este local estará disponible aquí.</p>
                        </div>
                    </TabsContent>
                </ScrollArea>
            </Tabs>
            <DialogFooter className="pt-6 border-t">
                <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>Cerrar</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
