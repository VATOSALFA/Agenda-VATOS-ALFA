
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
import type { Profesional, Schedule, Service, ServiceCategory, Local } from '@/lib/types';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Copy, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { addDoc, collection, doc, updateDoc, deleteDoc, Timestamp, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
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
import { ImageUploader } from '@/components/shared/image-uploader';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { db, auth, storage } from '@/lib/firebase-client';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';


interface EditProfesionalModalProps {
    profesional: Profesional | null;
    isOpen: boolean;
    onClose: () => void;
    onDataSaved: () => void;
    local: Local | null;
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
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleCloseModal = async () => {
        if (uploadedImages.length > 0) {
            await Promise.all(uploadedImages.map(async (url) => {
                try {
                    const imageRef = ref(storage, url);
                    await deleteObject(imageRef);
                } catch (error) {
                    console.warn("Error cleaning up image:", error);
                }
            }));
        }
        setUploadedImages([]);
        onClose();
    };

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
    }, [locales, form]);

    useEffect(() => {
        if (isOpen) {
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
            if (!db) throw new Error("Database not available");

            // Helper to remove undefined values recursively
            const cleanData = (obj: any): any => {
                if (Array.isArray(obj)) {
                    return obj.map(v => cleanData(v));
                } else if (obj !== null && typeof obj === 'object') {
                    return Object.entries(obj).reduce((acc, [key, value]) => {
                        if (value !== undefined) {
                            acc[key] = cleanData(value);
                        }
                        return acc;
                    }, {} as any);
                }
                return obj;
            };

            const { ...profDataRaw } = data;
            // Remove id if present to avoid redundant update
            delete profDataRaw.id;

            const profData = cleanData(profDataRaw);

            if (profesional) { // EDIT MODE
                const profRef = doc(db, 'profesionales', profesional.id);
                await updateDoc(profRef, profData);

                // Also update the user document with the new avatar and name
                if (profesional.userId) {
                    try {
                        const userRef = doc(db, 'usuarios', profesional.userId);
                        const userSnap = await getDoc(userRef);

                        if (userSnap.exists()) {
                            const userUpdates: any = { name: profData.name };
                            if ('avatarUrl' in profData) {
                                userUpdates.avatarUrl = profData.avatarUrl;
                            }
                            await updateDoc(userRef, userUpdates);
                        } else {
                            console.warn(`Linked user document ${profesional.userId} not found for professional ${profesional.id}. Skipping user update.`);
                        }
                    } catch (userUpdateError) {
                        console.error("Error updating linked user document:", userUpdateError);
                        // Don't fail the main operation if user update fails
                    }
                }

                toast({ title: "Profesional actualizado con éxito" });
            } else { // CREATE MODE
                const newProfessionalId = doc(collection(db, 'profesionales')).id;
                const newUserId = doc(collection(db, 'usuarios')).id;

                const userData = {
                    name: profData.name,
                    email: profData.email,
                    role: 'Staff',
                    local_id: profData.local_id || '',
                    avatarUrl: profData.avatarUrl || '',
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
            setUploadedImages([]);
            onDataSaved();
        } catch (error: any) {
            console.error("Error saving professional:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: `No se pudo guardar el profesional. ${error.message || ''}`,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent auto-close if triggered by Action
        e.stopPropagation();
        if (!profesional || !db) return;

        setIsDeleting(true);
        try {
            // Delete avatar from storage if it exists
            if (profesional.avatarUrl) {
                try {
                    const imageRef = ref(storage, profesional.avatarUrl);
                    await deleteObject(imageRef);
                } catch (error: any) {
                    console.warn("Could not delete avatar image:", error);
                }
            }

            await deleteDoc(doc(db, 'profesionales', profesional.id));
            if (profesional.userId) {
                await deleteDoc(doc(db, 'usuarios', profesional.userId));
            }
            if (uploadedImages.length > 0) {
                await Promise.all(uploadedImages.map(async (url) => {
                    try {
                        const imageRef = ref(storage, url);
                        await deleteObject(imageRef);
                    } catch (error) {
                        console.warn("Error cleaning up image:", error);
                    }
                }));
            }
            toast({ title: "Profesional eliminado con éxito" });
            setShowDeleteConfirm(false);
            onDataSaved();
        } catch (error: any) {
            console.error("Error deleting professional:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: `No se pudo eliminar el profesional: ${error.message}`,
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
            if (day.id !== fromDayId) {
                form.setValue(`schedule.${day.id as keyof Schedule}.enabled`, sourceSchedule.enabled);
                form.setValue(`schedule.${day.id as keyof Schedule}.start`, sourceSchedule.start);
                form.setValue(`schedule.${day.id as keyof Schedule}.end`, sourceSchedule.end);
            }
        });
        toast({ title: 'Horario copiado', description: `El horario de ${dayLabel} ha sido copiado a los otros días.` });
    }

    const addBreak = (dayId: string) => {
        const currentBreaks = form.getValues(`schedule.${dayId}.breaks` as any) || [];
        form.setValue(`schedule.${dayId}.breaks` as any, [
            ...currentBreaks,
            { start: '13:00', end: '14:00' }
        ]);
    };

    const removeBreak = (dayId: string, index: number) => {
        const currentBreaks = form.getValues(`schedule.${dayId}.breaks` as any) || [];
        const newBreaks = currentBreaks.filter((_: any, i: number) => i !== index);
        form.setValue(`schedule.${dayId}.breaks` as any, newBreaks);
    };

    const schedule = form.watch('schedule');
    const selectedServices = form.watch('services');

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && handleCloseModal()}>
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
                                    {daysOfWeek.map((day) => {
                                        const daySchedule = schedule?.[day.id as keyof Schedule];
                                        const breaks = daySchedule?.breaks || [];

                                        return (
                                            <div key={day.id} className="border-b pb-4 mb-4">
                                                <div className="grid grid-cols-6 items-center gap-4 mb-2">
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
                                                                <Select onValueChange={field.onChange} value={field.value} disabled={!daySchedule?.enabled}>
                                                                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                                                                <Select onValueChange={field.onChange} value={field.value} disabled={!daySchedule?.enabled}>
                                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                                    <SelectContent>
                                                                        {timeOptions.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        />
                                                    </div>
                                                    <div className="col-span-2 flex items-center gap-2 justify-end">
                                                        <Button variant="outline" size="sm" type="button" onClick={() => addBreak(day.id)} disabled={!daySchedule?.enabled}><Plus className="mr-2 h-4 w-4" />Descanso</Button>
                                                        <Button variant="ghost" size="sm" type="button" onClick={() => copySchedule(day.id)}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                                                    </div>
                                                </div>

                                                {/* Breaks List */}
                                                {breaks.map((_, index) => (
                                                    <div key={index} className="grid grid-cols-6 items-center gap-4 mt-2 bg-slate-50 p-2 rounded-md">
                                                        <div className="col-span-1 text-right text-xs font-medium text-muted-foreground mr-2">
                                                            Descanso {index + 1}
                                                        </div>
                                                        <div className="col-span-3 grid grid-cols-2 gap-2 items-center">
                                                            <Controller
                                                                name={`schedule.${day.id}.breaks.${index}.start` as any}
                                                                control={form.control}
                                                                render={({ field }) => (
                                                                    <Select onValueChange={field.onChange} value={field.value} disabled={!daySchedule?.enabled}>
                                                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                                        <SelectContent>
                                                                            {timeOptions.map(time => <SelectItem key={`break-start-${time}`} value={time}>{time}</SelectItem>)}
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                            />
                                                            <Controller
                                                                name={`schedule.${day.id}.breaks.${index}.end` as any}
                                                                control={form.control}
                                                                render={({ field }) => (
                                                                    <Select onValueChange={field.onChange} value={field.value} disabled={!daySchedule?.enabled}>
                                                                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                                        <SelectContent>
                                                                            {timeOptions.map(time => <SelectItem key={`break-end-${time}`} value={time}>{time}</SelectItem>)}
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                            />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                type="button"
                                                                className="text-destructive hover:text-destructive h-8 px-2"
                                                                onClick={() => removeBreak(day.id, index)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
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
                                                    onUploadStateChange={setIsUploading}
                                                    onUpload={(url) => {
                                                        setUploadedImages(prev => [...prev, url]);
                                                        form.setValue('avatarUrl', url, { shouldDirty: true });
                                                    }}
                                                    onRemove={() => form.setValue('avatarUrl', '', { shouldDirty: true })}
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
                                                <Button variant="destructive" type="button" onClick={() => setShowDeleteConfirm(true)}>
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
                            <Button variant="ghost" type="button" onClick={handleCloseModal}>Cerrar</Button>
                            <Button type="submit" disabled={isSubmitting || isUploading}>
                                {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción es irreversible. Se eliminará permanentemente al profesional "{profesional?.name}".
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Sí, eliminar
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
