'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { doc, setDoc, getDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    Loader2,
    Plus,
    Trash2,
    Award,
    Sparkles,
    Save,
    Pencil,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    Maximize2,
    FileText,
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
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export interface PrivilegioVIP {
    id: string;
    titulo: string;
    descripcion?: string;
    terminos?: string;
    imagenUrl?: string | null;
    activo: boolean;
    fechaLimite?: string | null; // YYYY-MM-DD
    creado_el?: any;
}

export interface PaseAlfaConfig {
    activo: boolean;
    titulo: string;
    subtitulo: string;
    sellosRequeridos: number;
    recompensa: string;
    puntosPorVisita: number;
    instrucciones: string;
    terminos: string;
    imagenUrl?: string | null;
}

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

const parseDateSafe = (dateStr?: string | null): Date | undefined => {
    if (!dateStr) return undefined;
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
        return parseISO(dateStr);
    } catch {
        return undefined;
    }
};

const formatDateDisplay = (dateStr?: string | null): string => {
    const d = parseDateSafe(dateStr);
    if (!d) return dateStr || '';
    try {
        return format(d, "dd 'de' MMM, yyyy", { locale: es });
    } catch {
        return dateStr || '';
    }
};

const isPrivilegeExpired = (fechaLimite?: string | null): boolean => {
    if (!fechaLimite) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = parseDateSafe(fechaLimite);
    if (!limit) return false;
    limit.setHours(23, 59, 59, 999);
    return today.getTime() > limit.getTime();
};

interface PaseAlfaManagerProps {
    className?: string;
    onSaveSuccess?: () => void;
}

