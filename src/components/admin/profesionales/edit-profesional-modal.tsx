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
import { Loader2, Copy, Plus, Trash2, UploadCloud, User, X, Clock, Camera, Globe, Check, AlertCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney } from '@/lib/utils';
import { addDoc, collection, doc, updateDoc, deleteDoc, Timestamp, setDoc, getDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
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
    const [openCategories, setOpenCategories] = useState<string[]>([]);

    useEffect(() => {
        if (servicesByCategory.length > 0 && openCategories.length === 0) {
            setOpenCategories(servicesByCategory.map(c => c.category));
        }
    }, [servicesByCategory, openCategories.length]);

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
        const options = [];
        for (let t = 0; t < 24 * 60; t += 30) {
            const h = Math.floor(t / 60);
            const m = t % 60;
            options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
        return options;
    }, []);

    const getFilteredTimeOptions = useMemo(() => {
        return (dayId: string) => {
            if (!locales || locales.length === 0) return timeOptions;
            const shopSchedule = locales.find(l => l.id === form.watch('local_id'))?.schedule || defaultSchedule;
            const daySchedule = shopSchedule[dayId as keyof Schedule];

            if (!daySchedule || !daySchedule.enabled) {
                // Return no available times if shop is closed that day,
                // or just default to 10 - 20 if we want a fallback.
                return []; 
            }

            const [startH, startM] = daySchedule.start.split(':').map(Number);
            const [endH, endM] = daySchedule.end.split(':').map(Number);
            const minTime = startH * 60 + startM;
            const maxTime = endH * 60 + endM;

            return timeOptions.filter(time => {
                const [h, m] = time.split(':').map(Number);
                const tMins = h * 60 + m;
                return tMins >= minTime && tMins <= maxTime;
            });
        };
    }, [locales, form, timeOptions, defaultSchedule]);

    useEffect(() => {
        if (isOpen) {
            const defaultValues = profesional ?
                { ...profesional, schedule: profesional.schedule || defaultSchedule, publicName: profesional.publicName || '' }
                : {
                    name: '', publicName: '', email: '', active: true, acceptsOnline: true, services: [],
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
            delete profDataRaw.id;

            const profData = cleanData(profDataRaw);

            // Sync services logic
            const syncServices = async (profId: string, newServices: string[]) => {
                const oldServices = profesional?.services || [];
                const addedServices = newServices.filter(s => !oldServices.includes(s));
                const removedServices = oldServices.filter(s => !newServices.includes(s));
                const existingServiceIds = new Set(services.map(s => s.id));

                const batch = writeBatch(db);
                let batchCount = 0;

                // For added services, add professional ID to service.professionals
                for (const serviceId of addedServices) {
                    if (existingServiceIds.has(serviceId)) {
                        const serviceRef = doc(db, 'servicios', serviceId);
                        batch.update(serviceRef, {
                            professionals: arrayUnion(profId)
                        });
                        batchCount++;
                    }
                }

                // For removed services, remove professional ID from service.professionals
                for (const serviceId of removedServices) {
                    if (existingServiceIds.has(serviceId)) {
                        const serviceRef = doc(db, 'servicios', serviceId);
                        batch.update(serviceRef, {
                            professionals: arrayRemove(profId)
                        });
                        batchCount++;
                    }
                }

                if (batchCount > 0) {
                    await batch.commit();
                }
            };

            if (profesional) { // EDIT MODE
                const profId = profesional.id;
                const profRef = doc(db, 'profesionales', profId);
                await updateDoc(profRef, profData);

                // Sync services
                await syncServices(profId, profData.services || []);

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
                            console.warn(`Linked user document ${profesional.userId} not found associated with professional ${profId}. Skipping user update.`);
                        }
                    } catch (userUpdateError) {
                        console.error("Error updating linked user document:", userUpdateError);
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

                // Sync services for new professional (all selected services are "added")
                await syncServices(newProfessionalId, profData.services || []);

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
        e.preventDefault();
        e.stopPropagation();

        if (!profesional || !db) return;

        setIsDeleting(true);
        try {
            // Soft delete: Mark as deleted and inactive
            const profRef = doc(db, 'profesionales', profesional.id);
            await updateDoc(profRef, {
                deleted: true,
                active: false,
                deletedAt: Timestamp.now()
            });

            // Remove professional ID from all linked services so service professional counts stay accurate
            const linkedServices = services.filter(s => Array.isArray(s.professionals) && s.professionals.includes(profesional.id));
            if (linkedServices.length > 0) {
                const cleanupBatch = writeBatch(db);
                linkedServices.forEach(s => {
                    cleanupBatch.update(doc(db, 'servicios', s.id), {
                        professionals: arrayRemove(profesional.id)
                    });
                });
                await cleanupBatch.commit();
            }

            toast({ title: "Profesional eliminado con éxito" });
            setShowDeleteConfirm(false);
            onDataSaved();
            onClose();
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
    const rawSelectedServices = form.watch('services');
    const selectedServices = useMemo(() => {
        const arr = Array.isArray(rawSelectedServices) ? rawSelectedServices : [];
        if (servicesLoading) return arr;
        const validIds = new Set(allServices);
        return arr.filter((id: string) => validIds.has(id));
    }, [rawSelectedServices, allServices, servicesLoading]);

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && handleCloseModal()}>
                <DialogContent hideCloseButton={true} className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-3.5 sm:p-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                        <div className="header-light-beam absolute inset-0 pointer-events-none" />
                        <div className="flex items-center gap-2.5 z-10">
                            <User className="h-5 w-5 text-slate-300 shrink-0" />
                            <div>
                                <h2 className="text-sm sm:text-base font-bold text-white">
                                    {profesional ? `Editando: ${profesional.name}` : 'Nuevo Profesional'}
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-300">
                                    Modifica la información, servicios y horarios del profesional
                                </p>
                            </div>
                        </div>
                        <button 
                            type="button" 
                            onClick={handleCloseModal}
                            className="z-10 rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Cerrar modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden p-3.5 sm:p-5">
                        <Tabs defaultValue="basic" className="flex-1 flex flex-col overflow-hidden">
                            <TabsList className="mb-3.5 sm:mb-4 flex-shrink-0 bg-muted/20 border border-border/60 p-1 rounded-xl grid grid-cols-3 h-auto">
                                <TabsTrigger 
                                    value="basic" 
                                    className="text-xs sm:text-sm py-2 px-3 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-all font-medium"
                                >
                                    <User className="h-4 w-4 text-slate-400" />
                                    <span>Datos básicos</span>
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="schedule" 
                                    className="text-xs sm:text-sm py-2 px-3 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-all font-medium"
                                >
                                    <Clock className="h-4 w-4 text-slate-400" />
                                    <span>Horario</span>
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="profile" 
                                    className="text-xs sm:text-sm py-2 px-3 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-all font-medium"
                                >
                                    <Camera className="h-4 w-4 text-slate-400" />
                                    <span>Perfil y Foto</span>
                                </TabsTrigger>
                            </TabsList>
                            <ScrollArea className="flex-1 pr-2 sm:pr-4 overflow-y-auto">
                                <TabsContent value="basic" className="space-y-4 sm:space-y-5 mt-0 pr-1">
                                    {/* Grid de campos 2x2 simétricos */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="name" className="text-xs font-semibold text-foreground">
                                                Nombre Completo (Interno) *
                                            </Label>
                                            <Input 
                                                id="name" 
                                                {...form.register('name', { required: true })} 
                                                placeholder="Ej. Beatriz Martínez" 
                                                className="h-9 text-xs sm:text-sm bg-background border-border/60"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="publicName" className="text-xs font-semibold text-foreground">
                                                    Nombre Público (Web)
                                                </Label>
                                                <span className="text-[10px] text-muted-foreground">Visible para clientes</span>
                                            </div>
                                            <Input 
                                                id="publicName" 
                                                {...form.register('publicName')} 
                                                placeholder="Ej. Bety" 
                                                className="h-9 text-xs sm:text-sm bg-background border-border/60"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                                                Correo Electrónico *
                                            </Label>
                                            <Input 
                                                id="email" 
                                                type="email" 
                                                {...form.register('email')} 
                                                placeholder="profesional@vatosalfa.com" 
                                                className="h-9 text-xs sm:text-sm bg-background border-border/60"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="local_id" className="text-xs font-semibold text-foreground">
                                                Sucursal Asignada
                                            </Label>
                                            <Controller
                                                control={form.control}
                                                name="local_id"
                                                render={({ field }) => (
                                                    <Select onValueChange={field.onChange} value={field.value} disabled={localesLoading}>
                                                        <SelectTrigger id="local_id" className="h-9 text-xs sm:text-sm bg-background border-border/60">
                                                            <SelectValue placeholder="Seleccionar sucursal..." />
                                                        </SelectTrigger>
                                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                                            {locales.map(loc => (
                                                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* Tarjeta de Reservas en línea */}
                                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3 sm:p-3.5 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <Globe className="h-4 w-4 text-blue-400 shrink-0" />
                                            <div>
                                                <Label htmlFor="acceptsOnline" className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground block">
                                                    Acepta reservas en línea
                                                </Label>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Los clientes podrán agendar citas con este profesional desde la web de reservas.
                                                </p>
                                            </div>
                                        </div>
                                        <Controller
                                            name="acceptsOnline"
                                            control={form.control}
                                            render={({ field }) => (
                                                <Switch id="acceptsOnline" checked={field.value} onCheckedChange={field.onChange} />
                                            )}
                                        />
                                    </div>

                                    {/* Sección de Servicios Asignados */}
                                    <div className="space-y-3 pt-3 border-t border-border/40">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs sm:text-sm font-bold text-foreground">
                                                        Servicios Asignados al Profesional
                                                    </h4>
                                                    <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-[11px] font-medium">
                                                        {Array.isArray(selectedServices) ? selectedServices.length : 0} de {allServices.length}
                                                    </Badge>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Marca los servicios que este profesional puede realizar en cabina.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[11px] border-border/60 text-foreground hover:bg-muted/20 gap-1.5 px-2.5"
                                                    onClick={() => {
                                                        const isAllSelected = selectedServices?.length === allServices.length;
                                                        form.setValue('services', isAllSelected ? [] : allServices, { shouldDirty: true });
                                                    }}
                                                >
                                                    <Check className={cn("h-3 w-3", selectedServices?.length === allServices.length ? "text-blue-400" : "text-slate-400")} />
                                                    {selectedServices?.length === allServices.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                                </Button>
                                            </div>
                                        </div>

                                        <Accordion 
                                            type="multiple" 
                                            value={openCategories} 
                                            onValueChange={setOpenCategories} 
                                            className="space-y-2"
                                        >
                                            {servicesByCategory.map(category => {
                                                const catSelectedCount = category.services.filter(s => Array.isArray(selectedServices) && selectedServices.includes(s.id)).length;
                                                const catTotal = category.services.length;

                                                return (
                                                    <AccordionItem 
                                                        key={category.category} 
                                                        value={category.category}
                                                        className="rounded-xl border border-border/60 bg-card/60 overflow-hidden"
                                                    >
                                                        <AccordionTrigger className="hover:no-underline py-2.5 px-3 hover:bg-muted/20 transition-colors">
                                                            <div className="flex items-center justify-between w-full pr-2">
                                                                <span className="font-semibold text-xs sm:text-sm text-foreground">
                                                                    {category.category}
                                                                </span>
                                                                <Badge 
                                                                    variant="outline" 
                                                                    className={cn(
                                                                        "text-[10px] h-5 py-0 px-2 font-medium",
                                                                        catSelectedCount > 0 
                                                                            ? "border-blue-500/40 text-blue-400 bg-blue-500/10" 
                                                                            : "border-border/60 text-muted-foreground bg-muted/20"
                                                                    )}
                                                                >
                                                                    {catSelectedCount} de {catTotal} seleccionados
                                                                </Badge>
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent className="p-3 pt-1 border-t border-border/40">
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                                                                {category.services.map(service => {
                                                                    const isChecked = Array.isArray(selectedServices) && selectedServices.includes(service.id);
                                                                    return (
                                                                        <div
                                                                            key={service.id}
                                                                            onClick={() => {
                                                                                const currentVal = form.getValues('services') || [];
                                                                                const newVal = isChecked
                                                                                    ? currentVal.filter((id: string) => id !== service.id)
                                                                                    : [...currentVal, service.id];
                                                                                form.setValue('services', newVal, { shouldDirty: true });
                                                                            }}
                                                                            className={cn(
                                                                                "flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all select-none",
                                                                                isChecked
                                                                                    ? "border-blue-500/40 bg-blue-500/10 text-foreground font-medium shadow-sm"
                                                                                    : "border-border/40 hover:border-border/80 bg-background/50 text-muted-foreground"
                                                                            )}
                                                                        >
                                                                            <div className="flex items-center gap-2 min-w-0 pr-2">
                                                                                <Checkbox
                                                                                    id={service.id}
                                                                                    checked={isChecked}
                                                                                    onCheckedChange={(checked) => {
                                                                                        const currentVal = form.getValues('services') || [];
                                                                                        const newVal = checked
                                                                                            ? [...currentVal, service.id]
                                                                                            : currentVal.filter((id: string) => id !== service.id);
                                                                                        form.setValue('services', newVal, { shouldDirty: true });
                                                                                    }}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                />
                                                                                <span className={cn("truncate", isChecked ? "text-foreground font-semibold" : "text-foreground/80")}>
                                                                                    {service.name}
                                                                                </span>
                                                                            </div>
                                                                            {service.price !== undefined && (
                                                                                <span className={cn("text-xs font-semibold shrink-0", isChecked ? "text-foreground" : "text-foreground/80")}>
                                                                                    ${formatMoney(Number(service.price))}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                );
                                            })}
                                        </Accordion>
                                    </div>
                                </TabsContent>
                                <TabsContent value="schedule" className="space-y-2.5 mt-0 pr-1">
                                    <div className="p-2 sm:p-2.5 bg-muted/10 rounded-xl border border-border/60 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                            <span className="font-semibold text-foreground">Horario Semanal y Descansos</span>
                                        </div>
                                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                                            💡 Usa "Copiar" en cualquier día para replicar su horario al resto de la semana.
                                        </span>
                                    </div>

                                    <div className="rounded-xl border border-border/60 bg-card/60 divide-y divide-border/40 overflow-hidden shadow-xs">
                                        {daysOfWeek.map((day) => {
                                            const daySchedule = schedule?.[day.id as keyof Schedule];
                                            const breaks = daySchedule?.breaks || [];
                                            const isEnabled = !!daySchedule?.enabled;

                                            return (
                                                <div 
                                                    key={day.id} 
                                                    className={cn(
                                                        "p-2 sm:px-3.5 sm:py-2 transition-colors",
                                                        !isEnabled ? "bg-muted/5 opacity-75" : "hover:bg-muted/10"
                                                    )}
                                                >
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                                                        {/* Left: Switch + Day Name + Badge */}
                                                        <div className="flex items-center justify-between sm:justify-start gap-2.5 shrink-0 sm:w-48">
                                                            <div className="flex items-center gap-2">
                                                                <Controller
                                                                    name={`schedule.${day.id}.enabled` as any}
                                                                    control={form.control}
                                                                    render={({ field }) => (
                                                                        <Switch id={`switch-${day.id}`} checked={field.value} onCheckedChange={field.onChange} className="scale-90" />
                                                                    )}
                                                                />
                                                                <Label htmlFor={`switch-${day.id}`} className="capitalize font-semibold text-xs sm:text-sm text-foreground cursor-pointer select-none">
                                                                    {day.label}
                                                                </Label>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 sm:hidden">
                                                                <Badge 
                                                                    variant="outline" 
                                                                    className={cn(
                                                                        "text-[10px] h-5 py-0 px-2 font-medium shrink-0",
                                                                        isEnabled 
                                                                            ? "border-blue-500/40 text-blue-400 bg-blue-500/10" 
                                                                            : "border-border/60 text-muted-foreground bg-muted/20"
                                                                    )}
                                                                >
                                                                    {isEnabled ? 'Laboral' : 'Descanso'}
                                                                </Badge>
                                                                {isEnabled && (
                                                                    <>
                                                                        <Button 
                                                                            variant="outline" 
                                                                            size="sm" 
                                                                            type="button" 
                                                                            className="h-6.5 text-[11px] border-border/60 text-foreground hover:bg-muted/20 gap-1 px-2"
                                                                            onClick={() => addBreak(day.id)} 
                                                                            title="Agregar descanso"
                                                                        >
                                                                            <Plus className="h-3 w-3 text-slate-400" />
                                                                            <span>Descanso</span>
                                                                        </Button>
                                                                        <Button 
                                                                            variant="outline" 
                                                                            size="sm" 
                                                                            type="button" 
                                                                            className="h-6.5 text-[11px] border-border/60 text-foreground hover:bg-muted/20 px-2"
                                                                            onClick={() => copySchedule(day.id)}
                                                                            title="Copiar a todos"
                                                                        >
                                                                            <Copy className="h-3 w-3 text-slate-400" />
                                                                        </Button>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {/* Desktop Badge */}
                                                            <Badge 
                                                                variant="outline" 
                                                                className={cn(
                                                                    "hidden sm:inline-flex text-[10px] h-5 py-0 px-2 font-medium shrink-0 ml-auto mr-1",
                                                                    isEnabled 
                                                                        ? "border-blue-500/40 text-blue-400 bg-blue-500/10" 
                                                                            : "border-border/60 text-muted-foreground bg-muted/20"
                                                                )}
                                                            >
                                                                {isEnabled ? 'Laboral' : 'Descanso'}
                                                            </Badge>
                                                        </div>

                                                        {/* Center: Hours Range or Descanso message */}
                                                        <div className="flex-1 flex items-center justify-start gap-2">
                                                            {isEnabled ? (
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] text-muted-foreground shrink-0 hidden md:inline">Horario:</span>
                                                                    <Controller
                                                                        name={`schedule.${day.id}.start` as any}
                                                                        control={form.control}
                                                                        render={({ field }) => (
                                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                                <SelectTrigger className="h-7 w-[82px] sm:w-[86px] text-xs bg-background border-border/60 font-medium px-2">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] max-h-56">
                                                                                    {getFilteredTimeOptions(day.id).map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        )}
                                                                    />
                                                                    <span className="text-xs text-muted-foreground font-medium px-0.5">a</span>
                                                                    <Controller
                                                                        name={`schedule.${day.id}.end` as any}
                                                                        control={form.control}
                                                                        render={({ field }) => (
                                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                                <SelectTrigger className="h-7 w-[82px] sm:w-[86px] text-xs bg-background border-border/60 font-medium px-2">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] max-h-56">
                                                                                    {getFilteredTimeOptions(day.id).map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        )}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground/70 italic py-0.5 sm:py-0">
                                                                    Día libre asignado para este profesional
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Right: Actions on Desktop */}
                                                        <div className="hidden sm:flex items-center justify-end gap-1.5 shrink-0">
                                                            {isEnabled && (
                                                                <>
                                                                    <Button 
                                                                        variant="outline" 
                                                                        size="sm" 
                                                                        type="button" 
                                                                        className="h-7 text-xs border-border/60 text-foreground hover:bg-muted/20 gap-1 px-2.5"
                                                                        onClick={() => addBreak(day.id)} 
                                                                        title="Agregar descanso intermedio"
                                                                    >
                                                                        <Plus className="h-3.5 w-3.5 text-slate-400" />
                                                                        <span>Descanso</span>
                                                                    </Button>
                                                                    <Button 
                                                                        variant="outline" 
                                                                        size="sm" 
                                                                        type="button" 
                                                                        className="h-7 text-xs border-border/60 text-foreground hover:bg-muted/20 gap-1 px-2.5"
                                                                        onClick={() => copySchedule(day.id)}
                                                                        title="Copiar horario de este día a toda la semana"
                                                                    >
                                                                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                                                                        <span>Copiar a todos</span>
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Compact Breaks List */}
                                                    {isEnabled && breaks.length > 0 && (
                                                        <div className="space-y-1.5 pt-2 mt-2 border-t border-border/30 sm:pl-8">
                                                            {breaks.map((_, index) => (
                                                                <div key={index} className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-lg bg-muted/20 border border-border/30 text-xs">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[11px] text-muted-foreground font-medium shrink-0">
                                                                            Descanso {index + 1}:
                                                                        </span>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Controller
                                                                                name={`schedule.${day.id}.breaks.${index}.start` as any}
                                                                                control={form.control}
                                                                                render={({ field }) => (
                                                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                                                        <SelectTrigger className="h-6.5 text-xs bg-background border-border/60 w-[80px] px-2 font-medium"><SelectValue /></SelectTrigger>
                                                                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] max-h-56">
                                                                                            {getFilteredTimeOptions(day.id).map(time => <SelectItem key={`break-start-${time}`} value={time}>{time}</SelectItem>)}
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                )}
                                                                            />
                                                                            <span className="text-slate-400 text-xs">—</span>
                                                                            <Controller
                                                                                name={`schedule.${day.id}.breaks.${index}.end` as any}
                                                                                control={form.control}
                                                                                render={({ field }) => (
                                                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                                                        <SelectTrigger className="h-6.5 text-xs bg-background border-border/60 w-[80px] px-2 font-medium"><SelectValue /></SelectTrigger>
                                                                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] max-h-56">
                                                                                            {getFilteredTimeOptions(day.id).map(time => <SelectItem key={`break-end-${time}`} value={time}>{time}</SelectItem>)}
                                                                                        </SelectContent>
                                                                                    </Select>
                                                                                )}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        type="button"
                                                                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                                                                        onClick={() => removeBreak(day.id, index)}
                                                                        title="Eliminar descanso"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </TabsContent>
                                <TabsContent value="profile" className="space-y-4 sm:space-y-5 mt-0 pr-1">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="biography" className="text-xs font-semibold text-foreground">Biografía o Presentación</Label>
                                        <Textarea 
                                            id="biography" 
                                            rows={4} 
                                            {...form.register('biography')} 
                                            placeholder="Cuéntale a tus clientes sobre la experiencia, estilo y especialidades de este profesional..." 
                                            className="text-xs font-sans leading-relaxed text-foreground bg-background border-border/60 focus-visible:ring-blue-500/30"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-foreground">Foto del profesional</Label>
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
                                        <div className="pt-4 border-t border-border/40">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                                                <Trash2 className="h-3.5 w-3.5" /> Zona de Peligro
                                            </h4>
                                            <div className="mt-2 p-3 sm:p-3.5 rounded-xl border border-red-500/30 bg-red-500/5 space-y-3">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-semibold text-xs sm:text-sm text-foreground">Desactivar o Eliminar Profesional</p>
                                                        <p className="text-[11px] text-muted-foreground">Esta acción retirará al profesional de las listas y futuras reservas.</p>
                                                    </div>

                                                    {!showDeleteConfirm ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            type="button"
                                                            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 text-xs shrink-0 gap-1.5"
                                                            onClick={() => setShowDeleteConfirm(true)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Eliminar Profesional
                                                        </Button>
                                                    ) : null}
                                                </div>

                                                {showDeleteConfirm && (
                                                    <div className="p-3 bg-card rounded-lg border border-red-500/40 animate-in fade-in slide-in-from-top-2 space-y-2.5">
                                                        <p className="text-xs font-medium text-foreground">¿Estás seguro de eliminar a <strong className="text-red-400">{profesional.name}</strong>? Esta acción no se puede deshacer.</p>
                                                        <div className="flex gap-2 justify-end">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 text-xs border-border/60"
                                                                onClick={() => setShowDeleteConfirm(false)}
                                                                disabled={isDeleting}
                                                            >
                                                                Cancelar
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                className="h-7 text-xs gap-1.5 px-3"
                                                                onClick={handleDelete}
                                                                disabled={isDeleting}
                                                            >
                                                                {isDeleting && <Loader2 className="h-3 w-3 animate-spin" />}
                                                                Sí, eliminar definitivamente
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>
                            </ScrollArea>
                        </Tabs>
                        <DialogFooter className="pt-3 border-t border-border/40 flex-shrink-0 flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" type="button" onClick={handleCloseModal} className="h-8 text-xs border-border/60">
                                Cancelar
                            </Button>
                            <Button variant="alfa" size="sm" type="submit" disabled={isSubmitting || isUploading} className="h-8 px-5 text-xs">
                                {(isSubmitting || isUploading) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                Guardar Profesional
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
