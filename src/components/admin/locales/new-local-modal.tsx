
'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDoc, updateDoc, collection, doc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, UploadCloud } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { Schedule } from '@/app/admin/profesionales/page';
import { db } from '@/lib/firebase-client';

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

export interface Local {
  id: string;
  name: string;
  address: string;
  timezone: string;
  phone: string;
  email: string;
  schedule: Schedule;
  acceptsOnline: boolean;
  delivery: boolean;
  secondaryPhone?: string;
  description?: string;
}

const localSchema = z.object({
  name: z.string().min(1, "El nombre es requerido."),
  address: z.string().min(1, "La dirección es requerida."),
  timezone: z.string().min(1, "La zona horaria es requerida."),
  phone: z.string().min(1, "El teléfono es requerido."),
  email: z.string().email("Debe ser un email válido."),
  schedule: z.any(),
  acceptsOnline: z.boolean().default(true),
  delivery: z.boolean().default(false),
  secondaryPhone: z.string().optional(),
  description: z.string().optional(),
});

type LocalFormData = z.infer<typeof localSchema>;


interface NewLocalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocalCreated: () => void;
  local: Local | null;
}

export function NewLocalModal({ isOpen, onClose, onLocalCreated, local }: NewLocalModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!local;

  const form = useForm<LocalFormData>({
    resolver: zodResolver(localSchema),
    defaultValues: {
        name: '',
        address: '',
        timezone: 'America/Mexico_City',
        phone: '',
        email: '',
        schedule: {
          lunes: { enabled: true, start: '10:00', end: '21:00' },
          martes: { enabled: true, start: '10:00', end: '21:00' },
          miercoles: { enabled: true, start: '10:00', end: '21:00' },
          jueves: { enabled: true, start: '10:00', end: '21:00' },
          viernes: { enabled: true, start: '10:00', end: '21:00' },
          sabado: { enabled: false, start: '10:00', end: '21:00' },
          domingo: { enabled: false, start: '10:00', end: '21:00' },
        },
        acceptsOnline: true,
        delivery: false,
        secondaryPhone: '',
        description: '',
    },
  });

  useEffect(() => {
    if (local) {
        form.reset(local);
    } else {
        form.reset({
            name: '',
            address: '',
            timezone: 'America/Mexico_City',
            phone: '',
            email: '',
            schedule: {
              lunes: { enabled: true, start: '10:00', end: '21:00' },
              martes: { enabled: true, start: '10:00', end: '21:00' },
              miercoles: { enabled: true, start: '10:00', end: '21:00' },
              jueves: { enabled: true, start: '10:00', end: '21:00' },
              viernes: { enabled: true, start: '10:00', end: '21:00' },
              sabado: { enabled: false, start: '10:00', end: '21:00' },
              domingo: { enabled: false, start: '10:00', end: '21:00' },
            },
            acceptsOnline: true,
            delivery: false,
            secondaryPhone: '',
            description: '',
        });
    }
  }, [local, form]);

  const onSubmit = async (data: LocalFormData) => {
    if (!db) return;
    setIsSubmitting(true);
    try {
      if (isEditMode && local) {
        const localRef = doc(db, 'locales', local.id);
        await updateDoc(localRef, data as any);
        toast({ title: "Local actualizado con éxito" });
      } else {
        const dataToSave = {
          ...data,
          status: 'active',
          creado_en: Timestamp.now(),
        };
        await addDoc(collection(db, 'locales'), dataToSave);
        toast({ title: "Local guardado con éxito" });
      }
      
      onLocalCreated();

    } catch (error) {
      console.error("Error saving local: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el local. Inténtalo de nuevo.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar Local' : 'Nuevo Local'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Modifica los datos de la sucursal.' : 'Agrega una nueva sucursal a tu negocio.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
            <Tabs defaultValue="basic" className="flex-grow flex flex-col overflow-hidden">
                <TabsList className="mb-4 flex-shrink-0">
                    <TabsTrigger value="basic">Datos básicos</TabsTrigger>
                    <TabsTrigger value="website">Sitio Web</TabsTrigger>
                </TabsList>
                <ScrollArea className="flex-grow pr-4">
                  <TabsContent value="basic" className="space-y-6 mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2"><Label htmlFor="name">Nombre del local</Label><Input id="name" {...form.register('name')} /></div>
                          <div className="space-y-2"><Label htmlFor="address">Dirección</Label><Input id="address" {...form.register('address')} /></div>
                          <div className="space-y-2"><Label htmlFor="timezone">Zona horaria</Label>
                            <Controller name="timezone" control={form.control} render={({ field }) => (
                                <Select onValueChange={field.onChange} defaultValue={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="America/Mexico_City">America/Mexico_City</SelectItem></SelectContent></Select>
                            )}/>
                          </div>
                          <div className="space-y-2"><Label htmlFor="phone">Teléfono</Label><Input id="phone" {...form.register('phone')} /></div>
                          <div className="space-y-2 md:col-span-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" {...form.register('email')} /></div>
                      </div>
                      <div className="space-y-4 pt-6 border-t">
                          <h4 className="font-semibold">Horario de atención</h4>
                          {daysOfWeek.map((day) => (
                          <div key={day.id} className="grid grid-cols-6 items-center gap-4">
                            <Controller name={`schedule.${day.id}.enabled` as any} control={form.control} render={({ field }) => (
                                <div className="flex items-center space-x-2 col-span-2">
                                  <Switch id={`switch-${day.id}`} checked={field.value} onCheckedChange={field.onChange} />
                                  <Label htmlFor={`switch-${day.id}`} className="capitalize font-bold">{day.label}</Label>
                                </div>
                            )}/>
                            <div className="col-span-4 grid grid-cols-2 gap-2 items-center">
                              <Controller name={`schedule.${day.id}.start` as any} control={form.control} render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch(`schedule.${day.id}.enabled`)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{timeOptions.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                              )}/>
                              <Controller name={`schedule.${day.id}.end` as any} control={form.control} render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch(`schedule.${day.id}.enabled`)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{timeOptions.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}</SelectContent></Select>
                              )}/>
                            </div>
                          </div>
                        ))}
                      </div>
                  </TabsContent>
                  <TabsContent value="website" className="space-y-6 mt-0">
                      <div className="space-y-4">
                        <Controller name="acceptsOnline" control={form.control} render={({ field }) => (
                            <div className="flex items-center justify-between"><Label htmlFor="acceptsOnline">Acepta citas en línea</Label><Switch id="acceptsOnline" checked={field.value} onCheckedChange={field.onChange} /></div>
                        )}/>
                        <Controller name="delivery" control={form.control} render={({ field }) => (
                            <div className="flex items-center justify-between"><Label htmlFor="delivery">Servicios a domicilio</Label><Switch id="delivery" checked={field.value} onCheckedChange={field.onChange} /></div>
                        )}/>
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="secondaryPhone">Teléfono secundario</Label>
                          <Input id="secondaryPhone" {...form.register('secondaryPhone')} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="description">Descripción del local</Label>
                          <Textarea id="description" {...form.register('description')} rows={5} />
                      </div>
                      <div className="space-y-2">
                         <Label>Portada</Label>
                         <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-center">
                            <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground mb-4">Arrastra o selecciona la imagen</p>
                            <Button variant="outline" type="button">Subir archivo</Button>
                         </div>
                      </div>
                  </TabsContent>
                </ScrollArea>
            </Tabs>
            <DialogFooter className="pt-6 border-t flex-shrink-0">
                <Button variant="ghost" type="button" onClick={onClose}>Cerrar</Button>
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
