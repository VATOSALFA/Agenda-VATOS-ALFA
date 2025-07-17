
'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Upload, Info, ImagePlus } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';


interface EditServicioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const professionals = [
  { id: 'prof_1', name: 'Beatriz Elizarraga Casas' },
  { id: 'prof_2', name: 'Erick' },
  { id: 'prof_3', name: 'Karina Ruiz Rosales' },
  { id: 'prof_4', name: 'Lupita' },
  { id: 'prof_5', name: 'Gloria Ivon' },
];

export function EditServicioModal({ isOpen, onClose }: EditServicioModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { control, handleSubmit, setValue, watch } = useForm();
  
  const selectedProfessionals = watch('professionals', []);

  const handleSelectAll = (checked: boolean | string) => {
    if (checked) {
        setValue('professionals', professionals.map(p => p.id));
    } else {
        setValue('professionals', []);
    }
  }

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    console.log("Saving data:", data);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: "Servicio guardado con éxito",
      });
    } catch (error) {
      console.error("Error saving service:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el servicio. Inténtalo de nuevo.",
      });
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nuevo Servicio</DialogTitle>
          <DialogDescription>
            Configura un nuevo servicio para tu negocio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
          <Tabs defaultValue="basic" className="flex-grow flex flex-col overflow-hidden">
            <TabsList className="mb-4 flex-shrink-0">
              <TabsTrigger value="basic">Datos básicos</TabsTrigger>
              <TabsTrigger value="website">Sitio Web</TabsTrigger>
              <TabsTrigger value="advanced">Opciones avanzadas</TabsTrigger>
            </TabsList>
            <div className="flex-grow overflow-hidden">
              <ScrollArea className="h-full pr-4">
                <TabsContent value="basic" className="space-y-6 mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="service-name">Nombre del servicio *</Label>
                    <Input id="service-name" placeholder="El nombre aparecerá en el Sitio Web" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="price">Precio *</Label>
                      <Input id="price" type="number" placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="duration">Duración (min) *</Label>
                      <Input id="duration" type="number" placeholder="0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Categoría *</Label>
                    <div className="flex gap-2">
                      <Select>
                        <SelectTrigger><SelectValue placeholder="Paquetes" /></SelectTrigger>
                        <SelectContent></SelectContent>
                      </Select>
                      <Button variant="outline" type="button"><Plus className="mr-2 h-4 w-4"/>Nueva categoría</Button>
                    </div>
                  </div>
                  <div className="space-y-4 pt-4 border-t">
                    <Accordion type="single" collapsible defaultValue="item-1">
                      <AccordionItem value="item-1">
                          <AccordionTrigger>
                              <div className="flex items-center gap-2">
                                  <Checkbox 
                                      id="select-all-professionals"
                                      checked={selectedProfessionals?.length === professionals.length}
                                      onCheckedChange={handleSelectAll}
                                      onClick={(e) => e.stopPropagation()}
                                  />
                                  <Label htmlFor="select-all-professionals">Selecciona que profesionales realizarán el servicio</Label>
                              </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <Controller
                                name="professionals"
                                control={control}
                                defaultValue={[]}
                                render={({ field }) => (
                                  <div className="grid grid-cols-3 gap-x-4 gap-y-2 pt-2">
                                      {professionals.map(prof => (
                                          <div key={prof.id} className="flex items-center space-x-2">
                                              <Checkbox
                                                  id={prof.id}
                                                  checked={field.value?.includes(prof.id)}
                                                  onCheckedChange={(checked) => {
                                                      return checked
                                                          ? field.onChange([...field.value, prof.id])
                                                          : field.onChange(field.value?.filter((value: string) => value !== prof.id))
                                                  }}
                                              />
                                              <Label htmlFor={prof.id} className="font-normal">{prof.name}</Label>
                                          </div>
                                      ))}
                                  </div>
                                )}
                            />
                          </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </TabsContent>
                <TabsContent value="website" className="space-y-6 mt-0">
                  <Card>
                    <CardHeader>
                        <CardTitle>Pago en línea</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RadioGroup defaultValue="online-deposit" className="space-y-4">
                          <div className="flex items-start space-x-3 rounded-md border p-4">
                              <RadioGroupItem value="online-deposit" id="online-deposit" />
                              <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="online-deposit">Abono en línea</Label>
                                <p className="text-sm text-muted-foreground">Tus clientes deberán pagar una parte del servicio al agendar. Podrás cobrar con POS de AgendaPro el monto restante.</p>
                              </div>
                          </div>
                          <div className="flex items-start space-x-3 rounded-md border p-4">
                              <RadioGroupItem value="full-payment" id="full-payment" />
                              <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="full-payment">Se debe pagar en línea</Label>
                                <p className="text-sm text-muted-foreground">Tus clientes deberán realizar el pago completo de este servicio en línea.</p>
                                <div className="pt-2">
                                  <Label className="text-xs">Descuento sólo para pago en línea</Label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                                    <Input placeholder="Incentiva el pago en línea" className="pl-6 h-9"/>
                                  </div>
                                </div>
                              </div>
                          </div>
                           <div className="flex items-start space-x-3 rounded-md border p-4">
                              <RadioGroupItem value="no-payment" id="no-payment" />
                              <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="no-payment">No se puede pagar en línea</Label>
                                <p className="text-sm text-muted-foreground">Tus clientes no podrán pagar este servicio en línea pero si agendarlo.</p>
                              </div>
                          </div>
                      </RadioGroup>
                    </CardContent>
                  </Card>
                   <Card>
                      <CardHeader>
                          <CardTitle>Agregar imágenes</CardTitle>
                          <CardDescription>
                              ¡Carga hasta 3 imágenes de tu servicio! Te recomendamos que tengan un tamaño mínimo de 200x200px y un peso máximo de 3MB.
                          </CardDescription>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {Array.from({ length: 3 }).map((_, index) => (
                              <div key={index} className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center space-y-3">
                                  <ImagePlus className="h-10 w-10 text-muted-foreground" />
                                  <p className="text-sm text-muted-foreground">Arrastra o selecciona la imagen</p>
                                  <Button variant="outline" type="button" size="sm">
                                      <Upload className="mr-2 h-4 w-4" /> Subir imagen
                                  </Button>
                              </div>
                          ))}
                      </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="advanced" className="space-y-6 mt-0">
                  <div className="space-y-4 rounded-lg border p-4">
                      <Label className="font-semibold">Modalidad del servicio</Label>
                      <div className="flex items-center justify-between">
                          <Label htmlFor="at-local">En el local</Label>
                          <Switch id="at-local" defaultChecked />
                      </div>
                      <div className="flex items-center justify-between">
                          <Label htmlFor="home-delivery">A domicilio</Label>
                          <Switch id="home-delivery" />
                      </div>
                      <div className="flex items-center justify-between">
                          <Label htmlFor="online-service">Servicio Online</Label>
                          <Switch id="online-service" />
                      </div>
                  </div>
                  <div className="space-y-4 rounded-lg border p-4">
                      <Label className="font-semibold">Otros</Label>
                      <div className="flex items-center space-x-2">
                          <Checkbox id="include-vat" />
                          <Label htmlFor="include-vat">Precio incluye IVA</Label>
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="commission">Comisión (%)</Label>
                          <Input id="commission" type="number" placeholder="Porcentaje de comisión para el profesional" />
                      </div>
                  </div>
                  <Accordion type="multiple" className="w-full space-y-4">
                      <AccordionItem value="resources" className="rounded-lg border px-4">
                          <AccordionTrigger>Se necesita un Recurso para realizar el servicio</AccordionTrigger>
                          <AccordionContent>Selecciona el recurso necesario.</AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="special-schedule" className="rounded-lg border px-4">
                          <AccordionTrigger>El servicio se realiza en un horario especial</AccordionTrigger>
                          <AccordionContent>Configura el horario especial para este servicio.</AccordionContent>
                      </AccordionItem>
                  </Accordion>
                </TabsContent>
              </ScrollArea>
            </div>
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
