

'use client';

import { useState, useEffect, useMemo } from 'react';
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
import type { Profesional, Schedule, Service, ServiceCategory } from '@/lib/types';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Copy, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { addDoc, collection, doc, updateDoc, deleteDoc, Timestamp, setDoc, getDoc } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Local } from '@/components/admin/locales/new-local-modal';
import { ImageUploader } from '@/components/shared/image-uploader';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { db, auth } from '@/lib/firebase-client';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';


interface EditProfesionalModalProps {
  profesional: Profesional | null;
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: () => void;
  local: Local | null; // This might be deprecated if we fetch all locales
}

const daysOfWeek = [
    { id: 'lunes', label: 'Lunes' },
    { id: 'martes', label: 'Martes' },
    { id: 'miercoles', label: 'Miércoles' },
    { id: 'jueves', label: 'Jueves' },
    { id: 'viernes', label: 'Viernes' },
    { id: 'sabado', label: 'Sábado' },
    { id: 'domingo', label: 'Domingo' },
];

const defaultSchedule: Schedule = {
  lunes: { enabled: true, start: '10:00', end: '21:00' },
  martes: { enabled: true, start: '10:00', end: '21:00' },
  miercoles: { enabled: true, start: '10:00', end: '21:00' },
  jueves: { enabled: true, start: '10:00', end: '21:00' },
  viernes: { enabled: true, start: '10:00', end: '21:00' },
  sabado: { enabled: false, start: '10:00', end: '21:00' },
  domingo: { enabled: false, start: '10:00', end: '21:00' },
};


