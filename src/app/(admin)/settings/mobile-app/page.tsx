'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { doc, setDoc, getDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PromotionsManager from '../promotions/promotions-manager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Loader2,
    Plus,
    Trash2,
    CheckCircle2,
    Award,
    Sparkles,
    Scissors,
    Save,
    Info,
    ShieldCheck,
    Pencil,
    CalendarDays,
    Clock,
    AlertTriangle,
    Crown,
    ChevronsRight,
    X,
    ChevronDown,
    ChevronUp,
    Camera,
    Image as ImageIcon,
    ExternalLink,
    HelpCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { logAuditAction } from '@/lib/audit-logger';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ImageUploader } from '@/components/shared/image-uploader';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface PrivilegioVIP {
    id: string;
    titulo: string;
    activo: boolean;
    fechaLimite?: string | null; // YYYY-MM-DD
    creado_el?: any;
}

type BeneficioPaseAlfa = PrivilegioVIP;

interface LookbookItem {
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
        descripcion: 'Diseño geométrico a mano alzada tallado sobre degradado oscuro. Líneas nítidas de alta precisión que destacan en cualquier ángulo.',
        tiempo: '25 min',
        nivelFijacion: 'Natural',
        imagenUrl: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=800&q=80',
        servicioNombre: 'Grecas',
        serviceMatchId: 'grecas',
        activo: true,
    },
    {
        id: 'style_ritual_completo',
        titulo: 'Ritual Barba & Toalla Caliente',
        subtitulo: 'Experiencia sensorial clásica',
        descripcion: 'Afeitado tradicional con toalla caliente vaporizada con aceites esenciales de eucalipto, apertura de poros, espuma tibia y navaja clásica.',
        tiempo: '35 min',
        nivelFijacion: 'Hidratación Profunda',
        imagenUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=80',
        servicioNombre: 'Arreglo de barba expres',
        serviceMatchId: 'arreglo-barba-expres',
        activo: true,
    },
];

const formatDateDisplay = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return format(d, "d 'de' MMMM, yyyy", { locale: es });
        }
    } catch (_) {}
    return dateStr;
};

const parseDateSafe = (val?: string | null): Date | undefined => {
    if (!val) return undefined;
    try {
        const parts = val.split('-');
        if (parts.length === 3) {
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return isNaN(d.getTime()) ? undefined : d;
        }
    } catch (_) {}
    return undefined;
};

const isPrivilegeExpired = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const today = format(new Date(), 'yyyy-MM-dd');
    return dateStr < today;
};

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
                align="start"
                sideOffset={6}
                className="w-72 sm:w-80 p-2.5 text-xs text-foreground bg-popover shadow-md rounded-lg border border-border/70 z-50 pointer-events-auto"
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
            >
                <p className="leading-relaxed font-normal">{text}</p>
            </PopoverContent>
        </Popover>
    );
}

interface SafetySliderProps {
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
}

function SafetySlider({ title, onConfirm, onCancel }: SafetySliderProps) {
    const [sliderPos, setSliderPos] = useState(0); // 0 to 100
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch (_) {}
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const knobWidth = 48;
        const availableWidth = rect.width - knobWidth;
        if (availableWidth <= 0) return;
        const offsetX = e.clientX - rect.left - knobWidth / 2;
        const pct = Math.max(0, Math.min(100, (offsetX / availableWidth) * 100));
        setSliderPos(pct);
    };

    const handlePointerUp = () => {
        if (!isDragging) return;
        setIsDragging(false);
        if (sliderPos >= 85) {
            setSliderPos(100);
            setTimeout(() => {
                onConfirm();
            }, 180);
        } else {
            setSliderPos(0);
        }
    };

    return (
        <div className="space-y-4 pt-2">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 text-xs text-red-600 dark:text-red-400 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div>
                    <span className="font-bold">Atención: </span>
                    Estás a punto de eliminar el privilegio: <span className="font-semibold text-foreground">"{title}"</span>.
                    Para evitar eliminaciones por accidente, debes deslizar la barra de seguridad completamente hacia la derecha.
                </div>
            </div>

            <div
                ref={containerRef}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative h-14 w-full bg-slate-900 border-2 border-red-500/50 rounded-full select-none overflow-hidden flex items-center p-1 cursor-pointer touch-none shadow-inner"
            >
                {/* Relleno dinámico al arrastrar */}
                <div
                    className="absolute left-0 top-0 bottom-0 bg-red-600/35 transition-all pointer-events-none"
                    style={{ width: `${sliderPos}%`, transition: isDragging ? 'none' : 'width 0.25s ease-out' }}
                />

                {/* Texto indicativo */}
                <span
                    className={cn(
                        "absolute inset-0 flex items-center justify-center text-xs md:text-sm font-bold tracking-wider text-slate-300 pointer-events-none uppercase transition-opacity",
                        sliderPos > 70 && "opacity-0"
                    )}
                >
                    Desliza para eliminar ➔
                </span>

                {sliderPos > 70 && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs md:text-sm font-extrabold tracking-wider text-red-400 pointer-events-none uppercase animate-pulse">
                        ¡Suelta para eliminar!
                    </span>
                )}

                {/* Botón deslizador (Knob) */}
                <div
                    onPointerDown={handlePointerDown}
                    className="relative h-12 w-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing hover:bg-red-500 transition-colors z-10"
                    style={{
                        left: `calc(${sliderPos}% - ${(sliderPos / 100) * 48}px)`,
                        transition: isDragging ? 'none' : 'left 0.25s ease-out',
                    }}
                >
                    <ChevronsRight className="w-5 h-5 animate-pulse" />
                </div>
            </div>

            <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" onClick={onCancel} className="text-xs">
                    Cancelar y conservar
                </Button>
            </div>
        </div>
    );
}