export function PaseAlfaManager({ className, onSaveSuccess }: PaseAlfaManagerProps) {
    const { user } = useAuth();
    const { toast } = useToast();

    // Estado principal del programa Pase Alfa
    const [paseAlfaForm, setPaseAlfaForm] = useState<PaseAlfaConfig>({
        activo: true,
        titulo: 'Pase Alfa Club',
        subtitulo: '',
        sellosRequeridos: 10,
        recompensa: '10.° Corte Totalmente Gratis',
        puntosPorVisita: 0,
        instrucciones: '',
        terminos: '',
        imagenUrl: '',
    });

    const [loadingPaseAlfa, setLoadingPaseAlfa] = useState(true);
    const [isSavingPaseAlfa, setIsSavingPaseAlfa] = useState(false);
    const [isUploadingPaseAlfaImage, setIsUploadingPaseAlfaImage] = useState(false);
    const [isPaseAlfaOpen, setIsPaseAlfaOpen] = useState(true);

    // Estado de Beneficios VIP
    const [privilegios, setPrivilegios] = useState<PrivilegioVIP[]>([]);
    const [loadingPrivilegios, setLoadingPrivilegios] = useState(true);
    const [isSavingPrivilegios, setIsSavingPrivilegios] = useState(false);
    const [isBeneficiosOpen, setIsBeneficiosOpen] = useState(true);

    // Formulario de edición/creación de beneficio individual
    const [editingBenefitId, setEditingBenefitId] = useState<string | null>(null); // null = listado, 'new' = nuevo, string = editar existente
    const [benefitId, setBenefitId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newDescripcion, setNewDescripcion] = useState('');
    const [newTerminos, setNewTerminos] = useState('');
    const [newImagenUrl, setNewImagenUrl] = useState('');
    const [newActivo, setNewActivo] = useState(true);
    const [newHasExpiry, setNewHasExpiry] = useState(false);
    const [newFechaLimite, setNewFechaLimite] = useState('');
    const [newDatePickerOpen, setNewDatePickerOpen] = useState(false);
    const [isUploadingBenefitImage, setIsUploadingBenefitImage] = useState(false);
    const [deletingBenefit, setDeletingBenefit] = useState<PrivilegioVIP | null>(null);

    // Editor de texto expandido
    const [expandedEditor, setExpandedEditor] = useState<{
        open: boolean;
        title: string;
        description: string;
        currentValue: string;
        onSave: (val: string) => void;
    }>({
        open: false,
        title: '',
        description: '',
        currentValue: '',
        onSave: () => {},
    });
    const [expandedText, setExpandedText] = useState('');

    const openExpandedEditor = (title: string, description: string, value: string, onSave: (val: string) => void) => {
        setExpandedText(value || '');
        setExpandedEditor({
            open: true,
            title,
            description,
            currentValue: value || '',
            onSave,
        });
    };

    // Cargar datos desde Firestore
    useEffect(() => {
        let isMounted = true;
        async function fetchPaseAlfaConfig() {
            setLoadingPaseAlfa(true);
            setLoadingPrivilegios(true);
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

                const merged = {
                    ...(appMovilPaseData || {}),
                    ...(paseData || {}),
                };

                if (appMovilPaseData) {
                    if (!merged.terminos && appMovilPaseData.terminos) merged.terminos = appMovilPaseData.terminos;
                    if (!merged.instrucciones && appMovilPaseData.instrucciones) merged.instrucciones = appMovilPaseData.instrucciones;
                    if (!merged.subtitulo && appMovilPaseData.subtitulo) merged.subtitulo = appMovilPaseData.subtitulo;
                }

                if ((paseData || appMovilPaseData) && isMounted) {
                    setPaseAlfaForm({
                        activo: merged.activo !== undefined ? Boolean(merged.activo) : true,
                        titulo: merged.titulo || 'Pase Alfa Club',
                        subtitulo: merged.subtitulo || '',
                        sellosRequeridos: Number(merged.sellosRequeridos) || 10,
                        recompensa: merged.recompensa || '10.° Corte Totalmente Gratis',
                        puntosPorVisita: merged.puntosPorVisita !== undefined ? Number(merged.puntosPorVisita) : 0,
                        instrucciones: merged.instrucciones || '',
                        terminos: merged.terminos || '',
                        imagenUrl: merged.imagenUrl || merged.imagen || '',
                    });

                    if (Array.isArray(merged.beneficios_detallados) && merged.beneficios_detallados.length > 0) {
                        rawBenefits = merged.beneficios_detallados;
                    } else if (Array.isArray(merged.beneficios)) {
                        rawBenefits = merged.beneficios;
                    }
                }

                // Fallback a ajustes_sitio/membresia_vip
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

                const parsedPrivilegios: PrivilegioVIP[] = rawBenefits.map((item: any, idx: number) => {
                    if (typeof item === 'object' && item !== null) {
                        return {
                            id: item.id || `priv_${idx}_${Date.now()}`,
                            titulo: item.titulo || item.nombre || String(item),
                            descripcion: item.descripcion || '',
                            terminos: item.terminos || '',
                            imagenUrl: item.imagenUrl || item.imagen || null,
                            activo: item.activo !== false,
                            fechaLimite: item.fechaLimite || null,
                            creado_el: item.creado_el || null,
                        };
                    }
                    return {
                        id: `priv_${idx}_${Date.now()}`,
                        titulo: String(item),
                        descripcion: '',
                        terminos: '',
                        imagenUrl: null,
                        activo: true,
                        fechaLimite: null,
                        creado_el: null,
                    };
                });

                if (isMounted) {
                    setPrivilegios(parsedPrivilegios);
                }
            } catch (err) {
                console.warn('Error cargando configuración de Pase Alfa:', err);
            } finally {
                if (isMounted) {
                    setLoadingPaseAlfa(false);
                    setLoadingPrivilegios(false);
                }
            }
        }

        fetchPaseAlfaConfig();

        return () => {
            isMounted = false;
        };
    }, []);

    // --- GUARDAR PASE ALFA EN ESPEJO (configuracion/pase_alfa, configuracion/app_movil, ajustes_sitio/membresia_vip y promociones) ---
    const handleSavePaseAlfa = async () => {
        setIsSavingPaseAlfa(true);
        try {
            const sellosNum = Math.max(1, Math.min(20, Number(paseAlfaForm.sellosRequeridos) || 10));
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const activeTitles = privilegios
                .filter((b) => b.activo && (!b.fechaLimite || b.fechaLimite >= todayStr))
                .map((b) => b.titulo.trim())
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
                imagenUrl: (paseAlfaForm.imagenUrl || '').trim() || null,
                beneficios: activeTitles,
                beneficios_detallados: privilegios,
                actualizado_el: Timestamp.now(),
                actualizado_por: user?.email || 'admin',
            };

            // 1. Guardar en configuracion/pase_alfa (Fuente universal)
            await setDoc(doc(db, 'configuracion', 'pase_alfa'), payload, { merge: true });

            // 2. Sincronizar en espejo con configuracion/app_movil
            await setDoc(
                doc(db, 'configuracion', 'app_movil'),
                {
                    pase_alfa: payload,
                    actualizado_el: Timestamp.now(),
                },
                { merge: true }
            );

            // 3. Sincronizar retrocompatibilidad con ajustes_sitio/membresia_vip
            await setDoc(
                doc(db, 'ajustes_sitio', 'membresia_vip'),
                {
                    beneficios: activeTitles,
                    beneficios_detallados: privilegios,
                    actualizado_el: Timestamp.now(),
                },
                { merge: true }
            );

            // 4. Sincronizar tarjeta de promoción de Pase Alfa
            try {
                const promosRef = collection(db, 'promociones');
                const promosSnap = await getDocs(promosRef);

                let targetPromoId: string | null = null;
                promosSnap.docs.forEach((d) => {
                    const data = d.data();
                    const name = (data.name || data.titulo || data.title || '').toLowerCase();
                    if (
                        d.id === 'DSVwbmEtiK1xJzJjwrqu' ||
                        d.id === 'promo_pase_alfa' ||
                        data.es_pase_alfa === true ||
                        name.includes('decima') ||
                        name.includes('décima') ||
                        name.includes('pase alfa')
                    ) {
                        targetPromoId = d.id;
                    }
                });

                const promoData = {
                    name: payload.titulo || 'La decima ES GRATIS',
                    title: payload.titulo || 'La decima ES GRATIS',
                    titulo: payload.titulo || 'La decima ES GRATIS',
                    imageUrl: payload.imagenUrl || '',
                    imagenUrl: payload.imagenUrl || '',
                    description: payload.subtitulo
                        ? `${payload.subtitulo}\n\nAcumula ${payload.sellosRequeridos} visitas en VATOS ALFA y en tu décima visita recibe ${payload.recompensa}.\n\nCada visita suma automáticamente a tu progreso desde nuestra app.`
                        : `Acumula ${payload.sellosRequeridos} visitas en VATOS ALFA y en tu décima visita recibe ${payload.recompensa}.`,
                    termsAndConditions: payload.terminos || '',
                    terminos: payload.terminos || '',
                    active: Boolean(payload.activo),
                    activo: Boolean(payload.activo),
                    es_pase_alfa: true,
                    endDate: '2035-12-31',
                    startDate: format(new Date(), 'yyyy-MM-dd'),
                    updatedAt: Timestamp.now(),
                };

                if (targetPromoId) {
                    await setDoc(doc(db, 'promociones', targetPromoId), promoData, { merge: true });
                } else {
                    await setDoc(doc(db, 'promociones', 'DSVwbmEtiK1xJzJjwrqu'), {
                        ...promoData,
                        createdAt: Timestamp.now(),
                    }, { merge: true });
                }
            } catch (promoSyncErr) {
                console.warn('Aviso sincronizando tarjeta en promociones:', promoSyncErr);
            }

            // 5. Auditoría
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
                description: 'La configuración y beneficios se han sincronizado en espejo entre el Sitio Web y la App Móvil.',
            });

            if (onSaveSuccess) onSaveSuccess();
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

    // --- GESTIÓN DE BENEFICIOS INDIVIDUALES ---
    const handleStartNewBenefit = () => {
        setBenefitId(`priv_${Date.now()}`);
        setNewTitle('');
        setNewDescripcion('');
        setNewTerminos('');
        setNewImagenUrl('');
        setNewActivo(true);
        setNewHasExpiry(false);
        setNewFechaLimite('');
        setEditingBenefitId('new');
        setIsBeneficiosOpen(true);
    };

    const handleStartEditBenefit = (b: PrivilegioVIP) => {
        setBenefitId(b.id);
        setNewTitle(b.titulo || '');
        setNewDescripcion(b.descripcion || '');
        setNewTerminos(b.terminos || '');
        setNewImagenUrl(b.imagenUrl || '');
        setNewActivo(b.activo !== false);
        setNewHasExpiry(Boolean(b.fechaLimite));
        setNewFechaLimite(b.fechaLimite || '');
        setEditingBenefitId(b.id);
        setIsBeneficiosOpen(true);
    };

    const handleCancelEditBenefit = () => {
        setEditingBenefitId(null);
    };

    const handleSaveBenefit = async () => {
        if (!newTitle.trim()) {
            return toast({
                title: 'Campo Requerido',
                description: 'Por favor escribe el título del beneficio.',
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

        setIsSavingPrivilegios(true);
        try {
            const currentBenefit: PrivilegioVIP = {
                id: editingBenefitId === 'new' ? `priv_${Date.now()}` : benefitId || `priv_${Date.now()}`,
                titulo: newTitle.trim(),
                descripcion: newDescripcion.trim(),
                terminos: newTerminos.trim(),
                imagenUrl: newImagenUrl.trim() || null,
                activo: Boolean(newActivo),
                fechaLimite: newHasExpiry && newFechaLimite ? newFechaLimite : null,
                creado_el:
                    editingBenefitId === 'new'
                        ? new Date().toISOString()
                        : privilegios.find((p) => p.id === benefitId)?.creado_el || new Date().toISOString(),
            };

            let updatedList: PrivilegioVIP[] = [];
            if (editingBenefitId === 'new') {
                updatedList = [...privilegios, currentBenefit];
            } else {
                const idx = privilegios.findIndex((p) => p.id === currentBenefit.id);
                if (idx >= 0) {
                    updatedList = [...privilegios];
                    updatedList[idx] = currentBenefit;
                } else {
                    updatedList = [...privilegios, currentBenefit];
                }
            }

            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const activeTitles = updatedList
                .filter((b) => b.activo && (!b.fechaLimite || b.fechaLimite >= todayStr))
                .map((b) => b.titulo.trim())
                .filter(Boolean);

            // Sincronizar en los 3 documentos
            await Promise.all([
                setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'configuracion', 'app_movil'), {
                    'pase_alfa.beneficios': activeTitles,
                    'pase_alfa.beneficios_detallados': updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);

            setPrivilegios(updatedList);
            setEditingBenefitId(null);

            toast({
                title: editingBenefitId === 'new' ? '¡Beneficio Creado!' : '¡Beneficio Actualizado!',
                description: `"${currentBenefit.titulo}" se ha sincronizado en tiempo real con el Sitio Web y la App Móvil.`,
            });
        } catch (e: any) {
            console.error('Error guardando beneficio:', e);
            toast({
                title: 'Error al guardar beneficio',
                description: e.message || 'No se pudieron guardar los cambios.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingPrivilegios(false);
        }
    };

    const handleToggleBenefitActive = async (b: PrivilegioVIP) => {
        const nextActive = !b.activo;
        const updatedList = privilegios.map((item) => {
            if (item.id === b.id) {
                return { ...item, activo: nextActive };
            }
            return item;
        });

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const activeTitles = updatedList
            .filter((item) => item.activo && (!item.fechaLimite || item.fechaLimite >= todayStr))
            .map((item) => item.titulo.trim())
            .filter(Boolean);

        try {
            await Promise.all([
                setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'configuracion', 'app_movil'), {
                    'pase_alfa.beneficios': activeTitles,
                    'pase_alfa.beneficios_detallados': updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);

            setPrivilegios(updatedList);
            toast({
                title: nextActive ? 'Beneficio Activado' : 'Beneficio Pausado',
                description: `"${b.titulo}" ahora está ${nextActive ? 'visible' : 'pausado'} en el Sitio Web y la App.`,
            });
        } catch (err: any) {
            toast({
                title: 'Error',
                description: 'No se pudo actualizar el estado del beneficio.',
                variant: 'destructive',
            });
        }
    };

    const handleConfirmDeleteBenefit = async () => {
        if (!deletingBenefit) return;
        setIsSavingPrivilegios(true);
        try {
            const updatedList = privilegios.filter((p) => p.id !== deletingBenefit.id);
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const activeTitles = updatedList
                .filter((b) => b.activo && (!b.fechaLimite || b.fechaLimite >= todayStr))
                .map((b) => b.titulo.trim())
                .filter(Boolean);

            await Promise.all([
                setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'configuracion', 'app_movil'), {
                    'pase_alfa.beneficios': activeTitles,
                    'pase_alfa.beneficios_detallados': updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);

            setPrivilegios(updatedList);
            const deletedTitle = deletingBenefit.titulo;
            setDeletingBenefit(null);

            toast({
                title: 'Beneficio Eliminado',
                description: `"${deletedTitle}" ha sido eliminado del Sitio Web y la App Móvil.`,
            });
        } catch (err: any) {
            toast({
                title: 'Error al eliminar',
                description: 'No se pudo eliminar el beneficio.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingPrivilegios(false);
        }
    };

    return (
        <div className={cn("space-y-5", className)}>
            {/* 1. CARD: PROGRAMA PASE ALFA */}
            <Card className="border border-border/70 shadow-xs transition-all">
                <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                            <Award className="h-4 w-4 text-slate-400 shrink-0" />
                            <div className="flex items-center gap-1.5">
                                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                    Programa Pase Alfa
                                </CardTitle>
                                <InfoTooltip text="Configura los sellos necesarios, recompensa y textos del Pase Alfa que ven tus clientes en el sitio web y la app móvil." />
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                            <Switch
                                checked={paseAlfaForm.activo}
                                onCheckedChange={(checked) =>
                                    setPaseAlfaForm((prev) => ({ ...prev, activo: checked }))
                                }
                                title={paseAlfaForm.activo ? "Pase Alfa Activo" : "Pase Alfa Pausado"}
                                aria-label="Pase Alfa Activo"
                                className="scale-90"
                            />

                            <button
                                type="button"
                                onClick={() => setIsPaseAlfaOpen(!isPaseAlfaOpen)}
                                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                                title={isPaseAlfaOpen ? "Minimizar" : "Desplegar"}
                                aria-label={isPaseAlfaOpen ? "Minimizar" : "Desplegar"}
                            >
                                {isPaseAlfaOpen ? (
                                    <ChevronUp className="w-4 h-4" />
                                ) : (
                                    <ChevronDown className="w-4 h-4" />
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
                        <CardContent className="space-y-4 pt-3 px-3.5 sm:px-5 pb-5">
                            {/* PARÁMETROS BÁSICOS */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <Label className="text-xs font-semibold text-foreground">Título del Pase</Label>
                                        <InfoTooltip text="Nombre visible en la tarjeta y en la sección del Pase Alfa." />
                                    </div>
                                    <Input
                                        value={paseAlfaForm.titulo}
                                        onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, titulo: e.target.value })}
                                        placeholder="Ej. Pase Alfa Club"
                                        className="h-8.5 text-xs font-medium font-sans"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <Label className="text-xs font-semibold text-foreground">Recompensa al completar sellos</Label>
                                        <InfoTooltip text="Premio que se desbloquea al llenar la tarjeta (ej. 10.° Corte Totalmente Gratis)." />
                                    </div>
                                    <Input
                                        value={paseAlfaForm.recompensa}
                                        onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, recompensa: e.target.value })}
                                        placeholder="Ej. 10.° Corte Totalmente Gratis"
                                        className="h-8.5 text-xs font-medium font-sans"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <Label className="text-xs font-semibold text-foreground">Meta de Sellos Requeridos</Label>
                                        <InfoTooltip text="Número de visitas o servicios requeridos para ganar la recompensa." />
                                    </div>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={paseAlfaForm.sellosRequeridos}
                                            onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, sellosRequeridos: Number(e.target.value) || 10 })}
                                            className="h-8.5 text-xs font-semibold pr-14 font-sans"
                                        />
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none font-sans">sellos</span>
                                    </div>
                                </div>
                            </div>

                            {/* TEXTOS DESCRIPTIVOS */}
                            <div className="space-y-3 border-t border-border/50 pt-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <Label className="text-xs font-semibold text-foreground">Subtítulo / Lema Explicativo</Label>
                                        <InfoTooltip text="Lema o frase explicativa visible en la cabecera del pase." />
                                    </div>
                                    <Textarea
                                        value={paseAlfaForm.subtitulo}
                                        onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, subtitulo: e.target.value })}
                                        placeholder="Ej. Cada visita cuenta. Presenta tu código QR en recepción y disfruta tu corte de cortesía."
                                        rows={2}
                                        className="text-xs min-h-[50px] py-1.5 px-3 resize-y font-sans"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-xs font-semibold text-foreground">Instrucciones de Escaneo (Modal QR)</Label>
                                            <InfoTooltip text="Instrucciones que ve el cliente al abrir su código QR en recepción para sellar su visita." />
                                        </div>
                                        <Textarea
                                            value={paseAlfaForm.instrucciones}
                                            onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, instrucciones: e.target.value })}
                                            placeholder="Ej. Presenta tu código QR en recepción al finalizar tu servicio..."
                                            rows={2}
                                            className="text-xs min-h-[50px] py-1.5 px-3 resize-y font-sans"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-semibold text-foreground">Términos y Condiciones del Pase</Label>
                                                <InfoTooltip text="Reglas, restricciones y validez aplicables al Pase Alfa." />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openExpandedEditor(
                                                    "Términos y Condiciones del Programa Pase Alfa",
                                                    "Edita con amplitud las reglas, restricciones y validez aplicables al Programa Pase Alfa.",
                                                    paseAlfaForm.terminos,
                                                    (val) => setPaseAlfaForm((prev) => ({ ...prev, terminos: val }))
                                                )}
                                                className="h-6 px-1.5 text-[11px] gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                                title="Ver y editar en modal maximizado"
                                            >
                                                <Maximize2 className="w-3 h-3" />
                                                <span className="font-medium">Maximizar</span>
                                            </Button>
                                        </div>
                                        <Textarea
                                            value={paseAlfaForm.terminos}
                                            onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, terminos: e.target.value })}
                                            placeholder="Ej. Válido en sucursales oficiales de Vatos Alfa Barbería..."
                                            rows={2}
                                            className="text-xs min-h-[50px] py-1.5 px-3 resize-y font-sans"
                                        />
                                    </div>
                                </div>

                                {/* FOTOGRAFÍA / IMAGEN DEL PASE ALFA */}
                                <div className="space-y-1.5 border-t border-border/50 pt-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-xs font-semibold text-foreground">
                                                Fotografía / Portada del Pase Alfa (Opcional)
                                            </Label>
                                            <InfoTooltip text="Sube una portada para el Programa Pase Alfa. Tamaño ideal: 1280 x 720 px (16:9)." />
                                        </div>
                                        <span className="text-[10px] font-medium text-slate-400">
                                            Tamaño sugerido: 1280 x 720 px (16:9)
                                        </span>
                                    </div>
                                    <ImageUploader
                                        folder="pase_alfa"
                                        currentImageUrl={paseAlfaForm.imagenUrl || ''}
                                        onUpload={(url) => setPaseAlfaForm((prev) => ({ ...prev, imagenUrl: url }))}
                                        onRemove={() => setPaseAlfaForm((prev) => ({ ...prev, imagenUrl: '' }))}
                                        onUploadStateChange={setIsUploadingPaseAlfaImage}
                                        multiple={false}
                                        objectFit="contain"
                                        className="w-full h-36 sm:h-44 border-2 border-dashed rounded-xl bg-slate-950/90 hover:bg-slate-950 transition-all cursor-pointer shadow-2xs"
                                    />
                                </div>
                            </div>

                            {/* BOTÓN GUARDAR PASE ALFA */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-border/50">
                                <span className="text-[11px] text-muted-foreground">
                                    Los cambios del Pase Alfa se sincronizan en espejo entre el Sitio Web y la App Móvil.
                                </span>
                                <Button
                                    type="button"
                                    onClick={handleSavePaseAlfa}
                                    disabled={isSavingPaseAlfa || isUploadingPaseAlfaImage}
                                    variant="alfa"
                                    className="font-semibold text-xs px-5 h-9 w-full sm:w-auto cursor-pointer"
                                >
                                    {isUploadingPaseAlfaImage ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                            Subiendo foto...
                                        </>
                                    ) : isSavingPaseAlfa ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                            Guardando Pase Alfa...
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

            {/* 2. CARD: GESTOR DE BENEFICIOS / PRIVILEGIOS VIP */}
            <Card className="border border-border/70 shadow-xs transition-all">
                <CardHeader className="py-2.5 px-3.5 sm:px-5 border-b border-border/50 bg-muted/10">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                            <Sparkles className="h-4 w-4 text-slate-400 shrink-0" />
                            <div className="flex items-center gap-1.5">
                                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                    Beneficios Exclusivos (Privilegios VIP)
                                </CardTitle>
                                <InfoTooltip text="Configura las cortesías y beneficios del Pase Alfa. Se reflejan en el sitio web y en la app móvil." />
                            </div>
                            <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 font-medium border-border/60 text-slate-300"
                            >
                                {privilegios.length} {privilegios.length === 1 ? 'beneficio' : 'beneficios'}
                            </Badge>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsBeneficiosOpen(true);
                                    handleStartNewBenefit();
                                }}
                                variant="alfa"
                                className="font-semibold text-xs h-7.5 px-3 gap-1.5 cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Agregar Beneficio</span>
                            </Button>
                            <button
                                type="button"
                                onClick={() => setIsBeneficiosOpen(!isBeneficiosOpen)}
                                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                                title={isBeneficiosOpen ? "Minimizar" : "Desplegar"}
                                aria-label={isBeneficiosOpen ? "Minimizar" : "Desplegar"}
                            >
                                {isBeneficiosOpen ? (
                                    <ChevronUp className="w-4 h-4" />
                                ) : (
                                    <ChevronDown className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </CardHeader>

                {isBeneficiosOpen && (
                    <CardContent className="space-y-4 pt-3 px-3.5 sm:px-5 pb-5">
                        {loadingPrivilegios ? (
                            <div className="py-8 flex justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            </div>
                        ) : editingBenefitId === null ? (
                            /* VISTA 1: LISTADO DE BENEFICIOS */
                            <div className="space-y-3">
                                {privilegios.length === 0 ? (
                                    <div className="text-center py-8 px-4 border border-dashed rounded-xl bg-muted/10 space-y-2">
                                        <Award className="w-8 h-8 text-slate-400 mx-auto" />
                                        <div className="space-y-1">
                                            <h5 className="font-semibold text-xs text-foreground">No hay beneficios configurados</h5>
                                            <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                                                Crea beneficios exclusivos para los miembros del Pase Alfa (ej. Regalo de cumpleaños, bebida de cortesía, 20% off en ceras, etc.).
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={handleStartNewBenefit}
                                            variant="alfa"
                                            className="text-xs h-8 px-4 font-semibold cursor-pointer"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1" />
                                            Crear Primer Beneficio
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid gap-2.5">
                                        {privilegios.map((item, idx) => {
                                            const isExpired = isPrivilegeExpired(item.fechaLimite);
                                            return (
                                                <div
                                                    key={item.id || idx}
                                                    className={cn(
                                                        "flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all gap-2.5",
                                                        item.activo && !isExpired
                                                            ? "bg-card border-border/80 shadow-2xs hover:border-blue-500/50"
                                                            : "bg-muted/30 border-border/50 opacity-70"
                                                    )}
                                                >
                                                    {/* IZQUIERDA: Miniatura y Detalles */}
                                                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                                                        {item.imagenUrl ? (
                                                            <div className="w-14 h-12 sm:w-16 sm:h-12 rounded-lg overflow-hidden border border-border/70 shrink-0 bg-slate-950 relative">
                                                                <img
                                                                    src={item.imagenUrl}
                                                                    alt={item.titulo}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg bg-muted/40 text-muted-foreground flex items-center justify-center shrink-0 border border-border/70">
                                                                <Award className="w-4 h-4 text-slate-400" />
                                                            </div>
                                                        )}

                                                        <div className="space-y-0.5 min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <h5 className="font-semibold text-xs text-foreground truncate font-sans">
                                                                    {item.titulo}
                                                                </h5>

                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn(
                                                                        "text-[10px] py-0 px-1.5 font-medium border font-sans",
                                                                        item.activo && !isExpired
                                                                            ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                                                                            : "text-muted-foreground border-border bg-muted/20"
                                                                    )}
                                                                >
                                                                    {item.activo && !isExpired ? "Visible" : isExpired ? "Expirado" : "Pausado"}
                                                                </Badge>

                                                                {item.fechaLimite && (
                                                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground gap-1 font-sans">
                                                                        <CalendarDays className="w-2.5 h-2.5 text-slate-400" />
                                                                        Hasta {formatDateDisplay(item.fechaLimite)}
                                                                    </Badge>
                                                                )}
                                                            </div>

                                                            {item.descripcion && (
                                                                <p className="text-[11px] text-muted-foreground line-clamp-1 font-sans">
                                                                    {item.descripcion}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* DERECHA: Acciones y Switches */}
                                                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                                                        <div className="flex items-center gap-1.5 mr-1">
                                                            <Label htmlFor={`benefit-toggle-${item.id}`} className="text-[10px] text-muted-foreground cursor-pointer font-sans">
                                                                {item.activo ? 'Visible' : 'Oculto'}
                                                            </Label>
                                                            <Switch
                                                                id={`benefit-toggle-${item.id}`}
                                                                checked={item.activo}
                                                                onCheckedChange={() => handleToggleBenefitActive(item)}
                                                                className="scale-75"
                                                            />
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleStartEditBenefit(item)}
                                                            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                                                            title="Editar beneficio"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => setDeletingBenefit(item)}
                                                            className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                                                            title="Eliminar beneficio"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* VISTA 2: FORMULARIO DE CREACIÓN / EDICIÓN DE BENEFICIO */
                            <div className="space-y-3.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-border/50 gap-2">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCancelEditBenefit}
                                            className="h-7.5 px-2 text-xs gap-1 text-slate-400 hover:text-white cursor-pointer"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            <span>Volver a la lista</span>
                                        </Button>
                                        <div className="h-4 w-px bg-border/80" />
                                        <h4 className="font-semibold text-xs sm:text-sm text-foreground">
                                            {editingBenefitId === 'new' ? 'Crear Nuevo Beneficio' : `Editar: ${newTitle || 'Beneficio'}`}
                                        </h4>
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                        <Label htmlFor="benefit-form-active" className="text-xs font-medium cursor-pointer text-muted-foreground">
                                            {newActivo ? 'Visible' : 'Pausado'}
                                        </Label>
                                        <Switch
                                            id="benefit-form-active"
                                            checked={newActivo}
                                            onCheckedChange={setNewActivo}
                                            className="scale-90"
                                        />
                                    </div>
                                </div>

                                {/* TÍTULO */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <Label className="text-xs font-semibold text-foreground">
                                            Título del beneficio *
                                        </Label>
                                        <InfoTooltip text="Nombre visible en la tarjeta del beneficio en el sitio web y la app móvil." />
                                    </div>
                                    <Input
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder="Ej. Regalo de cumpleaños, Bebida de cortesía..."
                                        className="h-8.5 text-xs font-medium font-sans"
                                    />
                                </div>

                                {/* DESCRIPCIÓN */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-xs font-semibold text-foreground">
                                                Descripción del beneficio
                                            </Label>
                                            <InfoTooltip text="Detalla qué incluye este beneficio para el cliente." />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openExpandedEditor(
                                                "Descripción del Beneficio",
                                                "Detalla con amplitud lo que incluye este beneficio para el cliente.",
                                                newDescripcion,
                                                (val) => setNewDescripcion(val)
                                            )}
                                            className="h-6 px-1.5 text-[11px] gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                            title="Ver y editar en modal maximizado"
                                        >
                                            <Maximize2 className="w-3 h-3" />
                                            <span className="font-medium">Maximizar</span>
                                        </Button>
                                    </div>
                                    <Textarea
                                        value={newDescripcion}
                                        onChange={(e) => setNewDescripcion(e.target.value)}
                                        placeholder="Ej. Disfruta de un detalle especial o bebida de cortesía al visitar nuestra barbería."
                                        rows={2}
                                        className="text-xs resize-y py-1.5 min-h-[50px] font-sans"
                                    />
                                </div>

                                {/* TÉRMINOS Y CONDICIONES */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-xs font-semibold text-foreground">
                                                Términos y condiciones
                                            </Label>
                                            <InfoTooltip text="Condiciones o restricciones aplicables para hacer válido este beneficio." />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openExpandedEditor(
                                                "Términos y Condiciones del Beneficio",
                                                "Edita las reglas y restricciones para hacer válido este beneficio.",
                                                newTerminos,
                                                (val) => setNewTerminos(val)
                                            )}
                                            className="h-6 px-1.5 text-[11px] gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                            title="Abrir en modal maximizado"
                                        >
                                            <Maximize2 className="w-3 h-3" />
                                            <span className="font-medium">Maximizar</span>
                                        </Button>
                                    </div>
                                    <Textarea
                                        value={newTerminos}
                                        onChange={(e) => setNewTerminos(e.target.value)}
                                        placeholder="Ej. Válido una cortesía por cita. No acumulable con otras promociones."
                                        rows={2}
                                        className="text-xs resize-y py-1.5 min-h-[50px] font-sans"
                                    />
                                </div>

                                {/* IMAGEN DEL BENEFICIO */}
                                <div className="space-y-1">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-xs font-semibold text-foreground">
                                                Fotografía / Imagen del beneficio (Opcional)
                                            </Label>
                                            <InfoTooltip text="Sube una fotografía para este beneficio. Tamaño ideal: 1280 x 720 px (16:9)." />
                                        </div>
                                        <span className="text-[10px] font-medium text-slate-400">
                                            Tamaño sugerido: 1280 x 720 px (16:9)
                                        </span>
                                    </div>
                                    <ImageUploader
                                        folder="beneficios_pase_alfa"
                                        currentImageUrl={newImagenUrl}
                                        onUpload={(url) => setNewImagenUrl(url)}
                                        onRemove={() => setNewImagenUrl('')}
                                        onUploadStateChange={setIsUploadingBenefitImage}
                                        multiple={false}
                                        objectFit="contain"
                                        className="w-full h-36 sm:h-44 border-2 border-dashed rounded-xl bg-slate-950/90 hover:bg-slate-950 transition-all cursor-pointer shadow-2xs"
                                    />
                                </div>

                                {/* FECHA LÍMITE DE VIGENCIA */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border bg-muted/15 border-border/60">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="new-expiry-toggle"
                                            checked={newHasExpiry}
                                            onCheckedChange={setNewHasExpiry}
                                            className="scale-90"
                                        />
                                        <div>
                                            <Label htmlFor="new-expiry-toggle" className="text-xs cursor-pointer font-semibold text-foreground">
                                                Fecha límite de vigencia
                                            </Label>
                                            <p className="text-[11px] text-muted-foreground font-sans">
                                                {newHasExpiry ? 'El beneficio expirará automáticamente en la fecha indicada' : 'Permanente / Sin caducidad'}
                                            </p>
                                        </div>
                                    </div>

                                    {newHasExpiry && (
                                        <div className="flex items-center gap-2 animate-in fade-in duration-200">
                                            <Popover modal={true} open={newDatePickerOpen} onOpenChange={setNewDatePickerOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className={cn(
                                                            "h-8 text-xs px-3 font-normal justify-start text-left bg-background font-sans",
                                                            !newFechaLimite && "text-muted-foreground"
                                                        )}
                                                    >
                                                        <CalendarDays className="mr-1.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                        <span className="truncate">
                                                            {parseDateSafe(newFechaLimite)
                                                                ? format(parseDateSafe(newFechaLimite)!, "dd 'de' MMM, yyyy", { locale: es })
                                                                : "Seleccionar fecha"}
                                                        </span>
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 z-[60] border-2 border-blue-500 rounded-xl shadow-xl" align="start">
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

                                {/* BOTONES GUARDAR / CANCELAR BENEFICIO */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-border/50">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCancelEditBenefit}
                                        className="text-xs h-8.5 px-4 w-full sm:w-auto cursor-pointer"
                                    >
                                        Cancelar
                                    </Button>

                                    <Button
                                        type="button"
                                        onClick={handleSaveBenefit}
                                        disabled={isSavingPrivilegios || isUploadingBenefitImage}
                                        variant="alfa"
                                        className="font-semibold text-xs px-5 h-8.5 w-full sm:w-auto cursor-pointer"
                                    >
                                        {isSavingPrivilegios ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                Guardando beneficio...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-3.5 h-3.5 mr-1.5" />
                                                {editingBenefitId === 'new' ? 'Guardar Nuevo Beneficio' : 'Guardar Cambios del Beneficio'}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                )}
            </Card>

            {/* MODAL DE CONFIRMACIÓN PARA ELIMINAR BENEFICIO (ESTILO OFICIAL VATOS ALFA) */}
            <Dialog open={deletingBenefit !== null} onOpenChange={(open) => !open && setDeletingBenefit(null)}>
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
                                        Eliminar Beneficio
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300">
                                        Esta acción no se puede deshacer
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDeletingBenefit(null)}
                                className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10"
                                aria-label="Cerrar modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                    {deletingBenefit && (
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-muted-foreground">
                                ¿Estás seguro de que deseas eliminar definitivamente el beneficio <span className="font-semibold text-foreground">"{deletingBenefit.titulo}"</span>? Se retirará tanto del Sitio Web como de la App Móvil.
                            </p>
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setDeletingBenefit(null)}
                                    className="h-8 text-xs cursor-pointer"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleConfirmDeleteBenefit}
                                    className="h-8 text-xs cursor-pointer"
                                >
                                    Eliminar Definitivamente
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* MODAL MAXIMIZADO DE EDICIÓN DE TEXTO EXTENSO (ESTILO OFICIAL VATOS ALFA) */}
            <Dialog
                open={expandedEditor.open}
                onOpenChange={(open) => !open && setExpandedEditor((prev) => ({ ...prev, open: false }))}
            >
                <DialogContent
                    hideCloseButton={true}
                    className="p-0 overflow-hidden max-w-3xl w-[95vw] max-h-[90vh] flex flex-col rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)]"
                >
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-800 shrink-0">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <FileText className="h-4 w-4 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-sm font-bold text-white tracking-tight">
                                        {expandedEditor.title}
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300">
                                        {expandedEditor.description}
                                    </DialogDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="hidden sm:flex items-center gap-1.5">
                                    <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 font-normal font-sans">
                                        {expandedText.trim().split(/\s+/).filter(Boolean).length} palabras
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-700 font-normal font-sans">
                                        {expandedText.length} caracteres
                                    </Badge>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setExpandedEditor((prev) => ({ ...prev, open: false }))}
                                    className="p-1 text-slate-300 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10 ml-2"
                                    aria-label="Cerrar modal"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 space-y-2 p-4 sm:p-5 overflow-y-auto">
                        <Textarea
                            value={expandedText}
                            onChange={(e) => setExpandedText(e.target.value)}
                            placeholder="Escribe aquí con amplitud y claridad..."
                            className="flex-1 min-h-[300px] sm:min-h-[380px] text-xs sm:text-sm font-sans leading-relaxed resize-none p-3.5 rounded-xl border-border/80 focus:border-blue-500"
                        />
                    </div>

                    <div className="p-3 sm:p-4 bg-muted/15 border-t border-border/50 flex items-center justify-between gap-3 shrink-0">
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                            Haz clic en "Aplicar y Regresar" para plasmar el texto en el formulario.
                        </span>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedEditor((prev) => ({ ...prev, open: false }))}
                                className="h-8 text-xs cursor-pointer"
                            >
                                Descartar
                            </Button>
                            <Button
                                type="button"
                                variant="alfa"
                                size="sm"
                                onClick={() => {
                                    expandedEditor.onSave(expandedText);
                                    setExpandedEditor((prev) => ({ ...prev, open: false }));
                                    toast({
                                        title: 'Texto actualizado',
                                        description: 'Los cambios se plasmaron en el formulario.',
                                    });
                                }}
                                className="h-8 text-xs font-semibold cursor-pointer"
                            >
                                Aplicar y Regresar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
