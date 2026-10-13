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
    Camera,
    Image as ImageIcon,
    HelpCircle,
    X,
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
            creado_el: new Date().toISOString(),
            orden: lookbookItems.length,
        };

        setLookbookItems((prev) => [newItem, ...prev]);
        setNewLookbookImage('');
        toast({
            title: '¡Fotografía agregada a la galería!',
            description: 'Recuerda hacer clic en "Guardar Galería de Cortes" para sincronizar los cambios con la App Móvil y el Sitio Web.',
        });
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
                orden: idx,
            }));

            // 1. Guardar en configuracion/inspiracion_alfa (fuente universal)
            await setDoc(
                doc(db, 'configuracion', 'inspiracion_alfa'),
                {
                    items: cleanItems,
                    actualizado_el: Timestamp.now(),
                    actualizado_por: user?.email || 'admin',
                },
                { merge: true }
            );

            // 2. Sincronizar en espejo con configuracion/app_movil
            await setDoc(
                doc(db, 'configuracion', 'app_movil'),
                {
                    inspiracion_alfa: cleanItems,
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
                <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                            <Camera className="h-4.5 w-4.5 text-primary shrink-0" />
                            <div className="flex items-center gap-1.5">
                                <CardTitle className="text-base font-semibold">
                                    Galería de Cortes
                                </CardTitle>
                                <InfoTooltip text="Sube fotos de cortes y peinados reales realizados en tu barbería. Se mostrarán al instante en la sección de Cortes Reales del Sitio Web y en la App Móvil." />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="secondary" className="bg-[#202A49]/10 text-[#202A49] dark:bg-white/10 dark:text-slate-200 border border-[#202A49]/20 text-xs py-0.5 px-2 font-medium">
                                {lookbookItems.filter((i) => i.activo).length} Visibles en App & Web
                            </Badge>
                            <Badge variant="outline" className="text-muted-foreground text-xs py-0.5 px-2 font-normal">
                                {lookbookItems.length} Total
                            </Badge>
                            <button
                                type="button"
                                onClick={() => setIsLookbookOpen(!isLookbookOpen)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1 ml-1 cursor-pointer"
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
                    <CardContent className="space-y-4 pt-1 px-4 sm:px-6 pb-5">
                        {/* ÁREA EXCLUSIVA PARA AGREGAR FOTOGRAFÍA (DRAG & DROP O IMPORTAR) */}
                        <div className="bg-muted/20 border border-border/70 rounded-xl p-3 sm:p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                                        <Plus className="w-3.5 h-3.5 text-primary" />
                                        Agregar Fotografía a la Galería
                                    </Label>
                                    <InfoTooltip text="Arrastra y suelta imágenes o haz clic para importar fotos de cortes reales para el sitio web y la app móvil." />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="galeria-activo-toggle" className="text-[11px] font-medium cursor-pointer text-muted-foreground">
                                        {newLookbookActivo ? 'Visible' : 'Oculto'}
                                    </Label>
                                    <Switch
                                        id="galeria-activo-toggle"
                                        checked={newLookbookActivo}
                                        onCheckedChange={setNewLookbookActivo}
                                        className="scale-90"
                                    />
                                </div>
                            </div>

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
                                className="w-full h-44 sm:h-52 border-2 border-dashed rounded-xl bg-background/50 hover:bg-background/80 transition-all cursor-pointer shadow-2xs"
                            />

                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5 px-0.5">
                                <span>Formatos: JPG, PNG, WEBP. Arrastra una o varias fotos, o haz clic para importar.</span>
                                {newLookbookImage && (
                                    <Button
                                        type="button"
                                        variant="alfa"
                                        onClick={() => handleAddLookbookItem()}
                                        className="text-xs h-7.5 px-3.5 shrink-0 flex items-center gap-1.5"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        Agregar a la Galería
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* LISTA DE FOTOGRAFÍAS EN LA GALERÍA */}
                        <div className="space-y-2.5 pt-1">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-xs font-semibold text-foreground">
                                        Fotografías en la Galería ({lookbookItems.length})
                                    </h4>
                                    <InfoTooltip text="Puedes activar u ocultar cualquier fotografía en el sitio web y la app móvil sin eliminarla." />
                                </div>
                            </div>

                            {loadingLookbook ? (
                                <div className="py-8 flex justify-center">
                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                </div>
                            ) : lookbookItems.length === 0 ? (
                                <div className="border border-dashed border-border/80 rounded-lg p-6 text-center bg-muted/10 space-y-1.5">
                                    <ImageIcon className="w-7 h-7 mx-auto text-muted-foreground/60" />
                                    <p className="text-xs font-medium text-foreground">No hay fotos en la galería</p>
                                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                                        Arrastra o importa fotografías de cortes reales arriba para que tus clientes se inspiren en el sitio web y en la app móvil.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {lookbookItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "group relative rounded-xl border bg-card overflow-hidden shadow-2xs transition-all hover:shadow-md flex flex-col justify-between",
                                                !item.activo && "opacity-60 bg-muted/20 border-border/60"
                                            )}
                                        >
                                            <div className="relative aspect-square w-full bg-muted/30 overflow-hidden">
                                                <img
                                                    src={item.imagenUrl}
                                                    alt="Fotografía de la galería"
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    loading="lazy"
                                                />
                                                <div className="absolute top-2 right-2">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[10px] font-medium backdrop-blur-md shadow-xs py-0 px-1.5 leading-tight",
                                                            item.activo
                                                                ? "text-[#202A49] dark:text-slate-100 bg-white/90 dark:bg-black/80 border-[#202A49]/30 dark:border-white/20"
                                                                : "text-muted-foreground bg-white/80 border-border dark:bg-black/70"
                                                        )}
                                                    >
                                                        {item.activo ? "Visible" : "Oculto"}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="p-2 flex items-center justify-between bg-background border-t border-border/60">
                                                <div className="flex items-center gap-1.5">
                                                    <Switch
                                                        checked={item.activo}
                                                        onCheckedChange={(val) => handleToggleLookbookItem(item.id, val)}
                                                        title={item.activo ? "Visible en Web y App (clic para pausar)" : "Oculto (clic para activar)"}
                                                        className="scale-75 origin-left"
                                                    />
                                                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                                        {item.activo ? 'Activo' : 'Pausado'}
                                                    </span>
                                                </div>

                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleStartDeleteLookbook(item)}
                                                    className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer"
                                                    title="Eliminar de la galería"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
                                className="text-xs sm:text-sm px-5 h-9 w-full sm:w-auto flex items-center gap-2 cursor-pointer"
                            >
                                {isSavingLookbook ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                        Guardando Galería...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-3.5 h-3.5 mr-1.5" />
                                        Guardar Galería de Cortes
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
        </div>
    );
}