export default function MobileAppSettingsPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    
    // Tab activo controlado
    const [activeTab, setActiveTab] = useState('pase_alfa');

    // Estados para minimizar / maximizar tarjetas (por defecto minimizadas para orden visual)
    const [isPaseAlfaOpen, setIsPaseAlfaOpen] = useState(false);
    const [isBeneficiosOpen, setIsBeneficiosOpen] = useState(false);
    const [isLookbookOpen, setIsLookbookOpen] = useState(false);

    // -- PASE ALFA (CONFIGURACIÓN DINÁMICA DE LEALTAD) --
    const [paseAlfaForm, setPaseAlfaForm] = useState({
        activo: true,
        titulo: 'Pase Alfa Club',
        subtitulo: 'Cada visita cuenta. Presenta tu código QR en recepción y disfruta tu corte de cortesía.',
        sellosRequeridos: 10,
        recompensa: '10.° Corte Totalmente Gratis',
        puntosPorVisita: 0,
        instrucciones: 'Presenta tu código QR en recepción al finalizar tu servicio para que el barbero abone tu sello de visita.',
        terminos: 'Válido en sucursales oficiales de Vatos Alfa Barbería. Aplica en cortes y servicios seleccionados.',
    });
    const [loadingPaseAlfa, setLoadingPaseAlfa] = useState(true);
    const [isSavingPaseAlfa, setIsSavingPaseAlfa] = useState(false);

    // -- BENEFICIOS PASE ALFA (ESTRUCTURA RICA) --
    const [privilegios, setPrivilegios] = useState<PrivilegioVIP[]>([]);
    const [loadingMembresia, setLoadingMembresia] = useState(true);
    const [isSavingPrivilegios, setIsSavingPrivilegios] = useState(false);

    // Formulario de Nuevo Beneficio
    const [newTitle, setNewTitle] = useState('');
    const [newActivo, setNewActivo] = useState(true);
    const [newHasExpiry, setNewHasExpiry] = useState(false);
    const [newFechaLimite, setNewFechaLimite] = useState('');
    const [newDatePickerOpen, setNewDatePickerOpen] = useState(false);

    // Modal de Edición
    const [editingPrivilegio, setEditingPrivilegio] = useState<PrivilegioVIP | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editActivo, setEditActivo] = useState(true);
    const [editHasExpiry, setEditHasExpiry] = useState(false);
    const [editFechaLimite, setEditFechaLimite] = useState('');
    const [editDatePickerOpen, setEditDatePickerOpen] = useState(false);

    // Modal de Eliminación con Barra de Seguridad
    const [deletingPrivilegio, setDeletingPrivilegio] = useState<PrivilegioVIP | null>(null);

    // -- INSPIRACIÓN ALFA (LOOKBOOK DE CORTES REALES) --
    const [lookbookItems, setLookbookItems] = useState<LookbookItem[]>([]);
    const [servicesList, setServicesList] = useState<{ id: string; nombre: string }[]>([]);
    const [loadingLookbook, setLoadingLookbook] = useState(true);
    const [isSavingLookbook, setIsSavingLookbook] = useState(false);
    const [isUploadingLookbook, setIsUploadingLookbook] = useState(false);
    const [newLookbookImage, setNewLookbookImage] = useState('');
    const [newLookbookActivo, setNewLookbookActivo] = useState(true);

    // Modal de Eliminación Galería Lookbook
    const [deletingLookbookItem, setDeletingLookbookItem] = useState<LookbookItem | null>(null);

    useEffect(() => {
        async function fetchConfig() {
            try {
                let rawBenefits: any[] = [];

                // 1. Cargar configuracion/pase_alfa y configuracion/app_movil en paralelo para merge seguro
                const [paseSnap, appMovilSnap] = await Promise.all([
                    getDoc(doc(db, 'configuracion', 'pase_alfa')),
                    getDoc(doc(db, 'configuracion', 'app_movil')),
                ]);

                const paseData = paseSnap.exists() ? paseSnap.data() : null;
                const mData = appMovilSnap.exists() ? appMovilSnap.data() : null;
                const appMovilPaseData = mData ? (mData.pase_alfa || mData) : null;

                // Combinar inteligentemente sin sobrescribir con campos vacíos
                const merged = {
                    ...(appMovilPaseData || {}),
                    ...(paseData || {}),
                };

                // Si paseData tenía campos vacíos pero appMovil los tenía llenos (ej. términos), preservarlos
                if (appMovilPaseData) {
                    if (!merged.terminos && appMovilPaseData.terminos) merged.terminos = appMovilPaseData.terminos;
                    if (!merged.instrucciones && appMovilPaseData.instrucciones) merged.instrucciones = appMovilPaseData.instrucciones;
                    if (!merged.subtitulo && appMovilPaseData.subtitulo) merged.subtitulo = appMovilPaseData.subtitulo;
                }

                if (paseData || appMovilPaseData) {
                    setPaseAlfaForm({
                        activo: merged.activo !== undefined ? Boolean(merged.activo) : true,
                        titulo: merged.titulo || 'Pase Alfa Club',
                        subtitulo: merged.subtitulo || '',
                        sellosRequeridos: Number(merged.sellosRequeridos) || 10,
                        recompensa: merged.recompensa || '10.° Corte Totalmente Gratis',
                        puntosPorVisita: merged.puntosPorVisita !== undefined ? Number(merged.puntosPorVisita) : 0,
                        instrucciones: merged.instrucciones || '',
                        terminos: merged.terminos || '',
                    });

                    if (Array.isArray(merged.beneficios_detallados) && merged.beneficios_detallados.length > 0) {
                        rawBenefits = merged.beneficios_detallados;
                    } else if (Array.isArray(merged.beneficios)) {
                        rawBenefits = merged.beneficios;
                    }
                }

                // Fallback a ajustes_sitio/membresia_vip si no hay beneficios
                if (rawBenefits.length === 0) {
                    const docRef = doc(db, 'ajustes_sitio', 'membresia_vip');
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const vData = docSnap.data();
                        if (Array.isArray(vData.beneficios_detallados) && vData.beneficios_detallados.length > 0) {
                            rawBenefits = vData.beneficios_detallados;
                        } else if (Array.isArray(vData.beneficios)) {
                            rawBenefits = vData.beneficios;
                        }
                    }
                }

                // Normalización de privilegios a la estructura rica
                const parsedPrivilegios: PrivilegioVIP[] = rawBenefits.map((item: any, idx: number) => {
                    if (typeof item === 'object' && item !== null) {
                        return {
                            id: item.id || `priv_${idx}_${Date.now()}`,
                            titulo: item.titulo || item.nombre || String(item),
                            activo: item.activo !== false,
                            fechaLimite: item.fechaLimite || null,
                            creado_el: item.creado_el || null,
                        };
                    }
                    return {
                        id: `priv_${idx}_${Date.now()}`,
                        titulo: String(item),
                        activo: true,
                        fechaLimite: null,
                        creado_el: null,
                    };
                });

                setPrivilegios(parsedPrivilegios);

                // 4. Cargar servicios para el selector de Inspiración Alfa
                try {
                    const servSnap = await getDocs(collection(db, 'servicios'));
                    const sList = servSnap.docs.map(d => ({
                        id: d.id,
                        nombre: d.data().name || d.data().nombre || d.id
                    }));
                    setServicesList(sList);
                } catch (errServ) {
                    console.warn('Error cargando servicios:', errServ);
                }

                // 5. Cargar galería de Inspiración Alfa (Lookbook)
                let rawLookbook: LookbookItem[] = [];
                try {
                    const lookbookRef = doc(db, 'configuracion', 'inspiracion_alfa');
                    const lookbookSnap = await getDoc(lookbookRef);
                    if (lookbookSnap.exists() && Array.isArray(lookbookSnap.data().items) && lookbookSnap.data().items.length > 0) {
                        rawLookbook = lookbookSnap.data().items;
                    } else {
                        // Fallback a app_movil
                        const appMovilRef = doc(db, 'configuracion', 'app_movil');
                        const appMovilSnap = await getDoc(appMovilRef);
                        if (appMovilSnap.exists() && Array.isArray(appMovilSnap.data().inspiracion_alfa) && appMovilSnap.data().inspiracion_alfa.length > 0) {
                            rawLookbook = appMovilSnap.data().inspiracion_alfa;
                        } else {
                            rawLookbook = DEFAULT_LOOKBOOK_ITEMS;
                        }
                    }
                } catch (errLb) {
                    console.warn('Error cargando inspiracion alfa:', errLb);
                    rawLookbook = DEFAULT_LOOKBOOK_ITEMS;
                }
                setLookbookItems(rawLookbook);
            } catch (e) {
                console.error('Error cargando configuración móvil:', e);
            } finally {
                setLoadingPaseAlfa(false);
                setLoadingMembresia(false);
                setLoadingLookbook(false);
            }
        }
        fetchConfig();
    }, []);


    // --- PASE ALFA SAVE HANDLER ---
    const handleSavePaseAlfa = async () => {
        setIsSavingPaseAlfa(true);
        try {
            const sellosNum = Math.max(1, Math.min(20, Number(paseAlfaForm.sellosRequeridos) || 10));

            const detailedPayload = privilegios.map((p) => ({
                id: p.id,
                titulo: p.titulo.trim(),
                activo: Boolean(p.activo),
                fechaLimite: p.fechaLimite || null,
                creado_el: p.creado_el || new Date().toISOString(),
            }));

            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const activeTitles = privilegios
                .filter((p) => p.activo && (!p.fechaLimite || p.fechaLimite >= todayStr))
                .map((p) => p.titulo.trim())
                .filter(Boolean);

            const payload = {
                activo: Boolean(paseAlfaForm.activo),
                titulo: paseAlfaForm.titulo.trim() || 'Pase Alfa Club',
                subtitulo: paseAlfaForm.subtitulo.trim(),
                sellosRequeridos: sellosNum,
                recompensa: paseAlfaForm.recompensa.trim() || `${sellosNum}.° Corte Totalmente Gratis`,
                puntosPorVisita: Math.max(0, Number(paseAlfaForm.puntosPorVisita) || 0),
                instrucciones: paseAlfaForm.instrucciones.trim(),
                terminos: paseAlfaForm.terminos.trim(),
                beneficios: activeTitles,
                beneficios_detallados: detailedPayload,
                actualizado_el: Timestamp.now(),
                actualizado_por: user?.email || 'admin',
            };

            // 1. Guardar en configuracion/pase_alfa
            await setDoc(doc(db, 'configuracion', 'pase_alfa'), payload, { merge: true });

            // 2. Guardar en configuracion/app_movil
            await setDoc(doc(db, 'configuracion', 'app_movil'), {
                pase_alfa: payload,
                actualizado_el: Timestamp.now(),
            }, { merge: true });

            // 3. Sincronizar retrocompatibilidad con ajustes_sitio/membresia_vip
            await setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                beneficios: activeTitles,
                beneficios_detallados: detailedPayload,
                actualizado_el: Timestamp.now(),
            }, { merge: true });

            // 4. Registro de Auditoría
            await logAuditAction({
                action: 'Modificar Pase Alfa',
                details: `Sellos: ${payload.sellosRequeridos}, Premio: "${payload.recompensa}", Beneficios: ${payload.beneficios.length}`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'info',
            });

            toast({
                title: '¡Pase Alfa Guardado!',
                description: 'La configuración y beneficios han sido actualizados y sincronizados en tiempo real con la app móvil.',
            });
        } catch (e: any) {
            console.error('Error guardando Pase Alfa:', e);
            toast({
                title: 'Error al guardar Pase Alfa',
                description: e.message || 'No se pudo guardar la configuración.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingPaseAlfa(false);
        }
    };

    // --- PRIVILEGIOS VIP HANDLERS ---
    const handleAddPrivilegio = () => {
        if (!newTitle.trim()) {
            return toast({
                title: 'Campo Requerido',
                description: 'Por favor escribe la descripción del privilegio antes de agregar.',
                variant: 'destructive',
            });
        }
        if (newHasExpiry && !newFechaLimite) {
            return toast({
                title: 'Fecha Requerida',
                description: 'Has activado la fecha límite. Por favor selecciona una fecha válida.',
                variant: 'destructive',
            });
        }

        const newPriv: PrivilegioVIP = {
            id: `priv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            titulo: newTitle.trim(),
            activo: newActivo,
            fechaLimite: newHasExpiry && newFechaLimite ? newFechaLimite : null,
            creado_el: new Date().toISOString(),
        };

        setPrivilegios((prev) => [newPriv, ...prev]);
        setNewTitle('');
        setNewActivo(true);
        setNewHasExpiry(false);
        setNewFechaLimite('');

        toast({
            title: 'Privilegio Agregado a la Lista',
            description: 'Recuerda hacer clic en "Guardar Privilegios VIP" para sincronizar los cambios.',
        });
    };

    const handleTogglePrivilegio = (id: string, activo: boolean) => {
        setPrivilegios((prev) =>
            prev.map((p) => (p.id === id ? { ...p, activo } : p))
        );
        toast({
            title: activo ? 'Privilegio Activado' : 'Privilegio Pausado',
            description: activo
                ? 'El beneficio estará visible para los clientes VIP al guardar.'
                : 'El beneficio ha sido pausado y no se mostrará a los clientes.',
        });
    };

    const handleStartEdit = (priv: PrivilegioVIP) => {
        setEditingPrivilegio(priv);
        setEditTitle(priv.titulo);
        setEditActivo(priv.activo);
        setEditHasExpiry(Boolean(priv.fechaLimite));
        setEditFechaLimite(priv.fechaLimite || '');
    };

    const handleSaveEdit = () => {
        if (!editingPrivilegio) return;
        if (!editTitle.trim()) {
            return toast({
                title: 'Campo Requerido',
                description: 'El título del privilegio no puede estar vacío.',
                variant: 'destructive',
            });
        }
        if (editHasExpiry && !editFechaLimite) {
            return toast({
                title: 'Fecha Requerida',
                description: 'Selecciona una fecha válida de vencimiento.',
                variant: 'destructive',
            });
        }

        setPrivilegios((prev) =>
            prev.map((p) =>
                p.id === editingPrivilegio.id
                    ? {
                          ...p,
                          titulo: editTitle.trim(),
                          activo: editActivo,
                          fechaLimite: editHasExpiry && editFechaLimite ? editFechaLimite : null,
                      }
                    : p
            )
        );

        setEditingPrivilegio(null);
        toast({
            title: 'Cambios aplicados',
            description: 'El privilegio ha sido modificado. Haz clic en "Guardar Privilegios VIP" para confirmar en la base de datos.',
        });
    };

    const handleStartDelete = (priv: PrivilegioVIP) => {
        setDeletingPrivilegio(priv);
    };

    const handleConfirmDelete = () => {
        if (!deletingPrivilegio) return;
        const targetId = deletingPrivilegio.id;
        const targetTitle = deletingPrivilegio.titulo;
        setPrivilegios((prev) => prev.filter((p) => p.id !== targetId));
        setDeletingPrivilegio(null);
        toast({
            title: 'Privilegio Eliminado',
            description: `Se eliminó "${targetTitle}". Guarda los cambios para actualizar la app móvil.`,
        });
    };

    const handleSavePrivilegios = async () => {
        setIsSavingPrivilegios(true);
        try {
            const detailedPayload = privilegios.map((p) => ({
                id: p.id,
                titulo: p.titulo.trim(),
                activo: Boolean(p.activo),
                fechaLimite: p.fechaLimite || null,
                creado_el: p.creado_el || new Date().toISOString(),
            }));

            const todayStr = format(new Date(), 'yyyy-MM-dd');
            // Array simple de títulos activos y no expirados para 100% retrocompatibilidad
            const activeTitles = privilegios
                .filter((p) => p.activo && (!p.fechaLimite || p.fechaLimite >= todayStr))
                .map((p) => p.titulo.trim())
                .filter(Boolean);

            // 1. Guardar en ajustes_sitio/membresia_vip
            await setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                beneficios: activeTitles,
                beneficios_detallados: detailedPayload,
                updatedAt: Timestamp.now(),
            }, { merge: true });

            // 2. Guardar en configuracion/pase_alfa
            await setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                beneficios: activeTitles,
                beneficios_detallados: detailedPayload,
                actualizado_el: Timestamp.now(),
            }, { merge: true });

            // 3. Sincronizar en configuracion/app_movil
            await setDoc(doc(db, 'configuracion', 'app_movil'), {
                'pase_alfa.beneficios': activeTitles,
                'pase_alfa.beneficios_detallados': detailedPayload,
                actualizado_el: Timestamp.now(),
            }, { merge: true });

            // 4. Registro de Auditoría
            await logAuditAction({
                action: 'Modificar Beneficios Pase Alfa',
                details: `Total: ${privilegios.length} beneficios configurados (${activeTitles.length} activos en app móvil)`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'info',
            });

            toast({
                title: '¡Beneficios Pase Alfa Guardados!',
                description: `Se sincronizaron ${activeTitles.length} beneficios activos con la aplicación móvil.`,
            });
        } catch (e: any) {
            console.error('Error guardando beneficios:', e);
            toast({
                title: 'Error al guardar beneficios',
                description: e.message || 'No se pudieron guardar los cambios en la base de datos.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingPrivilegios(false);
        }
    };

    // --- INSPIRACIÓN ALFA (LOOKBOOK) HANDLERS ---
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
            description: 'Recuerda hacer clic en "Guardar Galería de Cortes" para sincronizar los cambios con la app móvil.',
        });
    };

    const handleToggleLookbookItem = (id: string, activo: boolean) => {
        setLookbookItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, activo } : item))
        );
        toast({
            title: activo ? 'Fotografía Activada' : 'Fotografía Pausada',
            description: activo
                ? 'La fotografía se mostrará en la app móvil al guardar.'
                : 'La fotografía se ha pausado y se ocultará en la app.',
        });
    };

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
            description: 'Se eliminó la fotografía de la galería. Recuerda guardar cambios para sincronizar con la app.',
        });
    };

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

            // 1. Guardar en configuracion/inspiracion_alfa
            await setDoc(
                doc(db, 'configuracion', 'inspiracion_alfa'),
                {
                    items: cleanItems,
                    actualizado_el: Timestamp.now(),
                    actualizado_por: user?.email || 'admin',
                },
                { merge: true }
            );

            // 2. Sincronizar en configuracion/app_movil
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
                action: 'Modificar Inspiración Alfa',
                details: `Total: ${cleanItems.length} estilos/cortes (${cleanItems.filter((i) => i.activo).length} activos en app móvil)`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'info',
            });

            toast({
                title: '¡Inspiración Alfa Guardada!',
                description: `Se sincronizaron ${cleanItems.filter((i) => i.activo).length} cortes reales en tiempo real con la app móvil.`,
            });
        } catch (e: any) {
            console.error('Error guardando Inspiración Alfa:', e);
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
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold tracking-tight">App Móvil</h3>
                <p className="text-muted-foreground">
                    Gestiona el Pase Alfa de lealtad, comunicados, promociones y privilegios VIP de tu aplicación móvil VATOS ALFA en tiempo real.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="pase_alfa">Pase Alfa</TabsTrigger>
                    <TabsTrigger value="promociones">Promociones</TabsTrigger>
                </TabsList>

                {/* PASE ALFA TAB */}
                <TabsContent value="pase_alfa" className="mt-6 space-y-6">
                    <Card className="border border-border/70 shadow-sm transition-all">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <Award className="h-5 w-5 text-primary shrink-0" />
                                    <div className="flex items-center gap-1.5">
                                        <CardTitle className="text-base font-semibold">
                                            Programa Pase Alfa
                                        </CardTitle>
                                        <InfoTooltip text="Configura los sellos necesarios, recompensa y textos del Pase Alfa que ven tus clientes en su app móvil." />
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <Switch
                                        checked={paseAlfaForm.activo}
                                        onCheckedChange={(checked) =>
                                            setPaseAlfaForm((prev) => ({ ...prev, activo: checked }))
                                        }
                                        title={paseAlfaForm.activo ? "Pase Alfa Activo" : "Pase Alfa Pausado"}
                                        aria-label="Pase Alfa Activo"
                                    />

                                    <button
                                        type="button"
                                        onClick={() => setIsPaseAlfaOpen(!isPaseAlfaOpen)}
                                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                        title={isPaseAlfaOpen ? "Minimizar" : "Desplegar"}
                                        aria-label={isPaseAlfaOpen ? "Minimizar" : "Desplegar"}
                                    >
                                        {isPaseAlfaOpen ? (
                                            <ChevronUp className="w-5 h-5" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </CardHeader>

                        {isPaseAlfaOpen && (
                            loadingPaseAlfa ? (
                                <CardContent className="py-8 flex justify-center">
                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                </CardContent>
                            ) : (
                                <CardContent className="space-y-4 pt-1 px-4 sm:px-6 pb-5">
                                    {/* PARÁMETROS BÁSICOS */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-border/50 pt-3">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-medium">Título del Pase</Label>
                                                <InfoTooltip text="Nombre visible en la tarjeta y en la pestaña de lealtad de la app móvil." />
                                            </div>
                                            <Input
                                                value={paseAlfaForm.titulo}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, titulo: e.target.value })}
                                                placeholder="Ej. Pase Alfa Club"
                                                className="h-8.5 text-xs sm:text-sm font-medium"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-medium">Recompensa al completar sellos</Label>
                                                <InfoTooltip text="Premio que se desbloquea al llenar la tarjeta (ej. 10.° Corte Totalmente Gratis)." />
                                            </div>
                                            <Input
                                                value={paseAlfaForm.recompensa}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, recompensa: e.target.value })}
                                                placeholder="Ej. 10.° Corte Totalmente Gratis"
                                                className="h-8.5 text-xs sm:text-sm font-medium"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-medium">Meta de Sellos Requeridos</Label>
                                                <InfoTooltip text="Número de visitas o servicios requeridos para ganar la recompensa." />
                                            </div>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    max="20"
                                                    value={paseAlfaForm.sellosRequeridos}
                                                    onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, sellosRequeridos: Number(e.target.value) || 10 })}
                                                    className="h-8.5 text-xs sm:text-sm font-semibold pr-14"
                                                />
                                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">sellos</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* TEXTOS DESCRIPTIVOS */}
                                    <div className="space-y-3 border-t border-border/50 pt-3">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-medium">Subtítulo / Lema Explicativo</Label>
                                                <InfoTooltip text="Lema o frase explicativa visible en la cabecera del pase en la app móvil." />
                                            </div>
                                            <Textarea
                                                value={paseAlfaForm.subtitulo}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, subtitulo: e.target.value })}
                                                placeholder="Ej. Cada visita cuenta. Presenta tu código QR en recepción y disfruta tu corte de cortesía."
                                                rows={2}
                                                className="text-xs sm:text-sm min-h-[52px] py-1.5 px-3 resize-y"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Label className="text-xs font-medium">Instrucciones de Escaneo (Modal QR)</Label>
                                                    <InfoTooltip text="Instrucciones que ve el cliente al abrir su código QR en recepción para sellar su visita." />
                                                </div>
                                                <Textarea
                                                    value={paseAlfaForm.instrucciones}
                                                    onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, instrucciones: e.target.value })}
                                                    placeholder="Ej. Presenta tu código QR en recepción al finalizar tu servicio..."
                                                    rows={2}
                                                    className="text-xs sm:text-sm min-h-[52px] py-1.5 px-3 resize-y"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Label className="text-xs font-medium">Términos y Condiciones del Pase</Label>
                                                    <InfoTooltip text="Reglas, restricciones y validez aplicables al Pase Alfa que ven tus clientes." />
                                                </div>
                                                <Textarea
                                                    value={paseAlfaForm.terminos}
                                                    onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, terminos: e.target.value })}
                                                    placeholder="Ej. Válido en sucursales oficiales de Vatos Alfa Barbería..."
                                                    rows={2}
                                                    className="text-xs sm:text-sm min-h-[52px] py-1.5 px-3 resize-y"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* RESUMEN DE BENEFICIOS Y ENLACE DIRECTO */}
                                    <div className="space-y-2.5 border-t border-border/50 pt-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                                                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                                                    Resumen de Beneficios Pase Alfa
                                                </Label>
                                                <InfoTooltip text="Cortesías y beneficios activos que ven tus clientes en su app móvil." />
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                                <Award className="w-3.5 h-3.5" />
                                                {privilegios.filter(p => p.activo && !isPrivilegeExpired(p.fechaLimite)).length} Beneficios Activos
                                            </div>
                                        </div>

                                        <div className="space-y-1.5 border rounded-lg p-2.5 bg-muted/20">
                                            {privilegios.length === 0 ? (
                                                <div className="text-center py-4 text-muted-foreground text-xs">
                                                    <Info className="w-4 h-4 mx-auto mb-1 text-muted-foreground/60" />
                                                    No hay beneficios configurados aún. Utiliza el panel de abajo para agregar cortesías.
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {privilegios.map((p, idx) => (
                                                        <div key={p.id || idx} className="flex items-center justify-between bg-background p-2 rounded-md border border-border/60 shadow-xs">
                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn(
                                                                        "text-[10px] shrink-0 font-medium py-0 px-1.5",
                                                                        p.activo
                                                                            ? "text-[#202A49] dark:text-slate-200 border-[#202A49]/30 dark:border-slate-700 bg-[#202A49]/10 dark:bg-slate-800"
                                                                            : "text-muted-foreground border-border bg-muted/40"
                                                                    )}
                                                                >
                                                                    {p.activo ? "Activo" : "Pausado"}
                                                                </Badge>
                                                                <span className={cn("text-xs font-medium truncate", !p.activo && "text-muted-foreground line-through")}>
                                                                    {p.titulo}
                                                                </span>
                                                            </div>
                                                            {p.fechaLimite && (
                                                                <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                                                                    Vence: {p.fechaLimite}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* BOTÓN GUARDAR PASE ALFA */}
                                    <div className="flex justify-end pt-3 border-t border-border/50">
                                        <Button
                                            onClick={handleSavePaseAlfa}
                                            disabled={isSavingPaseAlfa}
                                            className="bg-[#202A49] hover:bg-[#182038] text-white font-semibold text-xs sm:text-sm px-5 h-9 shadow-sm flex items-center gap-2"
                                        >
                                            {isSavingPaseAlfa ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                    Guardando en la App...
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="w-3.5 h-3.5 mr-1.5" />
                                                    Guardar Configuración del Pase Alfa
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            )
                        )}
                    </Card>
                    {/* GESTOR DE BENEFICIOS PASE ALFA */}
                    <Card className="border border-border/70 shadow-sm transition-all">
                        <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Award className="h-4.5 w-4.5 text-primary shrink-0" />
                                    <div className="flex items-center gap-1.5">
                                        <CardTitle className="text-base font-semibold">
                                            Beneficios Pase Alfa
                                        </CardTitle>
                                        <InfoTooltip text="Configura las cortesías y beneficios del Pase Alfa. Activa, apaga, programa vigencias o edita beneficios que disfrutan todos los usuarios en la app móvil." />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="secondary" className="bg-[#202A49]/10 text-[#202A49] dark:bg-white/10 dark:text-slate-200 border border-[#202A49]/20 text-xs py-0.5 px-2 font-medium">
                                        {privilegios.filter(p => p.activo && !isPrivilegeExpired(p.fechaLimite)).length} Activos en App
                                    </Badge>
                                    <Badge variant="outline" className="text-muted-foreground text-xs py-0.5 px-2 font-normal">
                                        {privilegios.length} Total
                                    </Badge>
                                    <button
                                        type="button"
                                        onClick={() => setIsBeneficiosOpen(!isBeneficiosOpen)}
                                        className="text-muted-foreground hover:text-foreground transition-colors p-1 ml-1"
                                        title={isBeneficiosOpen ? "Minimizar" : "Desplegar"}
                                        aria-label={isBeneficiosOpen ? "Minimizar" : "Desplegar"}
                                    >
                                        {isBeneficiosOpen ? (
                                            <ChevronUp className="w-4.5 h-4.5" />
                                        ) : (
                                            <ChevronDown className="w-4.5 h-4.5" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </CardHeader>

                        {isBeneficiosOpen && (
                            <CardContent className="space-y-4 pt-1 px-4 sm:px-6 pb-5">
                                {/* FORMULARIO AGREGAR BENEFICIO */}
                                <div className="bg-muted/20 border border-border/70 rounded-lg p-3 sm:p-3.5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                                                <Plus className="w-3.5 h-3.5 text-primary" />
                                                Agregar Nuevo Beneficio
                                            </Label>
                                            <InfoTooltip text="Escribe una cortesía o beneficio exclusivo para los miembros del Pase Alfa." />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="new-activo-toggle" className="text-[11px] font-medium cursor-pointer text-muted-foreground">
                                                {newActivo ? 'Activo' : 'Pausado'}
                                            </Label>
                                            <Switch
                                                id="new-activo-toggle"
                                                checked={newActivo}
                                                onCheckedChange={setNewActivo}
                                                className="scale-90"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Input
                                            value={newTitle}
                                            onChange={(e) => setNewTitle(e.target.value)}
                                            placeholder="Ej. Bebida de cortesía en cada corte o servicio"
                                            className="bg-background text-xs sm:text-sm h-8.5"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddPrivilegio()}
                                        />
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <Switch
                                                    id="new-expiry-toggle"
                                                    checked={newHasExpiry}
                                                    onCheckedChange={setNewHasExpiry}
                                                    className="scale-90"
                                                />
                                                <Label htmlFor="new-expiry-toggle" className="text-xs cursor-pointer font-medium text-foreground/80">
                                                    Fecha límite de vigencia
                                                </Label>
                                                <InfoTooltip text="Si se activa, el beneficio expirará y se ocultará automáticamente al llegar a la fecha límite." />
                                            </div>

                                            {newHasExpiry && (
                                                <div className="flex items-center gap-2 animate-in fade-in duration-200">
                                                    <Popover modal={true} open={newDatePickerOpen} onOpenChange={setNewDatePickerOpen}>
                                                        <PopoverTrigger asChild>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                className={cn(
                                                                    "h-7 text-xs px-2 font-normal justify-start text-left bg-background",
                                                                    !newFechaLimite && "text-muted-foreground"
                                                                )}
                                                            >
                                                                <CalendarDays className="mr-1 h-3 w-3 shrink-0 text-muted-foreground" />
                                                                <span className="truncate">
                                                                    {parseDateSafe(newFechaLimite)
                                                                        ? format(parseDateSafe(newFechaLimite)!, "dd 'de' MMM, yyyy", { locale: es })
                                                                        : "Seleccionar fecha"}
                                                                </span>
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 z-[60]" align="start">
                                                            <Calendar
                                                                mode="single"
                                                                selected={parseDateSafe(newFechaLimite)}
                                                                onSelect={(date) => {
                                                                    if (date) {
                                                                        setNewFechaLimite(format(date, 'yyyy-MM-dd'));
                                                                        setNewDatePickerOpen(false);
                                                                    }
                                                                }}
                                                                disabled={(date) => {
                                                                    const today = new Date();
                                                                    today.setHours(0, 0, 0, 0);
                                                                    return date < today;
                                                                }}
                                                                initialFocus
                                                                locale={es}
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                            )}
                                        </div>

                                        <Button
                                            onClick={handleAddPrivilegio}
                                            className="bg-[#202A49] hover:bg-[#182038] text-white font-semibold text-xs h-8 px-3.5 shrink-0 shadow-xs flex items-center gap-1.5"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            Agregar Beneficio
                                        </Button>
                                    </div>
                                </div>

                                {/* LISTA DE BENEFICIOS */}
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <h4 className="text-xs font-semibold text-foreground">
                                                Lista de Beneficios ({privilegios.length})
                                            </h4>
                                            <InfoTooltip text="Puedes activar, pausar o programar vigencias de cualquier beneficio sin eliminarlo." />
                                        </div>
                                    </div>

                                    {loadingMembresia ? (
                                        <div className="py-8 flex justify-center">
                                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                        </div>
                                    ) : privilegios.length === 0 ? (
                                        <div className="border border-dashed border-border/80 rounded-lg p-6 text-center bg-muted/10 space-y-1.5">
                                            <ShieldCheck className="w-7 h-7 mx-auto text-muted-foreground/60" />
                                            <p className="text-xs font-medium text-foreground">No hay beneficios configurados</p>
                                            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                                                Utiliza el formulario de arriba para agregar cortesías o beneficios del Pase Alfa.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {privilegios.map((priv) => {
                                                const expired = isPrivilegeExpired(priv.fechaLimite);

                                                return (
                                                    <div
                                                        key={priv.id}
                                                        className={cn(
                                                            "flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-lg border bg-background shadow-xs transition-all",
                                                            !priv.activo && "opacity-60 bg-muted/20 border-border/60",
                                                            expired && "border-red-500/30 bg-red-500/5"
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                                            <div className="pt-0.5">
                                                                <Switch
                                                                    checked={priv.activo}
                                                                    onCheckedChange={(val) => handleTogglePrivilegio(priv.id, val)}
                                                                    title={priv.activo ? "Apagar beneficio" : "Encender beneficio"}
                                                                    className="scale-90"
                                                                />
                                                            </div>

                                                            <div className="space-y-1 flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={cn(
                                                                            "text-[10px] font-medium py-0 px-1.5",
                                                                            priv.activo
                                                                                ? "text-[#202A49] dark:text-slate-200 border-[#202A49]/30 dark:border-slate-700 bg-[#202A49]/10 dark:bg-slate-800"
                                                                                : "text-muted-foreground border-border bg-muted/40"
                                                                        )}
                                                                    >
                                                                        {priv.activo ? "Activo" : "Apagado"}
                                                                    </Badge>

                                                                    {priv.fechaLimite ? (
                                                                        expired ? (
                                                                            <Badge variant="destructive" className="text-[10px] flex items-center gap-1 py-0 px-1.5">
                                                                                <Clock className="w-2.5 h-2.5" />
                                                                                Expiró: {formatDateDisplay(priv.fechaLimite)}
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-400/30 bg-blue-500/5 flex items-center gap-1 py-0 px-1.5">
                                                                                <CalendarDays className="w-2.5 h-2.5" />
                                                                                Vence: {formatDateDisplay(priv.fechaLimite)}
                                                                            </Badge>
                                                                        )
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-border py-0 px-1.5">
                                                                            Permanente
                                                                        </Badge>
                                                                    )}
                                                                </div>

                                                                <p className={cn(
                                                                    "text-xs font-medium text-foreground leading-snug break-words",
                                                                    !priv.activo && "text-muted-foreground"
                                                                )}>
                                                                    {priv.titulo}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-1.5 sm:pt-0 w-full sm:w-auto justify-end">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleStartEdit(priv)}
                                                                className="h-7 px-2 text-[11px] gap-1 border-border/80 hover:bg-muted"
                                                            >
                                                                <Pencil className="w-3 h-3 text-muted-foreground" />
                                                                Editar
                                                            </Button>

                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleStartDelete(priv)}
                                                                className="h-7 px-2 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-500/10 gap-1"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                                Eliminar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* BOTÓN GUARDAR BENEFICIOS */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-border/50">
                                    <span className="text-[11px] text-muted-foreground">
                                        Los cambios se sincronizan en tiempo real con la app móvil al guardar.
                                    </span>
                                    <Button
                                        onClick={handleSavePrivilegios}
                                        disabled={isSavingPrivilegios}
                                        className="bg-[#202A49] hover:bg-[#182038] text-white font-semibold text-xs sm:text-sm px-5 h-9 shadow-sm w-full sm:w-auto flex items-center gap-2"
                                    >
                                        {isSavingPrivilegios ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                Guardando beneficios...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-3.5 h-3.5 mr-1.5" />
                                                Guardar Beneficios Pase Alfa
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        )}
                    </Card>

                    {/* GESTOR DE INSPIRACIÓN ALFA (CORTES REALES Y LOOKBOOK EN VIVO) */}
                    <Card className="border border-border/70 shadow-sm transition-all">
                        <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Camera className="h-4.5 w-4.5 text-primary shrink-0" />
                                    <div className="flex items-center gap-1.5">
                                        <CardTitle className="text-base font-semibold">
                                            Galería de Cortes
                                        </CardTitle>
                                        <InfoTooltip text="Sube fotos de cortes y peinados reales realizados en tu barbería. Se mostrarán al instante en el carrusel de Inspiración Alfa de la app móvil." />
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="secondary" className="bg-[#202A49]/10 text-[#202A49] dark:bg-white/10 dark:text-slate-200 border border-[#202A49]/20 text-xs py-0.5 px-2 font-medium">
                                        {lookbookItems.filter(i => i.activo).length} Visibles en App
                                    </Badge>
                                    <Badge variant="outline" className="text-muted-foreground text-xs py-0.5 px-2 font-normal">
                                        {lookbookItems.length} Total
                                    </Badge>
                                    <button
                                        type="button"
                                        onClick={() => setIsLookbookOpen(!isLookbookOpen)}
                                        className="text-muted-foreground hover:text-foreground transition-colors p-1 ml-1"
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
                                            <InfoTooltip text="Arrastra y suelta imágenes o haz clic para importar fotos de cortes reales para la app móvil." />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="new-lookbook-activo-toggle" className="text-[11px] font-medium cursor-pointer text-muted-foreground">
                                                {newLookbookActivo ? 'Visible' : 'Oculto'}
                                            </Label>
                                            <Switch
                                                id="new-lookbook-activo-toggle"
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
                                                onClick={() => handleAddLookbookItem()}
                                                className="bg-[#202A49] hover:bg-[#182038] text-white font-semibold text-xs h-7.5 px-3.5 shrink-0 shadow-xs flex items-center gap-1.5"
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
                                                <InfoTooltip text="Puedes activar u ocultar cualquier fotografía en la app sin eliminarla." />
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
                                                    Arrastra o importa fotografías de cortes reales arriba para que tus clientes se inspiren en la app móvil.
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
                                                                    title={item.activo ? "Visible en la app (clic para ocultar)" : "Oculto (clic para activar)"}
                                                                    className="scale-75 origin-left"
                                                                />
                                                                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                                                    {item.activo ? 'Activo' : 'Pausado'}
                                                                </span>
                                                            </div>

                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleStartDeleteLookbook(item)}
                                                                className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-md transition-colors"
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
                                        Los cambios se sincronizan en tiempo real con el carrusel de la app móvil.
                                    </span>
                                    <Button
                                        onClick={handleSaveLookbook}
                                        disabled={isSavingLookbook}
                                        className="bg-[#202A49] hover:bg-[#182038] text-white font-semibold text-xs sm:text-sm px-5 h-9 shadow-sm w-full sm:w-auto flex items-center gap-2"
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
                </TabsContent>

                {/* PROMOCIONES TAB (ESPEJO DE /settings/promotions) */}
                <TabsContent value="promociones" className="mt-6 space-y-6">
                    <PromotionsManager hideHeader />
                </TabsContent>
            </Tabs>

            {/* MODAL DE EDICIÓN DE BENEFICIO */}
            <Dialog open={editingPrivilegio !== null} onOpenChange={(open) => !open && setEditingPrivilegio(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
                            <Pencil className="w-5 h-5 text-primary" />
                            Editar Beneficio Pase Alfa
                        </DialogTitle>
                        <DialogDescription>
                            Modifica la descripción, estado de activación o vigencia de este beneficio del Pase Alfa.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Descripción del Beneficio</Label>
                            <Textarea
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Ej. Bebida de cortesía en cada corte o servicio"
                                rows={3}
                                className="text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between border rounded-xl p-3 bg-muted/20">
                            <div>
                                <Label className="text-xs font-semibold">Estado en la App</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    {editActivo ? 'Visible para usuarios en la app' : 'Pausado temporalmente'}
                                </p>
                            </div>
                            <Switch checked={editActivo} onCheckedChange={setEditActivo} />
                        </div>

                        <div className="border rounded-xl p-3 bg-muted/20 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-xs font-semibold">Fecha Límite / Vigencia</Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        {editHasExpiry ? 'Vigencia programada' : 'Permanente / Sin caducidad'}
                                    </p>
                                </div>
                                <Switch checked={editHasExpiry} onCheckedChange={setEditHasExpiry} />
                            </div>

                            {editHasExpiry && (
                                <div className="pt-2 border-t space-y-1.5">
                                    <Label className="text-xs text-muted-foreground block">Fecha de vencimiento</Label>
                                    <Popover modal={true} open={editDatePickerOpen} onOpenChange={setEditDatePickerOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className={cn(
                                                    "w-full h-9 text-xs px-3 font-normal justify-start text-left bg-background",
                                                    !editFechaLimite && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {parseDateSafe(editFechaLimite)
                                                        ? format(parseDateSafe(editFechaLimite)!, "dd 'de' MMM, yyyy", { locale: es })
                                                        : "Seleccionar fecha"}
                                                </span>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 z-[60]" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={parseDateSafe(editFechaLimite)}
                                                onSelect={(date) => {
                                                    if (date) {
                                                        setEditFechaLimite(format(date, 'yyyy-MM-dd'));
                                                        setEditDatePickerOpen(false);
                                                    }
                                                }}
                                                disabled={(date) => {
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    return date < today;
                                                }}
                                                initialFocus
                                                locale={es}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setEditingPrivilegio(null)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveEdit}
                            className="bg-[#202A49] hover:bg-[#182038] text-white font-semibold"
                        >
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MODAL DE ELIMINACIÓN CON BARRA DE SEGURIDAD */}
            <Dialog open={deletingPrivilegio !== null} onOpenChange={(open) => !open && setDeletingPrivilegio(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                            <ShieldCheck className="w-5 h-5 text-red-600" />
                            Confirmar Eliminación Segura
                        </DialogTitle>
                        <DialogDescription>
                            Para prevenir eliminaciones por accidente, debes deslizar la barra de seguridad para confirmar.
                        </DialogDescription>
                    </DialogHeader>

                    {deletingPrivilegio && (
                        <SafetySlider
                            title={deletingPrivilegio.titulo}
                            onConfirm={handleConfirmDelete}
                            onCancel={() => setDeletingPrivilegio(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* MODAL DE ELIMINACIÓN DE FOTOGRAFÍA / GALERÍA */}
            <Dialog open={deletingLookbookItem !== null} onOpenChange={(open) => !open && setDeletingLookbookItem(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-base">
                            <Trash2 className="w-5 h-5 text-red-600" />
                            Eliminar Fotografía de la Galería
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            ¿Estás seguro de que deseas eliminar esta fotografía? Dejará de aparecer en la galería de la app móvil.
                        </DialogDescription>
                    </DialogHeader>

                    {deletingLookbookItem && (
                        <div className="space-y-4 py-2">
                            <div className="flex items-center justify-center p-3 bg-muted/20 rounded-xl border border-border">
                                <img
                                    src={deletingLookbookItem.imagenUrl}
                                    alt="Fotografía a eliminar"
                                    className="w-32 h-32 object-cover rounded-lg border shadow-xs"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <Button variant="outline" size="sm" onClick={() => setDeletingLookbookItem(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleConfirmDeleteLookbook}
                                    className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
                                >
                                    Eliminar Definitivamente
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
