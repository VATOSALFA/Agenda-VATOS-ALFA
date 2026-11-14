'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    Loader2,
    Plus,
    Trash2,
    Save,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Image as ImageIcon,
    HelpCircle,
    X,
    Eye,
    Smartphone,
    Globe,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit-logger';
import { cn } from '@/lib/utils';
import { ImageUploader } from '@/components/shared/image-uploader';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface LookbookItem {
    id: string;
    titulo: string;
    subtitulo?: string;
    descripcion?: string;
    tiempo?: string;
    nivelFijacion?: string;
    imagenUrl: string;
    servicioNombre?: string;
    serviceMatchId?: string;
    activo: boolean;
    mostrarEnApp?: boolean;
    mostrarEnWeb?: boolean;
    creado_el?: any;
    orden?: number;
}

const DEFAULT_LOOKBOOK_ITEMS: LookbookItem[] = [
    {
        id: 'style_fade_clasico',
        titulo: 'Low Fade & Barba Perfilada',
        subtitulo: 'El favorito de los caballeros',
        descripcion: 'Desvanecido bajo y limpio con transición impecable hacia la piel. Contornos trazados con navaja libre y barba perfilada con simetría milimétrica.',
        tiempo: '40 min',
        nivelFijacion: 'Mate Natural',
        imagenUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80',
        servicioNombre: 'Corte de cabello',
        serviceMatchId: 'corte-cabello',
        activo: true,
    },
    {
        id: 'style_pompadour',
        titulo: 'Pompadour Ejecutivo',
        subtitulo: 'Elegancia clásica contemporánea',
        descripcion: 'Volumen superior estructurado con caída natural hacia atrás. Laterales rebajados a tijera y acabado impecable para oficina o eventos de gala.',
        tiempo: '45 min',
        nivelFijacion: 'Firmeza Media / Brillo Suave',
        imagenUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
        servicioNombre: 'Corte de cabello',
        serviceMatchId: 'corte-cabello',
        activo: true,
    },
    {
        id: 'style_crop_texturizado',
        titulo: 'Texturizado Urbano (Crop)',
        subtitulo: 'Moderno, fresco y juvenil',
        descripcion: 'Capas superiores con textura desordenada controlada y flequillo recto o despuntado. Mid fade en laterales para máximo contraste y frescura.',
        tiempo: '35 min',
        nivelFijacion: 'Mate Alto',
        imagenUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80',
        servicioNombre: 'Corte de cabello',
        serviceMatchId: 'corte-cabello',
        activo: true,
    },
    {
        id: 'style_grecas_freestyle',
        titulo: 'Líneas & Grecas Freestyle',
        subtitulo: 'Identidad y arte urbano',
        descripcion: 'Diseño geométrico a navaja libre con degradado milimétrico. Cada línea es personalizada según la curvatura craneal del cliente.',
        tiempo: '30 min',
        nivelFijacion: 'Definición Extrema',
        imagenUrl: 'https://images.unsplash.com/photo-1517832606589-7629c3395909?auto=format&fit=crop&w=800&q=80',
        servicioNombre: 'Grecas',
        serviceMatchId: 'grecas',
        activo: true,
    },
];

function InfoTooltip({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen((prev) => !prev);
                    }}
                    className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-primary transition-colors p-0.5 rounded-full focus:outline-none shrink-0"
                    aria-label="Más información"
                >
                    <HelpCircle className="w-3.5 h-3.5 cursor-pointer" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="center"
                className="max-w-xs text-xs p-2.5 bg-slate-900 text-slate-100 border border-slate-800 shadow-xl rounded-xl z-50 pointer-events-none"
            >
                <p className="leading-relaxed">{text}</p>
            </PopoverContent>
        </Popover>
    );
}

interface GaleriaCortesManagerProps {
    className?: string;
    onSaveSuccess?: () => void;
}

