'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Info, UploadCloud } from 'lucide-react';
import Link from 'next/link';

const localSchema = z.object({
  name: z.string().min(1, "El nombre es requerido."),
  address: z.string().min(1, "La dirección es requerida."),
  timezone: z.string().min(1, "La zona horaria es requerida."),
  phone: z.string().min(1, "El teléfono es requerido."),
  email: z.string().email("El email no es válido."),
  active: z.boolean().default(true),
  whatsappPermission: z.boolean().default(true),
  schedule: z.object({
    lunes: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
    martes: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
    miercoles: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
    jueves: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
    viernes: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
    sabado: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
    domingo: z.object({ enabled: z.boolean(), start: z.string(), end: z.string() }),
  })
});

type LocalFormData = z.infer<typeof localSchema>;

interface NewLocalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocalCreated: () => void;
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

export function NewLocalModal({ isOpen, onClose, onLocalCreated }: NewLocalModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<LocalFormData>({
    resolver: zodResolver(localSchema),
    defaultValues: {
      name: '',
      address: '',
      timezone: 'America/Mexico_City',
      phone: '',
      email: '',
      active: true,
      whatsappPermission: true,
      schedule: {
        lunes: { enabled: true, start: '09:00', end: '20:00' },
        martes: { enabled: true, start: '09:00', end: '20:00' },
        miercoles: { enabled: true, start: '09:00', end: '20:00' },
        jueves: { enabled: true, start: '09:00', end: '20:00' },
        viernes: { enabled: true, start: '09:00', end: '21:00' },
        sabado: { enabled: true, start: '10:00', end: '21:00' },
        domingo: { enabled: false, start: '10:00', end: '18:00' },
      }
    }
  });

  const onSubmit = async (data: LocalFormData) => {
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'locales'), data);
      onLocalCreated();
      toast({
          title: "Local guardado con éxito",
      });
    } catch(error) {
        console.error("Error creating document: ", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo crear el local. Inténtalo de nuevo.",
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nuevo Local</DialogTitle>
          <DialogDescription>
            Completa la información y el horario de atención de tu nuevo local.
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
                          <div className="space-y-2">
                              <Label htmlFor="name">Nombre del local</Label>
                              <Input id="name" {...form.register('name')} />
                              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="address">Dirección del local</Label>
                              <Input id="address" {...form.register('address')} />
                              {form.formState.errors.address && <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>}
                          </div>
                          <div className="space-y-2">
                              <Label>Zona horaria</Label>
                              <Controller
                                name="timezone"
                                control={form.control}
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="America/Mexico_City">(GMT-06:00) Ciudad de México</SelectItem>
                                            <SelectItem value="America/Bogota">(GMT-05:00) Bogotá</SelectItem>
                                            <SelectItem value="America/Santiago">(GMT-04:00) Santiago</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                              />
                              {form.formState.errors.timezone && <p className="text-sm text-destructive">{form.formState.errors.timezone.message}</p>}
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="phone">Teléfono</Label>
                              <Input id="phone" {...form.register('phone')} />
                               {form.formState.errors.phone && <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>}
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="email">Email del local</Label>
                              <Input id="email" type="email" {...form.register('email')} />
                               {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
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
                                              <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch(`schedule.${day.id}.enabled` as any)}>
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
                                               <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch(`schedule.${day.id}.enabled` as any)}>
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
                  <TabsContent value="website" className="space-y-6 mt-0">
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>¡Tu sitio web está activo!</AlertTitle>
                        <AlertDescription className="flex justify-between items-center">
                            <span>Asegúrate de que la información de tu local esté completa y actualizada.</span>
                            <Button variant="link" asChild><Link href="#">Previsualizar</Link></Button>
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="accepts-online">Este local acepta citas en línea desde el Sitio Web</Label>
                            <Switch id="accepts-online" defaultChecked />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="home-delivery">Solo acepto servicios a domicilio</Label>
                            <Switch id="home-delivery" />
                        </div>
                      </div>

                      <div className="space-y-2">
                          <Label htmlFor="secondary-phone">Teléfono secundario</Label>
                          <Input id="secondary-phone" placeholder="Ingresa un teléfono adicional" />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="local-description">Descripción del local</Label>
                          <Textarea id="local-description" rows={5} placeholder="Describe los servicios y ambiente de tu local." />
                      </div>
                      
                      <div className="space-y-2">
                         <Label>Portada para tu Sitio Web</Label>
                         <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-center">
                            <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground mb-4">Arrastra o selecciona el archivo</p>
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
