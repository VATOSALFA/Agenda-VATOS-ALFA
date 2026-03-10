'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { storage } from '@/lib/firebase-client';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, addDoc, updateDoc, doc, deleteDoc, Timestamp } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { Promotion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Calendar, Image as ImageIcon, X } from 'lucide-react';
import { CustomLoader } from '@/components/ui/custom-loader';

const promotionSchema = z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    startDate: z.string().min(1, 'La fecha inicial es requerida'), // Input type="date" returns string
    endDate: z.string().min(1, 'La fecha final es requerida'),
    description: z.string().min(1, 'La descripción es requerida'),
    termsAndConditions: z.string().optional(),
    active: z.boolean().default(true),
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

export default function PromotionsPage() {
    const { user, db } = useAuth();
    const { data: promotions, loading, error } = useFirestoreQuery<Promotion>('promociones');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<PromotionFormValues>({
        resolver: zodResolver(promotionSchema),
        defaultValues: {
            name: '',
            startDate: '',
            endDate: '',
            description: '',
            termsAndConditions: '',
            active: true,
        },
    });

    const handleAddNew = () => {
        setSelectedPromotion(null);
        setImageFile(null);
        setImagePreview(null);
        form.reset({
            name: '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            description: '',
            termsAndConditions: '',
            active: true,
        });
        setIsDialogOpen(true);
    };

    const handleEdit = (promotion: Promotion) => {
        setSelectedPromotion(promotion);
        setImageFile(null);
        setImagePreview(promotion.imageUrl || null);

        // Convert timestamps/dates to YYYY-MM-DD string
        const formatInputDate = (dateVal: any) => {
            if (!dateVal) return '';
            if (dateVal instanceof Timestamp) return format(dateVal.toDate(), 'yyyy-MM-dd');
            if (dateVal instanceof Date) return format(dateVal, 'yyyy-MM-dd');
            if (typeof dateVal === 'string') return dateVal.split('T')[0];
            return '';
        };

        form.reset({
            name: promotion.name,
            startDate: formatInputDate(promotion.startDate),
            endDate: formatInputDate(promotion.endDate),
            description: promotion.description,
            termsAndConditions: promotion.termsAndConditions || '',
            active: promotion.active,
        });
        setIsDialogOpen(true);
    };

    const handleDeleteClick = (promotion: Promotion) => {
        setSelectedPromotion(promotion);
        setIsDeleteDialogOpen(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const onSubmit = async (values: PromotionFormValues) => {
        if (!db) return;
        setIsSubmitting(true);

        try {
            let imageUrl = selectedPromotion?.imageUrl || '';

            if (imageFile) {
                // Upload new image
                const storageRef = ref(storage, `promotions/${Date.now()}_${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);

                // Optional: Delete old image if exists and replaced
                // if (selectedPromotion?.imageUrl) { ... delete logic ... } 
            }

            // Parse dates to Timestamps/Dates
            // Usually keeping as string or Date object is fine, but Firestore prefers Timestamp or Date
            // Let's store as string ISO or Date. Let's use Date for consistency with filters later.
            // But inputs are YYYY-MM-DD strings.
            // We'll store as string in YYYY-MM-DD for simplicity or use parsed Date at midnight?
            // User says "Fecha inicial/final". 
            // Firestore Timestamp is best.

            const startTimestamp = Timestamp.fromDate(new Date(values.startDate + 'T00:00:00'));
            const endTimestamp = Timestamp.fromDate(new Date(values.endDate + 'T23:59:59'));

            const promotionData = {
                name: values.name,
                startDate: values.startDate, // Storing as string YYYY-MM-DD is often easier for retrieval/display without timezone issues unless strict time is needed. 
                // But user asked for "Fecha". Use string or Timestamp. I'll stick to string YYYY-MM-DD for simpler admin editing.
                // Wait, filtering by date usually needs sortable format. YYYY-MM-DD is sortable.
                // Let's store as is from input.
                endDate: values.endDate,
                imageUrl,
                description: values.description,
                termsAndConditions: values.termsAndConditions,
                active: values.active,
                updatedAt: Timestamp.now(),
            };

            if (selectedPromotion) {
                await updateDoc(doc(db, 'promociones', selectedPromotion.id), promotionData);
                toast({ title: 'Promoción actualizada', description: 'Los cambios se han guardado correctamente.' });
            } else {
                await addDoc(collection(db, 'promociones'), {
                    ...promotionData,
                    createdAt: Timestamp.now(),
                });
                toast({ title: 'Promoción creada', description: 'La nueva promoción ha sido agregada.' });
            }

            setIsDialogOpen(false);
        } catch (error) {
            console.error('Error saving promotion:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la promoción.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!selectedPromotion || !db) return;
        try {
            await deleteDoc(doc(db, 'promociones', selectedPromotion.id));
            // Optionally delete image from storage if you want to be clean
            toast({ title: 'Promoción eliminada', description: 'La promoción ha sido eliminada correctamente.' });
        } catch (error) {
            console.error('Error deleting promotion:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la promoción.' });
        } finally {
            setIsDeleteDialogOpen(false);
            setSelectedPromotion(null);
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><CustomLoader /></div>;
    if (!user?.local_id && user?.role !== 'Administrador general') return <div className="p-8">No tienes permisos para ver esto.</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Promociones</h2>
                    <p className="text-muted-foreground">Gestiona las ofertas y promociones visibles para tus clientes.</p>
                </div>
                <Button onClick={handleAddNew}>
                    <Plus className="mr-2 h-4 w-4" /> Nueva Promoción
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {promotions && promotions.length > 0 ? (
                    promotions.map((promo) => (
                        <Card key={promo.id} className="flex flex-col overflow-hidden">
                            <div className="relative h-48 w-full bg-muted">
                                {promo.imageUrl ? (
                                    <img src={promo.imageUrl} alt={promo.name} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-muted-foreground">
                                        <ImageIcon className="h-12 w-12 opacity-20" />
                                    </div>
                                )}
                                {promo.active ? (
                                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">
                                        Activa
                                    </div>
                                ) : (
                                    <div className="absolute top-2 right-2 bg-gray-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">
                                        Inactiva
                                    </div>
                                )}
                            </div>
                            <CardHeader>
                                <CardTitle className="line-clamp-1">{promo.name}</CardTitle>
                                <CardDescription className="flex items-center gap-1 text-xs">
                                    <Calendar className="h-3 w-3" />
                                    {(() => {
                                        const fmt = (d: any) => {
                                            if (!d) return '';
                                            if (typeof d === 'string') return d;
                                            if (d?.toDate) return format(d.toDate(), 'dd/MM/yyyy');
                                            if (d instanceof Date) return format(d, 'dd/MM/yyyy');
                                            return '';
                                        };
                                        return `${fmt(promo.startDate)} - ${fmt(promo.endDate)}`;
                                    })()}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <p className="text-sm text-muted-foreground line-clamp-3">{promo.description}</p>
                            </CardContent>
                            <CardFooter className="flex justify-end gap-2 border-t pt-4">
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(promo)}>
                                    <Pencil className="h-4 w-4 mr-1" /> Editar
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteClick(promo)}>
                                    <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                                </Button>
                            </CardFooter>
                        </Card>
                    ))
                ) : (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg">
                        <div className="bg-muted/50 p-4 rounded-full mb-4">
                            <ImageIcon className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">No hay promociones creadas</h3>
                        <p className="text-muted-foreground max-w-sm mt-2 mb-4">
                            Crea tu primera promoción para atraer más clientes.
                        </p>
                        <Button onClick={handleAddNew}>
                            Crear Promoción
                        </Button>
                    </div>
                )}
            </div>

            {/* Edit/Create Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedPromotion ? 'Editar Promoción' : 'Nueva Promoción'}</DialogTitle>
                        <DialogDescription>
                            Complete los detalles de la promoción.
                        </DialogDescription>
                    </DialogHeader>

                    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>

                        <div className="space-y-4 rounded-lg border p-4">
                            <div className="flex justify-center">
                                {imagePreview ? (
                                    <div className="relative group w-64 h-64 rounded-lg overflow-hidden border">
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => { setImageFile(null); setImagePreview(null); }}
                                            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-64 h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <ImageIcon className="w-10 h-10 text-muted-foreground mb-3" />
                                            <p className="text-sm text-muted-foreground font-semibold">Click para subir imagen</p>
                                            <p className="text-xs text-muted-foreground text-center mt-1">
                                                PNG, JPG o GIF (MÁX. 5MB)
                                                <br />
                                                Recomendado: Cuadrado 1:1 (ej. 1080×1080px)
                                            </p>
                                        </div>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                    </label>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Nombre de la Promoción</Label>
                            <Input {...form.register('name')} placeholder="Ej. 2x1 en Cortes de Cabello" />
                            {form.formState.errors.name && <span className="text-destructive text-sm">{form.formState.errors.name.message}</span>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Fecha Inicial</Label>
                                <Input type="date" {...form.register('startDate')} />
                                {form.formState.errors.startDate && <span className="text-destructive text-sm">{form.formState.errors.startDate.message}</span>}
                            </div>
                            <div className="space-y-2">
                                <Label>Fecha Final</Label>
                                <Input type="date" {...form.register('endDate')} />
                                {form.formState.errors.endDate && <span className="text-destructive text-sm">{form.formState.errors.endDate.message}</span>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Descripción</Label>
                            <Textarea {...form.register('description')} placeholder="Detalles de lo que incluye la promoción..." rows={4} />
                            {form.formState.errors.description && <span className="text-destructive text-sm">{form.formState.errors.description.message}</span>}
                        </div>

                        <div className="space-y-2">
                            <Label>Términos y Condiciones (Opcional)</Label>
                            <Textarea {...form.register('termsAndConditions')} placeholder="Ej. Solo válido de Lunes a Miércoles..." rows={3} />
                        </div>

                        <div className="flex items-center space-x-2 rounded-lg border p-3 bg-muted/20">
                            <Switch
                                id="active-mode"
                                checked={form.watch('active')}
                                onCheckedChange={(checked) => form.setValue('active', checked)}
                            />
                            <div className="flex-1">
                                <Label htmlFor="active-mode" className="text-base font-medium">Promoción Activa</Label>
                                <p className="text-xs text-muted-foreground">Desactívala para ocultarla temporalmente sin eliminarla.</p>
                            </div>
                        </div>

                        <DialogFooter className="sticky bottom-0 bg-background pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {selectedPromotion ? 'Guardar Cambios' : 'Crear Promoción'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar Promoción?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. La promoción "{selectedPromotion?.name}" será eliminada permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
