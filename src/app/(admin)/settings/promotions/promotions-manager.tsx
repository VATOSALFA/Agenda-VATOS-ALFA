'use client';

import { useState, useMemo } from 'react';
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
import { optimizeImageForUpload } from '@/components/shared/image-uploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
    Loader2,
    Plus,
    Pencil,
    Trash2,
    Calendar as CalendarIcon,
    Image as ImageIcon,
    X,
    Eye,
    Video,
    Info,
    Share2,
    Tag,
    Sparkles,
    Clock,
    Search,
    LayoutGrid,
    List,
} from 'lucide-react';
import { CustomLoader } from '@/components/ui/custom-loader';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const promotionSchema = z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    startDate: z.string().min(1, 'La fecha inicial es requerida'), // Input type="date" returns string
    endDate: z.string().min(1, 'La fecha final es requerida'),
    description: z.string().min(1, 'La descripción es requerida'),
    termsAndConditions: z.string().optional(),
    active: z.boolean().default(true),
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

export function PromotionsManager({ hideHeader = false }: { hideHeader?: boolean } = {}) {
    const { user, db } = useAuth();
    const { data: promotions, loading, error } = useFirestoreQuery<Promotion>('promociones');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const [previewPromotion, setPreviewPromotion] = useState<Promotion | null>(null);
    const [showTerms, setShowTerms] = useState<Promotion | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [startDateOpen, setStartDateOpen] = useState(false);
    const [endDateOpen, setEndDateOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'todas' | 'activas' | 'inactivas'>('todas');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchTerm, setSearchTerm] = useState('');

    const parseDateSafe = (val: any): Date | undefined => {
        if (!val) return undefined;
        if (val instanceof Date && !isNaN(val.getTime())) return val;
        if (typeof val === 'object' && 'toDate' in val && typeof val.toDate === 'function') {
            try {
                return val.toDate();
            } catch {
                return undefined;
            }
        }
        if (typeof val === 'string') {
            const cleanStr = val.split('T')[0];
            const parts = cleanStr.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                const d = new Date(year, month, day);
                if (!isNaN(d.getTime())) return d;
            }
            const d = new Date(val);
            return isNaN(d.getTime()) ? undefined : d;
        }
        return undefined;
    };

    const isPromoExpired = (promo: Promotion) => {
        if (!promo.endDate) return false;
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const endDateObj = parseDateSafe(promo.endDate);
        if (!endDateObj) {
            if (typeof promo.endDate === 'string') {
                return today > promo.endDate.split('T')[0];
            }
            return false;
        }
        const endStr = format(endDateObj, 'yyyy-MM-dd');
        return today > endStr;
    };

    const formatDateDisplay = (d: any) => {
        if (!d) return '';
        try {
            const dateObj = parseDateSafe(d);
            if (dateObj) return format(dateObj, 'dd/MM/yyyy');
            if (typeof d === 'string') {
                const parts = d.split('T')[0].split('-');
                if (parts.length === 3) {
                    return `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
                return d;
            }
        } catch {
            return '';
        }
        return '';
    };

    const handleToggleActive = async (promoId: string, currentActive: boolean) => {
        if (!db) return;
        try {
            await updateDoc(doc(db, 'promociones', promoId), {
                active: !currentActive,
                updatedAt: Timestamp.now(),
            });
            toast({
                title: !currentActive ? "Promoción activada" : "Promoción pausada",
                description: !currentActive 
                    ? "La promoción ahora está visible para los clientes." 
                    : "La promoción se ha desactivado temporalmente.",
            });
        } catch (error) {
            console.error("Error toggling promo status:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cambiar el estado de la promoción.' });
        }
    };

    const allPromotions = useMemo(() => promotions || [], [promotions]);

    const activePromotions = useMemo(() => {
        return allPromotions.filter(p => p.active && !isPromoExpired(p));
    }, [allPromotions]);

    const inactivePromotions = useMemo(() => {
        return allPromotions.filter(p => !p.active || isPromoExpired(p));
    }, [allPromotions]);

    const currentTabPromotions = useMemo(() => {
        let list: Promotion[] = [];
        if (activeTab === 'todas') list = allPromotions;
        else if (activeTab === 'activas') list = activePromotions;
        else list = inactivePromotions;

        if (!searchTerm.trim()) return list;
        const q = searchTerm.toLowerCase();
        return list.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
        );
    }, [activeTab, allPromotions, activePromotions, inactivePromotions, searchTerm]);

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
                // Upload new image (optimizada para carga rápida y bajo consumo de datos)
                const fileToUpload = await optimizeImageForUpload(imageFile, { folder: 'promociones' });
                const safeName = (fileToUpload as File).name || imageFile.name;
                const storageRef = ref(storage, `promotions/${Date.now()}_${safeName}`);
                await uploadBytes(storageRef, fileToUpload, {
                    contentType: (fileToUpload as File).type || 'image/webp',
                });
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
                const newDocRef = await addDoc(collection(db, 'promociones'), {
                    ...promotionData,
                    createdAt: Timestamp.now(),
                });
                const url = `${window.location.origin}/promociones/${newDocRef.id}/terminos`;
                navigator.clipboard.writeText(url);
                toast({ title: 'Promoción creada', description: 'Se guardó correctamente y el link de sus términos se ha copiado al portapapeles.' });
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
        <div className="space-y-4 max-w-7xl pb-6">
            {!hideHeader ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-border/60">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Promociones y Ofertas</h2>
                        <p className="text-xs text-muted-foreground hidden sm:block">
                            Gestiona las ofertas, campañas y beneficios visuales visibles para tus clientes.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={handleAddNew} variant="alfa" className="h-8 sm:h-9 px-3.5 sm:px-4 text-xs font-semibold gap-1.5 w-fit">
                            <Plus className="h-3.5 w-3.5" />
                            <span>Nueva Promoción</span>
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border/60">
                    <div>
                        <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                            <Tag className="w-4 h-4 text-slate-400" />
                            <span>Promociones y Ofertas</span>
                        </h3>
                        <p className="text-xs text-muted-foreground hidden sm:block mt-0.5">
                            Cualquier promoción creada o editada aquí se sincroniza en tiempo real con la app móvil.
                        </p>
                    </div>
                    <Button onClick={handleAddNew} variant="alfa" className="h-8 px-3 text-xs font-semibold gap-1.5 w-fit">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Nueva Promoción</span>
                    </Button>
                </div>
            )}

            {/* Pestañas y Controles de Filtro */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full sm:w-auto">
                    <TabsList className="grid w-full sm:w-auto grid-cols-3 h-auto p-1 bg-muted/20 border border-border/60 rounded-xl">
                        <TabsTrigger
                            value="todas"
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>Todas ({allPromotions.length})</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="activas"
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>Activas ({activePromotions.length})</span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="inactivas"
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                        >
                            <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>Inactivas ({inactivePromotions.length})</span>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Buscar promoción..."
                            className="pl-8 h-8 text-xs rounded-lg border-border/70"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center border border-border/60 rounded-lg p-0.5 bg-muted/20 shrink-0">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                viewMode === 'grid' ? "bg-card text-foreground shadow-xs" : "text-slate-400 hover:text-white"
                            )}
                            title="Vista en tarjetas"
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                viewMode === 'list' ? "bg-card text-foreground shadow-xs" : "text-slate-400 hover:text-white"
                            )}
                            title="Vista compacta"
                        >
                            <List className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Listado de Promociones */}
            {currentTabPromotions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border/60 rounded-xl bg-muted/10">
                    <ImageIcon className="h-8 w-8 text-slate-400 mb-2 opacity-40" />
                    <h3 className="text-sm font-semibold text-foreground">No hay promociones en esta vista</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-3">
                        {activeTab === 'todas'
                            ? 'Crea tu primera promoción para atraer y fidelizar a más clientes.'
                            : activeTab === 'activas'
                            ? 'No tienes promociones activas actualmente.'
                            : 'No hay promociones inactivas o vencidas.'}
                    </p>
                    <Button onClick={handleAddNew} variant="alfa" className="h-8 px-4 text-xs font-semibold gap-1.5 w-fit">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Nueva Promoción</span>
                    </Button>
                </div>
            ) : viewMode === 'list' ? (
                /* VISTA LISTA COMPACTA (Ultra ligera en móvil) */
                <div className="space-y-2">
                    {currentTabPromotions.map((promo) => {
                        const expired = isPromoExpired(promo);
                        const active = promo.active && !expired;
                        return (
                            <div
                                key={promo.id}
                                className="rounded-xl border border-border/70 bg-card p-2.5 sm:p-3 shadow-xs flex items-center justify-between gap-3 hover:border-border transition-colors"
                            >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div
                                        className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-black/10 shrink-0 cursor-pointer border border-border/50 group"
                                        onClick={() => setPreviewPromotion(promo)}
                                        title="Ver arte completo"
                                    >
                                        {promo.imageUrl ? (
                                            (promo.imageUrl.toLowerCase().includes('.mp4') || promo.imageUrl.toLowerCase().includes('.webm') || (promo.imageUrl.includes('alt=media') && promo.imageUrl.includes('video'))) ? (
                                                <video src={promo.imageUrl} className="h-full w-full object-cover" muted playsInline />
                                            ) : (
                                                <img src={promo.imageUrl} alt={promo.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            )
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                <ImageIcon className="w-5 h-5 opacity-30" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <h4 className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">
                                                {promo.name}
                                            </h4>
                                            {active ? (
                                                <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-sans font-medium text-blue-400 border-blue-500/40 bg-blue-500/10">
                                                    Activa
                                                </Badge>
                                            ) : expired ? (
                                                <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-sans font-medium text-slate-400 border-slate-600 bg-slate-700/20">
                                                    Vencida
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-sans font-medium text-slate-400 border-slate-600 bg-slate-700/20">
                                                    Pausada
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                            <CalendarIcon className="h-3 w-3 text-slate-400 shrink-0" />
                                            <span>{formatDateDisplay(promo.startDate)} - {formatDateDisplay(promo.endDate)}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                    <Switch
                                        checked={promo.active}
                                        onCheckedChange={() => handleToggleActive(promo.id, promo.active)}
                                        className="scale-75"
                                        title={promo.active ? 'Pausar promoción' : 'Activar promoción'}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                                        onClick={() => {
                                            const url = `${window.location.origin}/promociones/${promo.id}`;
                                            navigator.clipboard.writeText(url);
                                            toast({
                                                title: "Link copiado",
                                                description: "Enlace público listo para compartir.",
                                            });
                                        }}
                                        title="Compartir link"
                                    >
                                        <Share2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <button
                                        type="button"
                                        className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                        onClick={() => handleEdit(promo)}
                                        title="Editar"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                        onClick={() => handleDeleteClick(promo)}
                                        title="Eliminar"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* VISTA CUADRÍCULA DE TARJETAS (Optimizada para Móvil y Desktop) */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {currentTabPromotions.map((promo) => {
                        const expired = isPromoExpired(promo);
                        const active = promo.active && !expired;
                        return (
                            <Card key={promo.id} className="flex flex-col overflow-hidden border border-border/70 shadow-xs">
                                <div
                                    className="relative aspect-[16/9] sm:aspect-square w-full bg-black/10 flex items-center justify-center overflow-hidden cursor-pointer group"
                                    onClick={() => setPreviewPromotion(promo)}
                                    title="Click para ver arte completo"
                                >
                                    {promo.imageUrl ? (
                                        (promo.imageUrl.toLowerCase().includes('.mp4') || promo.imageUrl.toLowerCase().includes('.webm') || (promo.imageUrl.includes('alt=media') && promo.imageUrl.includes('video'))) ? (
                                            <div className="relative w-full h-full">
                                                <video src={promo.imageUrl} className="h-full w-full object-cover group-hover:scale-102 transition-transform" autoPlay muted loop playsInline />
                                            </div>
                                        ) : (
                                            <img src={promo.imageUrl} alt={promo.name} className="h-full w-full object-cover group-hover:scale-102 transition-transform" />
                                        )
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-muted-foreground">
                                            <ImageIcon className="h-10 w-10 opacity-20" />
                                        </div>
                                    )}

                                    {/* Badge de Estado */}
                                    <div className={cn(
                                        "absolute top-2 right-2 text-[10px] font-sans font-medium px-2 py-0.5 rounded-full shadow-xs backdrop-blur-xs",
                                        active
                                            ? "bg-blue-600/90 text-white"
                                            : expired
                                            ? "bg-slate-800/90 text-slate-300"
                                            : "bg-slate-800/90 text-slate-300"
                                    )}>
                                        {active ? 'Activa' : expired ? 'Vencida' : 'Pausada'}
                                    </div>
                                </div>

                                <CardHeader className="p-3 sm:p-3.5 pb-1 sm:pb-2">
                                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate" title={promo.name}>
                                        {promo.name}
                                    </CardTitle>
                                    <CardDescription className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <CalendarIcon className="h-3 w-3 text-slate-400 shrink-0" />
                                        <span>{formatDateDisplay(promo.startDate)} - {formatDateDisplay(promo.endDate)}</span>
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="p-3 sm:p-3.5 pt-0 flex-1 flex flex-col justify-between space-y-2">
                                    <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed" title={promo.description}>
                                        {promo.description}
                                    </div>
                                    {promo.termsAndConditions && (
                                        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                                            <button
                                                type="button"
                                                onClick={() => setShowTerms(promo)}
                                                className="text-[11px] font-medium text-foreground hover:underline transition-colors"
                                            >
                                                Términos y condiciones
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const url = `${window.location.origin}/promociones/${promo.id}/terminos`;
                                                    navigator.clipboard.writeText(url);
                                                    toast({
                                                        title: "Link copiado",
                                                        description: "El enlace de los términos se ha copiado al portapapeles.",
                                                    });
                                                }}
                                                className="text-slate-400 hover:text-white transition-colors p-0.5"
                                                title="Copiar Link de Términos"
                                            >
                                                <Share2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </CardContent>

                                <CardFooter className="flex items-center justify-between gap-1.5 border-t border-border/50 py-2 px-3 bg-muted/5">
                                    <div className="flex items-center gap-1.5">
                                        <Switch
                                            checked={promo.active}
                                            onCheckedChange={() => handleToggleActive(promo.id, promo.active)}
                                            className="scale-75 origin-left"
                                            title={promo.active ? 'Pausar promoción' : 'Activar promoción'}
                                        />
                                        <span className="text-[10px] font-sans font-medium text-muted-foreground">
                                            {promo.active ? 'Activa' : 'Pausada'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const url = `${window.location.origin}/promociones/${promo.id}`;
                                                navigator.clipboard.writeText(url);
                                                toast({
                                                    title: "Link copiado",
                                                    description: "Enlace público listo para compartir.",
                                                });
                                            }}
                                            className="h-7 px-2 text-[11px] rounded-lg border-border/80 text-muted-foreground hover:text-foreground"
                                            title="Compartir"
                                        >
                                            <Share2 className="h-3 w-3 mr-1" />
                                            <span className="hidden sm:inline">Compartir</span>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                            onClick={() => setPreviewPromotion(promo)}
                                            title="Ver arte completo"
                                        >
                                            {promo.imageUrl && (promo.imageUrl.toLowerCase().includes('.mp4') || promo.imageUrl.toLowerCase().includes('.webm') || (promo.imageUrl.includes('alt=media') && promo.imageUrl.includes('video'))) ? (
                                                <>
                                                    <Video className="h-3 w-3 mr-1" />
                                                    <span className="hidden sm:inline">Reel</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    <span className="hidden sm:inline">Ver</span>
                                                </>
                                            )}
                                        </Button>
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                            onClick={() => handleEdit(promo)}
                                            title="Editar promoción"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/10"
                                            onClick={() => handleDeleteClick(promo)}
                                            title="Eliminar promoción"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Edit/Create Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent hideCloseButton className="p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] max-w-xl max-h-[90vh] flex flex-col bg-card">
                    {/* Cabecera Oficial Vatos Alfa */}
                    <div className="relative px-5 py-3.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white overflow-hidden border-b border-slate-800 shrink-0">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <Tag className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-sm font-semibold text-white tracking-tight">
                                        {selectedPromotion ? 'Editar Promoción' : 'Nueva Promoción'}
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300">
                                        Configura el banner, vigencia y detalles de la oferta.
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsDialogOpen(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <form className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="space-y-4 rounded-xl border border-border/60 p-3.5 bg-muted/10">
                            <div className="flex justify-center">
                                {imagePreview ? (
                                    <div className="relative group w-44 aspect-[9/16] bg-black/5 rounded-xl overflow-hidden border border-border/70">
                                        {imagePreview.startsWith('data:video/') || imagePreview.toLowerCase().includes('.mp4') || imagePreview.toLowerCase().includes('.webm') || (imagePreview.includes('alt=media') && imagePreview.includes('video')) ? (
                                            <video src={imagePreview} className="w-full h-full object-contain bg-black" autoPlay muted loop playsInline />
                                        ) : (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => { setImageFile(null); setImagePreview(null); }}
                                            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full aspect-video sm:aspect-[4/5] border-2 border-dashed border-border/70 rounded-xl cursor-pointer hover:bg-muted/30 transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                                            <ImageIcon className="w-8 h-8 text-slate-400 mb-2" />
                                            <p className="text-xs text-foreground font-semibold">Click para subir imagen o video</p>
                                            <p className="text-[11px] text-muted-foreground mt-1">
                                                PNG, JPG, GIF o WEBM/MP4
                                                <br />
                                                Recomendado: Vertical 9:16 (Máx. 5MB)
                                            </p>
                                        </div>
                                        <input type="file" className="hidden" accept="image/*,video/mp4,video/webm" onChange={handleImageChange} />
                                    </label>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-semibold text-foreground">Nombre de la Promoción</Label>
                            <Input {...form.register('name')} placeholder="Ej. 2x1 en Corte + Barba" className="h-8 text-xs font-sans" />
                            {form.formState.errors.name && <span className="text-destructive text-[11px]">{form.formState.errors.name.message}</span>}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-foreground">Fecha Inicial</Label>
                                <Popover modal={true} open={startDateOpen} onOpenChange={setStartDateOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start text-left font-normal h-8 px-3 text-xs rounded-lg border-border/80",
                                                !form.watch('startDate') && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="truncate">
                                                {parseDateSafe(form.watch('startDate'))
                                                    ? format(parseDateSafe(form.watch('startDate'))!, "dd 'de' MMM, yyyy", { locale: es })
                                                    : "Selecciona fecha"}
                                            </span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 z-[60] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={parseDateSafe(form.watch('startDate'))}
                                            onSelect={(date) => {
                                                if (date) {
                                                    form.setValue('startDate', format(date, 'yyyy-MM-dd'), { shouldValidate: true });
                                                    setStartDateOpen(false);
                                                }
                                            }}
                                            initialFocus
                                            locale={es}
                                        />
                                    </PopoverContent>
                                </Popover>
                                {form.formState.errors.startDate && <span className="text-destructive text-[11px]">{form.formState.errors.startDate.message}</span>}
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-foreground">Fecha Final</Label>
                                <Popover modal={true} open={endDateOpen} onOpenChange={setEndDateOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start text-left font-normal h-8 px-3 text-xs rounded-lg border-border/80",
                                                !form.watch('endDate') && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="truncate">
                                                {parseDateSafe(form.watch('endDate'))
                                                    ? format(parseDateSafe(form.watch('endDate'))!, "dd 'de' MMM, yyyy", { locale: es })
                                                    : "Selecciona fecha"}
                                            </span>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 z-[60] border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={parseDateSafe(form.watch('endDate'))}
                                            onSelect={(date) => {
                                                if (date) {
                                                    form.setValue('endDate', format(date, 'yyyy-MM-dd'), { shouldValidate: true });
                                                    setEndDateOpen(false);
                                                }
                                            }}
                                            disabled={(date) => {
                                                const start = parseDateSafe(form.watch('startDate'));
                                                if (!start) return false;
                                                const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
                                                const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                                return targetDay < startDay;
                                            }}
                                            initialFocus
                                            locale={es}
                                        />
                                    </PopoverContent>
                                </Popover>
                                {form.formState.errors.endDate && <span className="text-destructive text-[11px]">{form.formState.errors.endDate.message}</span>}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-semibold text-foreground">Descripción</Label>
                            <Textarea {...form.register('description')} placeholder="Detalles de lo que incluye la promoción..." rows={3} className="text-xs font-sans leading-relaxed" />
                            {form.formState.errors.description && <span className="text-destructive text-[11px]">{form.formState.errors.description.message}</span>}
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-semibold text-foreground">Términos y Condiciones (Opcional)</Label>
                            <Textarea {...form.register('termsAndConditions')} placeholder="Ej. Solo válido de Lunes a Miércoles..." rows={2} className="text-xs font-sans leading-relaxed" />
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 bg-muted/10">
                            <div className="space-y-0.5">
                                <Label htmlFor="active-mode" className="text-xs font-semibold text-foreground cursor-pointer">Promoción Activa</Label>
                                <p className="text-[11px] text-muted-foreground">Desactívala para pausarla temporalmente sin eliminarla.</p>
                            </div>
                            <Switch
                                id="active-mode"
                                checked={form.watch('active')}
                                onCheckedChange={(checked) => form.setValue('active', checked)}
                                className="scale-90"
                            />
                        </div>

                        <DialogFooter className="sticky bottom-0 bg-background/95 backdrop-blur-md pt-3 pb-1 border-t border-border/50 flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="h-8 px-4 text-xs rounded-xl border-border/80">
                                Cancelar
                            </Button>
                            <Button type="submit" variant="alfa" disabled={isSubmitting} className="h-8 px-5 text-xs font-semibold">
                                {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                {selectedPromotion ? 'Guardar Cambios' : 'Crear Promoción'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar Promoción?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. La promoción "{selectedPromotion?.name}" será eliminada permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl border-border/60">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="rounded-xl bg-destructive hover:bg-destructive/90 text-white">
                            Sí, eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Preview Reel Modal - CLEAN VIDEO ONLY */}
            <Dialog open={!!previewPromotion} onOpenChange={(open) => !open && setPreviewPromotion(null)}>
                <DialogContent className="max-w-none w-full h-[100dvh] sm:w-[400px] sm:h-[800px] sm:max-h-[90vh] bg-black p-0 rounded-none sm:rounded-[2rem] overflow-hidden border-none sm:border sm:border-white/20 shadow-2xl flex flex-col">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{previewPromotion?.name || 'Vista Previa'}</DialogTitle>
                        <DialogDescription>Vista previa de la promoción</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 w-full h-full bg-black relative flex items-center justify-center">
                        {previewPromotion?.imageUrl ? (
                            (previewPromotion.imageUrl.toLowerCase().includes('.mp4') || previewPromotion.imageUrl.toLowerCase().includes('.webm') || (previewPromotion.imageUrl.includes('alt=media') && previewPromotion.imageUrl.includes('video'))) ? (
                                <video
                                    src={previewPromotion.imageUrl}
                                    className="w-full h-full object-contain"
                                    autoPlay
                                    controls
                                    playsInline
                                    loop
                                />
                            ) : (
                                <img
                                    src={previewPromotion.imageUrl}
                                    alt={previewPromotion?.name}
                                    className="w-full h-full object-contain"
                                />
                            )
                        ) : (
                            <div className="text-white/50 text-center p-8">
                                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <p>Sin contenido visual</p>
                            </div>
                        )}
                        
                        <div className="absolute top-4 left-4 z-50">
                            <Badge variant="secondary" className="bg-black/60 text-white border-none backdrop-blur-md text-[10px]">Vista Previa</Badge>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setPreviewPromotion(null)}
                        className="absolute top-4 right-4 bg-black/40 backdrop-blur-lg border border-white/20 text-white p-2.5 rounded-full hover:bg-white/20 transition-colors z-50 shadow-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </DialogContent>
            </Dialog>

            {/* Terms and Conditions Modal */}
            <Dialog open={!!showTerms} onOpenChange={(open) => !open && setShowTerms(null)}>
                <DialogContent hideCloseButton className="p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] max-w-md bg-card flex flex-col">
                    <div className="relative px-5 py-3.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white overflow-hidden border-b border-slate-800 shrink-0">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <Info className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-sm font-semibold text-white tracking-tight">
                                        Términos y Condiciones
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300 truncate max-w-[280px]">
                                        {showTerms?.name}
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowTerms(null)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="p-5 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                        {showTerms?.termsAndConditions}
                    </div>
                    <div className="p-4 border-t border-border/50 bg-muted/10 flex items-center justify-end gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 px-3 text-xs rounded-xl border-border/80" 
                            onClick={() => {
                                const url = `${window.location.origin}/promociones/${showTerms?.id}/terminos`;
                                navigator.clipboard.writeText(url);
                                toast({
                                    title: "Link de términos copiado",
                                    description: "El enlace público de los términos y condiciones se ha copiado al portapapeles.",
                                });
                            }}
                        >
                            <Share2 className="w-3.5 h-3.5 mr-1" /> Copiar Link
                        </Button>
                        <Button variant="alfa" size="sm" className="h-8 px-4 text-xs font-semibold" onClick={() => setShowTerms(null)}>
                            Entendido
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default PromotionsManager;