export function GaleriaCortesManager({ className, onSaveSuccess }: GaleriaCortesManagerProps) {
    const { user } = useAuth();
    const { toast } = useToast();

    const [lookbookItems, setLookbookItems] = useState<LookbookItem[]>([]);
    const [loadingLookbook, setLoadingLookbook] = useState(true);
    const [isSavingLookbook, setIsSavingLookbook] = useState(false);
    const [isLookbookOpen, setIsLookbookOpen] = useState(true);

    const [newLookbookImage, setNewLookbookImage] = useState('');
    const [newLookbookActivo, setNewLookbookActivo] = useState(true);
    const [isUploadingLookbook, setIsUploadingLookbook] = useState(false);
    const [deletingLookbookItem, setDeletingLookbookItem] = useState<LookbookItem | null>(null);

    // Estados de UI para comodidad, paginación y zoom
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [newLookbookDestino, setNewLookbookDestino] = useState<'ambas' | 'app' | 'web'>('ambas');
    const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const ITEMS_PER_PAGE = 18;

    const filteredItems = React.useMemo(() => {
        if (activeFilter === 'active') return lookbookItems.filter((i) => i.activo);
        if (activeFilter === 'inactive') return lookbookItems.filter((i) => !i.activo);
        return lookbookItems;
    }, [lookbookItems, activeFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    const paginatedItems = React.useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage]);

    // Cargar galería de Firestore
    useEffect(() => {
        let isMounted = true;

        async function fetchGallery() {
            setLoadingLookbook(true);
            try {
                let rawLookbook: LookbookItem[] = [];

                // 1. Intentar cargar desde configuracion/inspiracion_alfa
                const lookbookRef = doc(db, 'configuracion', 'inspiracion_alfa');
                const lookbookSnap = await getDoc(lookbookRef);

                if (lookbookSnap.exists() && Array.isArray(lookbookSnap.data().items) && lookbookSnap.data().items.length > 0) {
                    rawLookbook = lookbookSnap.data().items;
                } else {
                    // Fallback a configuracion/app_movil
                    const appMovilRef = doc(db, 'configuracion', 'app_movil');
                    const appMovilSnap = await getDoc(appMovilRef);
                    if (appMovilSnap.exists() && Array.isArray(appMovilSnap.data().inspiracion_alfa) && appMovilSnap.data().inspiracion_alfa.length > 0) {
                        rawLookbook = appMovilSnap.data().inspiracion_alfa;
                    } else {
                        rawLookbook = DEFAULT_LOOKBOOK_ITEMS;
                    }
                }

                if (isMounted) {
                    setLookbookItems(rawLookbook);
                }
            } catch (err) {
                console.warn('Error cargando galería de cortes:', err);
                if (isMounted) {
                    setLookbookItems(DEFAULT_LOOKBOOK_ITEMS);
                }
            } finally {
                if (isMounted) {
                    setLoadingLookbook(false);
                }
            }
        }

        fetchGallery();

        return () => {
            isMounted = false;
        };
    }, []);

    // Manejador para agregar una fotografía a la lista
    const handleAddLookbookItem = (urlOverride?: string) => {
        const imageToSave = (urlOverride || newLookbookImage || '').trim();
        if (!imageToSave) {
            return toast({
                title: 'Fotografía Requerida',
                description: 'Por favor arrastra o haz clic para subir una fotografía.',
                variant: 'destructive',
            });
        }

        const newItem: LookbookItem = {
            id: `style_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            titulo: '',
            subtitulo: '',
            descripcion: '',
            tiempo: '',
            nivelFijacion: '',
            imagenUrl: imageToSave,
            servicioNombre: '',
            serviceMatchId: '',
            activo: newLookbookActivo,
            mostrarEnApp: newLookbookDestino === 'ambas' || newLookbookDestino === 'app',
            mostrarEnWeb: newLookbookDestino === 'ambas' || newLookbookDestino === 'web',
            creado_el: new Date().toISOString(),
            orden: lookbookItems.length,
        };

        setLookbookItems((prev) => [newItem, ...prev]);
        setNewLookbookImage('');
        const destinoLabel = newLookbookDestino === 'ambas' ? 'App Móvil y Sitio Web' : newLookbookDestino === 'app' ? 'Solo App Móvil' : 'Solo Sitio Web';
        toast({
            title: '¡Fotografía agregada a la galería!',
            description: `Destino: ${destinoLabel}. Haz clic en "Guardar" para aplicar los cambios.`,
        });
    };

    // Alternar destino de publicación (App & Web -> Solo App -> Solo Web)
    const handleCycleDestino = (id: string) => {
        setLookbookItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const inApp = item.mostrarEnApp !== false;
                const inWeb = item.mostrarEnWeb !== false;
                if (inApp && inWeb) {
                    return { ...item, mostrarEnApp: true, mostrarEnWeb: false };
                }
                if (inApp && !inWeb) {
                    return { ...item, mostrarEnApp: false, mostrarEnWeb: true };
                }
                return { ...item, mostrarEnApp: true, mostrarEnWeb: true };
            })
        );
    };

    // Alternar visibilidad de un elemento
    const handleToggleLookbookItem = (id: string, activo: boolean) => {
        setLookbookItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, activo } : item))
        );
        toast({
            title: activo ? 'Fotografía Activada' : 'Fotografía Pausada',
            description: activo
                ? 'La fotografía se mostrará en el Sitio Web y la App Móvil al guardar.'
                : 'La fotografía se ha pausado y se ocultará en el Sitio Web y la App.',
        });
    };

    // Eliminar elemento
    const handleStartDeleteLookbook = (item: LookbookItem) => {
        setDeletingLookbookItem(item);
    };

    const handleConfirmDeleteLookbook = () => {
        if (!deletingLookbookItem) return;
        const targetId = deletingLookbookItem.id;
        setLookbookItems((prev) => prev.filter((i) => i.id !== targetId));
        setDeletingLookbookItem(null);
        toast({
            title: 'Fotografía Eliminada',
            description: 'Se eliminó la fotografía de la galería. Recuerda guardar cambios para sincronizar.',
        });
    };

    // Guardar galería en espejo: configuracion/inspiracion_alfa Y configuracion/app_movil
    const handleSaveLookbook = async () => {
        setIsSavingLookbook(true);
        try {
            const cleanItems = lookbookItems.map((item, idx) => ({
                id: item.id || `lookbook_${idx}_${Date.now()}`,
                titulo: (item.titulo || '').trim(),
                subtitulo: (item.subtitulo || '').trim(),
                descripcion: (item.descripcion || '').trim(),
                tiempo: (item.tiempo || '40 min').trim(),
                nivelFijacion: (item.nivelFijacion || 'Mate Natural').trim(),
                imagenUrl: (item.imagenUrl || '').trim(),
                servicioNombre: (item.servicioNombre || '').trim(),
                serviceMatchId: item.serviceMatchId || '',
                activo: item.activo !== false,
                mostrarEnApp: item.mostrarEnApp !== false,
                mostrarEnWeb: item.mostrarEnWeb !== false,
                orden: idx,
            }));

            const appItems = cleanItems.filter((i) => i.mostrarEnApp);
            const webItems = cleanItems.filter((i) => i.mostrarEnWeb);

            // 1. Guardar en configuracion/inspiracion_alfa (fuente maestra de administración)
            await setDoc(
                doc(db, 'configuracion', 'inspiracion_alfa'),
                {
                    items: cleanItems,
                    actualizado_el: Timestamp.now(),
                    actualizado_por: user?.email || 'admin',
                },
                { merge: true }
            );

            // 2. Sincronizar en espejo con configuracion/app_movil separado por plataforma
            await setDoc(
                doc(db, 'configuracion', 'app_movil'),
                {
                    inspiracion_alfa: appItems,
                    inspiracion_alfa_web: webItems,
                    actualizado_el: Timestamp.now(),
                },
                { merge: true }
            );

            // 3. Auditoría
            await logAuditAction({
                action: 'Modificar Galería de Cortes (Inspiración Alfa)',
                details: `Total: ${cleanItems.length} estilos/cortes (${cleanItems.filter((i) => i.activo).length} activos en Web y App)`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'info',
            });

            toast({
                title: '¡Galería de Cortes Guardada!',
                description: `Se sincronizaron ${cleanItems.filter((i) => i.activo).length} cortes reales en tiempo real con el Sitio Web y la App Móvil.`,
            });

            if (onSaveSuccess) {
                onSaveSuccess();
            }
        } catch (e: any) {
            console.error('Error guardando Galería de Cortes:', e);
            toast({
                title: 'Error al guardar galería',
                description: e.message || 'No se pudieron guardar los cambios en la base de datos.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingLookbook(false);
        }
    };

    return (
        <div className={cn("space-y-4", className)}>
            <Card className="border border-border/70 shadow-sm transition-all">
                <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border/60">
                            <button
                                type="button"
                                onClick={() => { setActiveFilter('all'); setCurrentPage(1); }}
                                className={cn(
                                    "px-2.5 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer select-none",
                                    activeFilter === 'all'
                                        ? "bg-[#202A49] text-white shadow-2xs font-bold"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Todas ({lookbookItems.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => { setActiveFilter('active'); setCurrentPage(1); }}
                                className={cn(
                                    "px-2.5 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer select-none",
                                    activeFilter === 'active'
                                        ? "bg-[#202A49] text-white shadow-2xs font-bold"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Visibles ({lookbookItems.filter((i) => i.activo).length})
                            </button>
                            <button
                                type="button"
                                onClick={() => { setActiveFilter('inactive'); setCurrentPage(1); }}
                                className={cn(
                                    "px-2.5 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer select-none",
                                    activeFilter === 'inactive'
                                        ? "bg-[#202A49] text-white shadow-2xs font-bold"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Ocultas ({lookbookItems.filter((i) => !i.activo).length})
                            </button>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsUploadOpen(!isUploadOpen)}
                                className={cn(
                                    "h-8 text-xs font-semibold gap-1.5 cursor-pointer rounded-xl transition-colors",
                                    isUploadOpen
                                        ? "bg-[#202A49] text-white border-[#202A49] hover:bg-[#2a375e] hover:text-white"
                                        : "border-border/70 text-foreground hover:bg-muted/60 hover:text-foreground"
                                )}
                            >
                                <Plus className={cn("w-3.5 h-3.5 transition-transform", isUploadOpen && "rotate-45")} />
                                <span>{isUploadOpen ? "Cerrar subida" : "Subir fotografías"}</span>
                            </Button>
                            <button
                                type="button"
                                onClick={() => setIsLookbookOpen(!isLookbookOpen)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1 cursor-pointer"
                                title={isLookbookOpen ? "Minimizar" : "Desplegar"}
                                aria-label={isLookbookOpen ? "Minimizar" : "Desplegar"}
                            >
                                {isLookbookOpen ? (
                                    <ChevronUp className="w-4.5 h-4.5" />
                                ) : (
                                    <ChevronDown className="w-4.5 h-4.5" />
                                )}
                            </button>
                        </div>
                    </div>
                </CardHeader>

                {isLookbookOpen && (
                    <CardContent className="space-y-4 pt-2 px-4 sm:px-6 pb-5">
                        {/* ÁREA DE SUBIDA COLAPSABLE 1:1 CON SELECTOR DE PLATAFORMA */}
                        {isUploadOpen && (
                            <div className="bg-muted/15 border border-border/70 rounded-xl p-3.5 sm:p-4 animate-in fade-in duration-200">
                                <div className="flex flex-col sm:flex-row items-start gap-4">
                                    {/* Contenedor 1:1 cuadrado */}
                                    <div className="w-44 sm:w-48 aspect-square shrink-0 mx-auto sm:mx-0">
                                        <ImageUploader
                                            folder="inspiracion_alfa"
                                            currentImageUrl={newLookbookImage}
                                            onUpload={(url) => setNewLookbookImage(url)}
                                            onUploadEnd={(url) => {
                                                handleAddLookbookItem(url);
                                            }}
                                            onRemove={() => setNewLookbookImage('')}
                                            onUploadStateChange={setIsUploadingLookbook}
                                            multiple={true}
                                            showPreview={true}
                                            showRemove={true}
                                            objectFit="cover"
                                            className="w-full h-full aspect-square border-2 border-dashed rounded-xl bg-background/50 hover:bg-background/80 transition-all cursor-pointer shadow-2xs"
                                        />
                                    </div>

                                    {/* Opciones de subida y destino */}
                                    <div className="flex-1 w-full space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Badge variant="outline" className="text-[10px] font-semibold text-blue-400 border-blue-500/30 bg-blue-500/10 py-0.5 px-2">
                                                Formato Oficial: Cuadrado 1:1 (ej. 1080 × 1080 px)
                                            </Badge>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <Label htmlFor="galeria-activo-toggle" className="text-[11px] font-medium cursor-pointer text-muted-foreground">
                                                    {newLookbookActivo ? 'Visible al subir' : 'Pausado al subir'}
                                                </Label>
                                                <Switch
                                                    id="galeria-activo-toggle"
                                                    checked={newLookbookActivo}
                                                    onCheckedChange={setNewLookbookActivo}
                                                    className="scale-90"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-foreground">
                                                Mostrar fotografía en:
                                            </Label>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setNewLookbookDestino('ambas')}
                                                    className={cn(
                                                        "px-3 py-1.5 text-xs rounded-lg border font-medium transition-all cursor-pointer flex items-center gap-1.5",
                                                        newLookbookDestino === 'ambas'
                                                            ? "bg-[#202A49] text-white border-[#202A49] shadow-2xs"
                                                            : "bg-background text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted/40"
                                                    )}
                                                >
                                                    <Smartphone className="w-3.5 h-3.5" />
                                                    <Globe className="w-3.5 h-3.5" />
                                                    <span>Ambas (App y Web)</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNewLookbookDestino('app')}
                                                    className={cn(
                                                        "px-3 py-1.5 text-xs rounded-lg border font-medium transition-all cursor-pointer flex items-center gap-1.5",
                                                        newLookbookDestino === 'app'
                                                            ? "bg-[#202A49] text-white border-[#202A49] shadow-2xs"
                                                            : "bg-background text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted/40"
                                                    )}
                                                >
                                                    <Smartphone className="w-3.5 h-3.5" />
                                                    <span>Solo App Móvil</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNewLookbookDestino('web')}
                                                    className={cn(
                                                        "px-3 py-1.5 text-xs rounded-lg border font-medium transition-all cursor-pointer flex items-center gap-1.5",
                                                        newLookbookDestino === 'web'
                                                            ? "bg-[#202A49] text-white border-[#202A49] shadow-2xs"
                                                            : "bg-background text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted/40"
                                                    )}
                                                >
                                                    <Globe className="w-3.5 h-3.5" />
                                                    <span>Solo Sitio Web</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                            <p className="text-[11px] text-muted-foreground">
                                                Formatos: JPG, PNG, WEBP. Arrastra una o varias fotos en formato cuadrado (1:1).
                                            </p>
                                            {newLookbookImage && (
                                                <Button
                                                    type="button"
                                                    variant="alfa"
                                                    onClick={() => handleAddLookbookItem()}
                                                    className="text-xs h-7 px-3 shrink-0 flex items-center gap-1.5"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Agregar
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* CUADRÍCULA DE FOTOGRAFÍAS (PAGINADA) */}
                        <div className="space-y-3 pt-1">
                            {loadingLookbook ? (
                                <div className="py-12 flex justify-center">
                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="border border-dashed border-border/80 rounded-xl p-8 text-center bg-muted/10 space-y-2">
                                    <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/50" />
                                    <p className="text-xs font-semibold text-foreground">No hay fotos en esta vista</p>
                                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                                        {activeFilter === 'all'
                                            ? 'Haz clic en "Subir fotografías" para agregar imágenes en formato 1:1.'
                                            : 'No hay fotografías con el filtro seleccionado.'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
                                        {paginatedItems.map((item) => (
                                            <div
                                                key={item.id}
                                                className={cn(
                                                    "group relative rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs transition-all hover:shadow-md flex flex-col justify-between",
                                                    !item.activo && "opacity-60 bg-muted/20"
                                                )}
                                            >
                                                <div className="relative aspect-square w-full bg-muted/30 overflow-hidden">
                                                    <img
                                                        src={item.imagenUrl}
                                                        alt="Corte de cabello"
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        loading="lazy"
                                                    />

                                                    {/* Botón flotante para ver imagen completa (Zoom) */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewImage(item.imagenUrl)}
                                                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                                                        title="Ver imagen completa (1:1)"
                                                    >
                                                        <div className="p-2 rounded-full bg-black/70 text-white backdrop-blur-xs hover:scale-110 transition-transform shadow-lg">
                                                            <Eye className="w-4 h-4 text-white" />
                                                        </div>
                                                    </button>

                                                    {/* Badge de destino en esquina superior izquierda (clic para alternar App & Web / App / Web) */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCycleDestino(item.id);
                                                        }}
                                                        title="Clic para cambiar dónde se muestra (App & Web / Solo App / Solo Web)"
                                                        className="absolute top-1.5 left-1.5 z-10 cursor-pointer"
                                                    >
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[9px] font-medium backdrop-blur-md py-0 px-1.5 leading-tight shadow-xs text-white bg-black/70 border-white/20 hover:bg-[#202A49] transition-colors"
                                                        >
                                                            {item.mostrarEnApp !== false && item.mostrarEnWeb !== false
                                                                ? "App & Web"
                                                                : item.mostrarEnApp !== false
                                                                    ? "Solo App"
                                                                    : "Solo Web"}
                                                        </Badge>
                                                    </button>

                                                    {/* Badge de estado en esquina superior derecha */}
                                                    <div className="absolute top-1.5 right-1.5 pointer-events-none">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "text-[9px] font-medium backdrop-blur-md py-0 px-1.5 leading-tight shadow-xs",
                                                                item.activo
                                                                    ? "text-white bg-black/70 border-white/20"
                                                                    : "text-slate-400 bg-black/70 border-white/10"
                                                            )}
                                                        >
                                                            {item.activo ? "Visible" : "Oculto"}
                                                        </Badge>
                                                    </div>
                                                </div>

                                                {/* Barra de control inferior limpia y discreta */}
                                                <div className="p-1.5 px-2 flex items-center justify-between bg-muted/20 border-t border-border/50">
                                                    <div className="flex items-center gap-1.5">
                                                        <Switch
                                                            checked={item.activo}
                                                            onCheckedChange={(val) => handleToggleLookbookItem(item.id, val)}
                                                            title={item.activo ? "Visible (clic para pausar)" : "Oculto (clic para activar)"}
                                                            className="scale-75 origin-left"
                                                        />
                                                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                                            {item.activo ? 'Activo' : 'Pausado'}
                                                        </span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleStartDeleteLookbook(item)}
                                                        className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-white/10 cursor-pointer"
                                                        title="Eliminar de la galería"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* CONTROLES DE PAGINACIÓN */}
                                    {totalPages > 1 && (
                                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-border/50 text-xs">
                                            <span className="text-muted-foreground text-xs font-sans">
                                                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} de {filteredItems.length} cortes
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                    className="h-7.5 px-2.5 text-xs gap-1 cursor-pointer disabled:opacity-40"
                                                >
                                                    <ChevronLeft className="w-3.5 h-3.5" />
                                                    <span>Anterior</span>
                                                </Button>
                                                <span className="px-2 font-semibold text-foreground text-xs">
                                                    {currentPage} / {totalPages}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                                    disabled={currentPage === totalPages}
                                                    className="h-7.5 px-2.5 text-xs gap-1 cursor-pointer disabled:opacity-40"
                                                >
                                                    <span>Siguiente</span>
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* BOTÓN GUARDAR GALERÍA */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-border/50">
                            <span className="text-[11px] text-muted-foreground">
                                Los cambios se sincronizan en espejo automáticamente entre el Sitio Web y la App Móvil.
                            </span>
                            <Button
                                type="button"
                                onClick={handleSaveLookbook}
                                disabled={isSavingLookbook}
                                variant="alfa"
                                className="text-xs px-5 h-8.5 w-full sm:w-auto flex items-center gap-1.5 cursor-pointer font-semibold"
                            >
                                {isSavingLookbook ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-3.5 h-3.5 mr-1" />
                                        Guardar
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Modal de confirmación para eliminar fotografía de la galería */}
            <Dialog open={deletingLookbookItem !== null} onOpenChange={(open) => !open && setDeletingLookbookItem(null)}>
                <DialogContent
                    hideCloseButton={true}
                    className="max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500"
                >
                    <div className="p-4 sm:p-5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-[#2d3a60]/60 relative overflow-hidden">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-2.5">
                                <Trash2 className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                                        Eliminar Fotografía
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300">
                                        Esta acción no se puede deshacer
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDeletingLookbookItem(null)}
                                className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                aria-label="Cerrar modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                    <div className="p-5 space-y-4">
                        <p className="text-xs text-muted-foreground">
                            ¿Estás seguro de que deseas eliminar esta fotografía de la galería de cortes? Se retirará tanto del Sitio Web como de la App Móvil.
                        </p>
                        {deletingLookbookItem && (
                            <div className="py-2 flex justify-center">
                                <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-border/60 shadow-sm">
                                    <img
                                        src={deletingLookbookItem.imagenUrl}
                                        alt="Fotografía a eliminar"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDeletingLookbookItem(null)}
                                className="h-8 text-xs cursor-pointer"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={handleConfirmDeleteLookbook}
                                className="h-8 text-xs cursor-pointer"
                            >
                                Eliminar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Modal de vista previa (Zoom 1:1) */}
            <Dialog open={previewImage !== null} onOpenChange={(open) => !open && setPreviewImage(null)}>
                <DialogContent
                    hideCloseButton={true}
                    className="max-w-md sm:max-w-lg p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500"
                >
                    <div className="p-3.5 sm:p-4 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex items-center justify-between border-b border-[#2d3a60]/60 relative overflow-hidden">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-slate-300 shrink-0" />
                                <DialogTitle className="text-sm font-bold text-white tracking-tight">
                                    Vista Previa del Corte (Formato 1:1)
                                </DialogTitle>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewImage(null)}
                                className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                aria-label="Cerrar vista previa"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {previewImage && (
                        <div className="p-4 bg-black/90 flex items-center justify-center">
                            <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
                                <img
                                    src={previewImage}
                                    alt="Vista previa del corte"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