export function EditProfesionalModal({ profesional, isOpen, onClose, onDataSaved, local }: EditProfesionalModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
  const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

  const servicesByCategory = useMemo(() => {
    if (servicesLoading || categoriesLoading) return [];
    
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
    
    return sortedCategories.map(category => ({
      category: category.name,
      services: services.filter(service => service.category === category.id)
    })).filter(group => group.services.length > 0);
  }, [services, categories, servicesLoading, categoriesLoading]);

  const allServices = useMemo(() => services.map(s => s.id), [services]);
  
  const form = useForm({
    defaultValues: profesional || {
        name: '',
        email: '',
        active: true,
        acceptsOnline: true,
        services: [],
        schedule: defaultSchedule,
        biography: '',
        avatarUrl: '',
        local_id: '',
    },
  });
  
  const timeOptions = useMemo(() => {
    if (!locales || locales.length === 0) {
        // Fallback if local data is not available
        return Array.from({ length: 48 }, (_, i) => {
            const hour = Math.floor(i / 2);
            const minute = i % 2 === 0 ? '00' : '30';
            return `${String(hour).padStart(2, '0')}:${minute}`;
        });
    }
    const scheduleSource = locales.find(l => l.id === form.watch('local_id'))?.schedule || defaultSchedule;
    
    const [startH, startM] = scheduleSource.lunes.start.split(':').map(Number);
    const [endH, endM] = scheduleSource.lunes.end.split(':').map(Number);

    const options = [];
    let currentHour = startH;
    let currentMinute = startM;

    while (currentHour < endH || (currentHour === endH && currentMinute <= endM)) {
        options.push(`${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);
        currentMinute += 30;
        if (currentMinute >= 60) {
            currentHour++;
            currentMinute = 0;
        }
    }
    return options;
  }, [locales, form.watch('local_id')]);

  useEffect(() => {
    if(isOpen) {
        const defaultValues = profesional ? 
            { ...profesional, schedule: profesional.schedule || defaultSchedule } 
            : {
                name: '', email: '', active: true, acceptsOnline: true, services: [],
                schedule: defaultSchedule,
                biography: '', avatarUrl: '', order: 0,
                local_id: locales.length > 0 ? locales[0].id : ''
            };
        form.reset(defaultValues);
    }
  }, [profesional, form, isOpen, locales]);

  const upsertUser = async (profData: any, userId: string): Promise<string> => {
    if (!db) throw new Error("Database not available");

    const userRef = doc(db, 'usuarios', userId);
    const userSnap = await getDoc(userRef);

    const userData = {
        name: profData.name,
        email: profData.email,
        role: 'Staff',
        local_id: profData.local_id,
        avatarUrl: profData.avatarUrl
    };

    if (userSnap.exists()) {
        await updateDoc(userRef, userData);
    } else {
        await setDoc(userRef, userData);
    }
    return userId;
};


  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
        if(!db) throw new Error("Database not available");
        
        const { ...profData } = data;

        if (profesional) { // EDIT MODE
            const profRef = doc(db, 'profesionales', profesional.id);
            await updateDoc(profRef, profData);
            
            // Also update the user document with the new avatar and name
            if (profesional.userId) {
                const userRef = doc(db, 'usuarios', profesional.userId);
                await updateDoc(userRef, { name: profData.name, avatarUrl: profData.avatarUrl });
            }

            toast({ title: "Profesional actualizado con éxito" });
        } else { // CREATE MODE
            const newProfessionalId = doc(collection(db, 'profesionales')).id;
            const newUserId = doc(collection(db, 'usuarios')).id;

            const userData = {
                name: profData.name,
                email: profData.email,
                role: 'Staff',
                local_id: profData.local_id,
                avatarUrl: profData.avatarUrl,
            };

            const professionalData = {
                ...profData,
                userId: newUserId, // Link to the user document
                order: 99,
                created_at: Timestamp.now()
            }
            
            const userRef = doc(db, 'usuarios', newUserId);
            const profRef = doc(db, 'profesionales', newProfessionalId);

            const batch = writeBatch(db);
            batch.set(userRef, userData);
            batch.set(profRef, professionalData);
            await batch.commit();

            toast({ title: "Profesional creado con éxito" });
        }
        onDataSaved();
    } catch (error) {
        console.error("Error saving professional:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo guardar el profesional. Inténtalo de nuevo.",
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!profesional || !db) return;
    setIsDeleting(true);
    try {
        await deleteDoc(doc(db, 'profesionales', profesional.id));
        if (profesional.userId) {
            await deleteDoc(doc(db, 'usuarios', profesional.userId));
        }
        toast({ title: "Profesional eliminado con éxito" });
        onDataSaved();
    } catch (error) {
        console.error("Error deleting professional:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo eliminar el profesional. Inténtalo de nuevo.",
        });
    } finally {
        setIsDeleting(false);
    }
  }

  const copySchedule = (fromDayId: string) => {
    const sourceSchedule = form.getValues(`schedule.${fromDayId as keyof Schedule}`);
    if (!sourceSchedule) {
        toast({ variant: 'destructive', title: 'Error', description: `No se encontró el horario para ${fromDayId}.` });
        return;
    }
    const dayLabel = daysOfWeek.find(d => d.id === fromDayId)?.label || 'este día';

    daysOfWeek.forEach(day => {
        if(day.id !== fromDayId) {
            form.setValue(`schedule.${day.id as keyof Schedule}.enabled`, sourceSchedule.enabled);
            form.setValue(`schedule.${day.id as keyof Schedule}.start`, sourceSchedule.start);
            form.setValue(`schedule.${day.id as keyof Schedule}.end`, sourceSchedule.end);
        }
    });
    toast({ title: 'Horario copiado', description: `El horario de ${dayLabel} ha sido copiado a los otros días.`});
  }

  const schedule = form.watch('schedule');
  const selectedServices = form.watch('services');

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{profesional ? `Editando ${profesional.name}` : 'Nuevo Profesional'}</DialogTitle>
          <DialogDescription>
            Modifica la información, servicios y horarios del profesional.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
            <Tabs defaultValue="basic" className="flex-grow flex flex-col overflow-hidden">
                <TabsList className="mb-4 flex-shrink-0">
                    <TabsTrigger value="basic">Datos básicos</TabsTrigger>
                    <TabsTrigger value="schedule">Horario</TabsTrigger>
                    <TabsTrigger value="profile">Perfil</TabsTrigger>
                </TabsList>
                <ScrollArea className="flex-grow pr-4">
                  <TabsContent value="basic" className="space-y-6 mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                              <Label htmlFor="name">Nombre Público</Label>
                              <Input id="name" {...form.register('name')} />
                          </div>
                          <div className="space-y-2">
                              <Label htmlFor="email">Email</Label>
                              <Input id="email" type="email" {...form.register('email')} />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                              <Label htmlFor="local_id">Sucursal</Label>
                              <Controller 
                                control={form.control}
                                name="local_id"
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading}>
                                        <SelectTrigger id="local_id">
                                            <SelectValue placeholder="Seleccionar sucursal..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {locales.map(loc => (
                                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                              />
                          </div>
                      </div>
                       <div className="flex items-center space-x-2 pt-4">
                            <Controller
                                name="acceptsOnline"
                                control={form.control}
                                render={({ field }) => (
                                    <Switch id="acceptsOnline" checked={field.value} onCheckedChange={field.onChange} />
                                )}
                            />
                            <Label htmlFor="acceptsOnline">Este profesional acepta reservas en línea</Label>
                        </div>
                        <div className="space-y-4 pt-6 border-t">
                            <div className="flex justify-between items-center">
                                <h4 className="text-lg font-semibold">Selecciona los servicios que realiza el profesional</h4>
                                <div className="flex items-center gap-2">
                                <Checkbox
                                    id="select-all"
                                    checked={selectedServices?.length === allServices.length}
                                    onCheckedChange={(checked) => {
                                        form.setValue('services', checked ? allServices : []);
                                    }}
                                />
                                <Label htmlFor="select-all">Seleccionar todos</Label>
                                </div>
                            </div>
                            <Accordion type="multiple" defaultValue={servicesByCategory.map(s => s.category)}>
                                {servicesByCategory.map(category => (
                                    <AccordionItem key={category.category} value={category.category}>
                                        <AccordionTrigger>{category.category}</AccordionTrigger>
                                        <AccordionContent className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            {category.services.map(service => (
                                                 <Controller
                                                    key={service.id}
                                                    name="services"
                                                    control={form.control}
                                                    render={({ field }) => (
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={service.id}
                                                                checked={Array.isArray(field.value) && field.value.includes(service.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const currentValue = field.value || [];
                                                                    return checked
                                                                        ? field.onChange([...currentValue, service.id])
                                                                        : field.onChange(currentValue.filter((value: string) => value !== service.id))
                                                                }}
                                                            />
                                                            <Label htmlFor={service.id} className="font-normal">{service.name}</Label>
                                                        </div>
                                                    )}
                                                />
                                            ))}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>
                  </TabsContent>
                  <TabsContent value="schedule" className="space-y-6 mt-0">
                      {daysOfWeek.map((day) => (
                          <div key={day.id} className="grid grid-cols-6 items-center gap-4 border-b pb-4">
                              <Controller
                                  name={`schedule.${day.id}.enabled` as any}
                                  control={form.control}
                                  render={({ field }) => (
                                      <div className="flex items-center space-x-2 col-span-1">
                                          <Switch id={`switch-${day.id}`} checked={field.value} onCheckedChange={field.onChange} />
                                          <Label htmlFor={`switch-${day.id}`} className="capitalize font-bold">{day.label}</Label>
                                      </div>
                                  )}
                              />
                              <div className="col-span-3 grid grid-cols-2 gap-2 items-center">
                                 <Controller
                                      name={`schedule.${day.id}.start` as any}
                                      control={form.control}
                                      render={({ field }) => (
                                          <Select onValueChange={field.onChange} value={field.value} disabled={!schedule?.[day.id as keyof Schedule]?.enabled}>
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
                                           <Select onValueChange={field.onChange} value={field.value} disabled={!schedule?.[day.id as keyof Schedule]?.enabled}>
                                              <SelectTrigger><SelectValue/></SelectTrigger>
                                              <SelectContent>
                                                  {timeOptions.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                                              </SelectContent>
                                          </Select>
                                      )}
                                  />
                              </div>
                              <div className="col-span-2 flex items-center gap-2 justify-end">
                                <Button variant="outline" size="sm" type="button"><Plus className="mr-2 h-4 w-4" />Descanso</Button>
                                <Button variant="ghost" size="sm" type="button" onClick={() => copySchedule(day.id)}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                              </div>
                          </div>
                      ))}
                  </TabsContent>
                  <TabsContent value="profile" className="space-y-6 mt-0">
                      <div className="space-y-2">
                          <Label htmlFor="biography">Biografía</Label>
                          <Textarea id="biography" rows={5} {...form.register('biography')} placeholder="Cuéntale a tus clientes sobre este profesional..." />
                      </div>
                      <div className="space-y-2">
                         <Label>Foto del profesional</Label>
                         <Controller
                            name="avatarUrl"
                            control={form.control}
                            render={({ field }) => (
                               <ImageUploader 
                                folder="profesionales"
                                currentImageUrl={field.value}
                                onUpload={(url) => field.onChange(url)}
                                onRemove={() => field.onChange('')}
                               />
                            )}
                         />
                      </div>
                      {profesional && (
                          <div className="pt-6 border-t">
                            <h4 className="text-lg font-semibold text-destructive">Zona de Peligro</h4>
                             <div className="flex justify-between items-center mt-2 p-4 border border-destructive/50 rounded-lg">
                                <div>
                                    <p className="font-medium">Eliminar profesional</p>
                                    <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
                                </div>
                                <Button variant="destructive" type="button" onClick={() => setIsDeleting(true)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar
                                </Button>
                             </div>
                          </div>
                      )}
                  </TabsContent>
                </ScrollArea>
            </Tabs>
            <DialogFooter className="pt-6 border-t flex-shrink-0">
                <Button variant="ghost" type="button" onClick={onClose}>Cerrar</Button>
                <Button type="submit" disabled={isSubmitting || isUploading}>
                    {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Guardar
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {isDeleting && (
        <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Esta acción es irreversible. Se eliminará permanentemente al profesional "{profesional?.name}".
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                        Sí, eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </>
  );
}
