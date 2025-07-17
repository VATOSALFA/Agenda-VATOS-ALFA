
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
import { Loader2, Plus, UploadCloud } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';

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

  const handleSelectAll = (checked: boolean) => {
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

  const ImageUploader = () => (
    <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg text-center h-32">
      <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-xs text-muted-foreground">Arrastra o selecciona el archivo</p>
    </div>
  );

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
            <ScrollArea className="flex-grow pr-4">
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
                  <RadioGroup defaultValue="online-deposit">
                     <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="online-deposit" id="online-deposit" />
                            <Label htmlFor="online-deposit">Abono en línea</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="full-payment" id="full-payment" />
                            <Label htmlFor="full-payment">Se debe pagar en línea</Label>
                        </div>
                        <Input type="number" placeholder="Incentivo %" className="w-40 ml-6" />
                         <div className="flex items-center space-x-2">
                            <RadioGroupItem value="no-online-payment" id="no-online-payment" />
                            <Label htmlFor="no-online-payment">No se puede pagar en línea</Label>
                        </div>
                     </div>
                  </RadioGroup>
                  <div className="space-y-2">
                    <Label>Agregar imágenes</Label>
                    <div className="grid grid-cols-3 gap-4">
                        <ImageUploader />
                        <ImageUploader />
                        <ImageUploader />
                    </div>
                  </div>
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
