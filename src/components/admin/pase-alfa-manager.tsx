'use client';

import React, { useState, useEffect, useRef } from 'react';
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
    Coins,
    Flame,
    CheckCircle2,
    Crown,
    Star,
    Percent,
    Check,
    Scissors,
    DollarSign,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DEFAULT_NIVELES_CONFIG,
    type NivelesClubConfig,
    buildDefaultNivelesTerminos,
} from '@/components/admin/niveles-alfa-manager';
import {
    DEFAULT_MULTIPLICADOR_COINS_CONFIG,
    DAY_NAMES_ES,
    evaluateActiveCoinsMultiplier,
    type MultiplicadorCoinsConfig,
} from '@/lib/benefit-security';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit-logger';
import { cn, formatMoney } from '@/lib/utils';
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
    mostrarEnWeb?: boolean;
    fechaLimite?: string | null; // YYYY-MM-DD
    creado_el?: any;
}

export interface PaseAlfaConfig {
    activo: boolean;
    mostrar_en_web?: boolean;
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
    onEditingChange?: (isEditing: boolean, onBack: () => void, title?: string) => void;
}

export function PaseAlfaManager({ className, onSaveSuccess, onEditingChange }: PaseAlfaManagerProps) {
    const { user } = useAuth();
    const { toast } = useToast();

    // Estado principal del programa Pase Alfa
    const [paseAlfaForm, setPaseAlfaForm] = useState<PaseAlfaConfig>({
        activo: true,
        titulo: 'PASE ALFA',
        subtitulo: '',
        sellosRequeridos: 10,
        recompensa: '10.° Corte Totalmente Gratis',
        puntosPorVisita: 0,
        instrucciones: '',
        terminos: '',
        imagenUrl: '',
    });

    // Estado de configuración de Niveles (Alfa Member, Alfa Gold, Alfa Black VIP)
    const [nivelesConfig, setNivelesConfig] = useState<NivelesClubConfig>(DEFAULT_NIVELES_CONFIG);
    const [activeNivelTab, setActiveNivelTab] = useState<'member' | 'gold' | 'vip'>('gold');
    const [newTierBenefitText, setNewTierBenefitText] = useState<string>('');
    const [isNivelesAjustesOpen, setIsNivelesAjustesOpen] = useState(false);
    const [focusedGastoKey, setFocusedGastoKey] = useState<string | null>(null);
    const [rawGastoInput, setRawGastoInput] = useState<string>('');

    const [loadingPaseAlfa, setLoadingPaseAlfa] = useState(true);
    const [isSavingPaseAlfa, setIsSavingPaseAlfa] = useState(false);
    const [isUploadingPaseAlfaImage, setIsUploadingPaseAlfaImage] = useState(false);
    const [isPaseAlfaOpen, setIsPaseAlfaOpen] = useState(true);

    // Estado de Promoción Días de Alfa Coins al Doble (2x) o Triple (3x)
    const [multiplicadorConfig, setMultiplicadorConfig] = useState<MultiplicadorCoinsConfig>(
        DEFAULT_MULTIPLICADOR_COINS_CONFIG
    );
    const [isMultiplicadorOpen, setIsMultiplicadorOpen] = useState(false);
    const [isSavingMultiplicador, setIsSavingMultiplicador] = useState(false);

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
    const [newMostrarEnWeb, setNewMostrarEnWeb] = useState(true);
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
                        mostrar_en_web: merged.mostrar_en_web !== undefined ? Boolean(merged.mostrar_en_web) : true,
                        titulo: (merged.titulo || 'Pase Alfa').replace(/Pase Alfa Club/gi, 'Pase Alfa'),
                        subtitulo: merged.subtitulo || '',
                        sellosRequeridos: Number(merged.sellosRequeridos) || 10,
                        recompensa: merged.recompensa || '10.° Corte Totalmente Gratis',
                        puntosPorVisita: merged.puntosPorVisita !== undefined ? Number(merged.puntosPorVisita) : 0,
                        instrucciones: merged.instrucciones || '',
                        terminos: merged.terminos || '',
                        imagenUrl: merged.imagenUrl || merged.imagen || '',
                    });

                    const rawMult = merged.multiplicador_coins_config || mData?.multiplicador_coins_config;
                    if (rawMult && typeof rawMult === 'object') {
                        setMultiplicadorConfig({
                            activo: Boolean(rawMult.activo),
                            multiplicador: Number(rawMult.multiplicador) === 3 ? 3 : 2,
                            dias_semana: Array.isArray(rawMult.dias_semana)
                                ? rawMult.dias_semana.map((d: any) => Number(d)).filter((d: number) => d >= 0 && d <= 6)
                                : [],
                            mensaje_promo: typeof rawMult.mensaje_promo === 'string' && rawMult.mensaje_promo.trim()
                                ? rawMult.mensaje_promo
                                : DEFAULT_MULTIPLICADOR_COINS_CONFIG.mensaje_promo,
                        });
                    }

                    const rawNiveles = merged.niveles_config || mData?.niveles_config || mData?.pase_alfa?.niveles_config;
                    if (rawNiveles && typeof rawNiveles === 'object') {
                        setNivelesConfig({
                            activo: rawNiveles.activo !== undefined ? Boolean(rawNiveles.activo) : true,
                            criterio: rawNiveles.criterio || 'ambos_opcional',
                            titulo_tarjeta: rawNiveles.titulo_tarjeta || DEFAULT_NIVELES_CONFIG.titulo_tarjeta,
                            descripcion_tarjeta: rawNiveles.descripcion_tarjeta || DEFAULT_NIVELES_CONFIG.descripcion_tarjeta,
                            imagenUrl: rawNiveles.imagenUrl || DEFAULT_NIVELES_CONFIG.imagenUrl,
                            terminos: rawNiveles.terminos || buildDefaultNivelesTerminos(rawNiveles),
                            member: {
                                ...DEFAULT_NIVELES_CONFIG.member,
                                ...(rawNiveles.member || {}),
                                beneficios: Array.isArray(rawNiveles.member?.beneficios)
                                    ? rawNiveles.member.beneficios
                                    : DEFAULT_NIVELES_CONFIG.member.beneficios,
                            },
                            gold: {
                                ...DEFAULT_NIVELES_CONFIG.gold,
                                ...(rawNiveles.gold || {}),
                                beneficios: Array.isArray(rawNiveles.gold?.beneficios)
                                    ? rawNiveles.gold.beneficios
                                    : DEFAULT_NIVELES_CONFIG.gold.beneficios,
                            },
                            vip: {
                                ...DEFAULT_NIVELES_CONFIG.vip,
                                ...(rawNiveles.vip || {}),
                                beneficios: Array.isArray(rawNiveles.vip?.beneficios)
                                    ? rawNiveles.vip.beneficios
                                    : DEFAULT_NIVELES_CONFIG.vip.beneficios,
                            },
                        });
                    }

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
                mostrar_en_web: paseAlfaForm.mostrar_en_web !== false,
                titulo: paseAlfaForm.titulo.trim() || 'Pase Alfa',
                subtitulo: paseAlfaForm.subtitulo.trim(),
                sellosRequeridos: sellosNum,
                recompensa: paseAlfaForm.recompensa.trim() || `${sellosNum}.° Corte Totalmente Gratis`,
                puntosPorVisita: Math.max(0, Number(paseAlfaForm.puntosPorVisita) || 0),
                instrucciones: paseAlfaForm.instrucciones.trim(),
                terminos: paseAlfaForm.terminos.trim(),
                imagenUrl: (paseAlfaForm.imagenUrl || '').trim() || null,
                beneficios: activeTitles,
                beneficios_detallados: privilegios,
                multiplicador_coins_config: multiplicadorConfig,
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

            // 4. Auditoría
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

    const handleTogglePaseAlfaActive = async (checked: boolean) => {
        setPaseAlfaForm((prev) => ({ ...prev, activo: checked }));
        try {
            await Promise.all([
                setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                    activo: checked,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'configuracion', 'app_movil'), {
                    pase_alfa: {
                        activo: checked,
                    },
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);
            toast({
                title: checked ? 'Programa Pase Alfa visible' : 'Programa Pase Alfa oculto',
                description: 'Estado actualizado en espejo para Web y App Móvil.',
            });
        } catch (e: any) {
            console.error('Error toggling Pase Alfa:', e);
            setPaseAlfaForm((prev) => ({ ...prev, activo: !checked }));
            toast({
                title: 'Error al cambiar estado',
                description: e.message || 'No se pudo actualizar el estado del Pase Alfa.',
                variant: 'destructive',
            });
        }
    };

    // --- PROMOCIÓN DÍAS DE ALFA COINS AL DOBLE (2x) O TRIPLE (3x) ---
    const handleToggleDayOfWeek = (dayIndex: number) => {
        setMultiplicadorConfig((prev) => {
            const exists = prev.dias_semana.includes(dayIndex);
            const nextDays = exists
                ? prev.dias_semana.filter((d) => d !== dayIndex)
                : [...prev.dias_semana, dayIndex].sort((a, b) => a - b);
            return { ...prev, dias_semana: nextDays };
        });
    };

    const handleSaveMultiplicadorCoins = async () => {
        if (multiplicadorConfig.activo && multiplicadorConfig.dias_semana.length === 0) {
            return toast({
                title: 'Selecciona al menos un día',
                description: 'Para activar la promoción de Alfa Coins al doble o triple, elige qué día(s) de la semana aplicará.',
                variant: 'destructive',
            });
        }

        setIsSavingMultiplicador(true);
        try {
            const cleanConfig: MultiplicadorCoinsConfig = {
                activo: Boolean(multiplicadorConfig.activo),
                multiplicador: multiplicadorConfig.multiplicador === 3 ? 3 : 2,
                dias_semana: [...multiplicadorConfig.dias_semana].sort((a, b) => a - b),
                mensaje_promo: (multiplicadorConfig.mensaje_promo || '').trim() || `¡Hoy tus compras generan el ${multiplicadorConfig.multiplicador === 3 ? 'TRIPLE (3x)' : 'DOBLE (2x)'} de Alfa Coins en cualquier sucursal!`,
            };

            await Promise.all([
                setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                    multiplicador_coins_config: cleanConfig,
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'configuracion', 'app_movil'), {
                    multiplicador_coins_config: cleanConfig,
                    pase_alfa: {
                        multiplicador_coins_config: cleanConfig,
                    },
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);

            setMultiplicadorConfig(cleanConfig);

            const daysText = cleanConfig.dias_semana.map((d) => DAY_NAMES_ES[d]).join(', ') || 'Ninguno';
            await logAuditAction({
                action: 'Configurar Multiplicador Alfa Coins',
                details: `Estado: ${cleanConfig.activo ? 'ACTIVO' : 'INACTIVO'}, Multiplicador: ${cleanConfig.multiplicador}x, Días: ${daysText}`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'info',
            });

            toast({
                title: cleanConfig.activo
                    ? `¡Alfa Coins ${cleanConfig.multiplicador}x Activado!`
                    : 'Configuración de Multiplicador Guardada',
                description: cleanConfig.activo
                    ? `Los días seleccionados (${daysText}) otorgarán automáticamente ${cleanConfig.multiplicador} Alfa Coins por cada $1 MXN pagado en Caja.`
                    : 'La promoción de días de Alfa Coins dobles/triples ha quedado pausada.',
            });
        } catch (err: any) {
            console.error('Error guardando multiplicador de Alfa Coins:', err);
            toast({
                title: 'Error al guardar multiplicador',
                description: err.message || 'No se pudo guardar la configuración.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingMultiplicador(false);
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
        setNewMostrarEnWeb(true);
        setNewHasExpiry(false);
        setNewFechaLimite('');
        setEditingBenefitId('new');
        setIsBeneficiosOpen(true);
        setIsNivelesAjustesOpen(false);
    };

    const handleStartEditBenefit = (b: PrivilegioVIP) => {
        setBenefitId(b.id);
        setNewTitle(b.titulo || '');
        setNewDescripcion(b.descripcion || '');
        setNewTerminos(b.terminos || '');
        setNewImagenUrl(b.imagenUrl || '');
        setNewActivo(b.activo !== false);
        setNewMostrarEnWeb(b.mostrarEnWeb !== false);
        setNewHasExpiry(Boolean(b.fechaLimite));
        setNewFechaLimite(b.fechaLimite || '');
        setEditingBenefitId(b.id);
        setIsBeneficiosOpen(true);
        setIsNivelesAjustesOpen(false);
    };

    const handleCancelEditBenefit = () => {
        setEditingBenefitId(null);
    };

    const updateNivelField = (tierKey: 'member' | 'gold' | 'vip', field: string, value: any) => {
        setNivelesConfig((prev) => ({
            ...prev,
            [tierKey]: {
                ...prev[tierKey],
                [field]: value,
            },
        }));
    };

    const handleAddNivelBeneficio = (tierKey: 'member' | 'gold' | 'vip') => {
        const text = newTierBenefitText.trim();
        if (!text) return;
        setNivelesConfig((prev) => ({
            ...prev,
            [tierKey]: {
                ...prev[tierKey],
                beneficios: [...(prev[tierKey].beneficios || []), text],
            },
        }));
        setNewTierBenefitText('');
    };

    const removeNivelBeneficio = (tierKey: 'member' | 'gold' | 'vip', index: number) => {
        setNivelesConfig((prev) => ({
            ...prev,
            [tierKey]: {
                ...prev[tierKey],
                beneficios: prev[tierKey].beneficios.filter((_, i) => i !== index),
            },
        }));
    };

    const onEditingChangeRef = useRef(onEditingChange);
    useEffect(() => {
        onEditingChangeRef.current = onEditingChange;
    }, [onEditingChange]);

    // Notificar al contenedor principal cuando se entra o sale de la edición de un beneficio
    useEffect(() => {
        setIsNivelesAjustesOpen(false);
        if (editingBenefitId !== null) {
            let title = 'Beneficio';
            if (editingBenefitId === 'pase_alfa') {
                title = (paseAlfaForm.titulo || 'PASE ALFA').toUpperCase();
            } else if (editingBenefitId === 'new') {
                title = 'Nuevo Beneficio';
            } else {
                const found = privilegios.find((p) => p.id === editingBenefitId);
                title = (found?.titulo || newTitle || 'Beneficio').toUpperCase();
            }
            onEditingChangeRef.current?.(true, () => setEditingBenefitId(null), title);
        } else {
            onEditingChangeRef.current?.(false, () => {}, '');
        }
    }, [editingBenefitId, paseAlfaForm.titulo, privilegios, newTitle]);

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
                mostrarEnWeb: newMostrarEnWeb !== false,
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

            const isEditingCoins = (currentBenefit.titulo || '').toLowerCase().includes('alfa coin') ||
                                   (currentBenefit.id || '').toLowerCase().includes('coin');
            const isEditingNiveles = (currentBenefit.titulo || '').toLowerCase().includes('nivel') ||
                                     (currentBenefit.id || '').toLowerCase().includes('nivel');

            const cleanMultiplicador: MultiplicadorCoinsConfig = {
                activo: Boolean(multiplicadorConfig.activo),
                multiplicador: multiplicadorConfig.multiplicador === 3 ? 3 : 2,
                dias_semana: [...multiplicadorConfig.dias_semana].sort((a, b) => a - b),
                mensaje_promo: (multiplicadorConfig.mensaje_promo || '').trim() || `¡Hoy tus compras generan el ${multiplicadorConfig.multiplicador === 3 ? 'TRIPLE (3x)' : 'DOBLE (2x)'} de Alfa Coins en cualquier sucursal!`,
            };

            const cleanNivelesPayload: NivelesClubConfig = {
                activo: Boolean(currentBenefit.activo),
                criterio: nivelesConfig.criterio,
                titulo_tarjeta: currentBenefit.titulo.trim() || 'NIVELES PASE ALFA',
                descripcion_tarjeta: (currentBenefit.descripcion || DEFAULT_NIVELES_CONFIG.descripcion_tarjeta || '').trim(),
                imagenUrl: currentBenefit.imagenUrl || DEFAULT_NIVELES_CONFIG.imagenUrl,
                terminos: (currentBenefit.terminos || buildDefaultNivelesTerminos(nivelesConfig)).trim(),
                member: {
                    id: 'member',
                    nombre: nivelesConfig.member.nombre.trim() || 'Alfa Member',
                    visitasMin: Math.max(0, Number(nivelesConfig.member.visitasMin) || 0),
                    gastoMin: Math.max(0, Number(nivelesConfig.member.gastoMin) || 0),
                    cashbackPct: Math.max(1, Number(nivelesConfig.member.cashbackPct) || 3),
                    color: nivelesConfig.member.color || '#2563EB',
                    colorTexto: nivelesConfig.member.colorTexto || '#FFFFFF',
                    descripcion: nivelesConfig.member.descripcion.trim(),
                    beneficios: (nivelesConfig.member.beneficios || []).map((b) => b.trim()).filter(Boolean),
                },
                gold: {
                    id: 'gold',
                    nombre: nivelesConfig.gold.nombre.trim() || 'Alfa Gold',
                    visitasMin: Math.max(1, Number(nivelesConfig.gold.visitasMin) || 12),
                    gastoMin: Math.max(0, Number(nivelesConfig.gold.gastoMin) || 2400),
                    cashbackPct: Math.max(1, Number(nivelesConfig.gold.cashbackPct) || 5),
                    color: nivelesConfig.gold.color || '#C5A880',
                    colorTexto: nivelesConfig.gold.colorTexto || '#0F172A',
                    descripcion: nivelesConfig.gold.descripcion.trim(),
                    beneficios: (nivelesConfig.gold.beneficios || []).map((b) => b.trim()).filter(Boolean),
                },
                vip: {
                    id: 'vip',
                    nombre: nivelesConfig.vip.nombre.trim() || 'Alfa Black VIP',
                    visitasMin: Math.max(2, Number(nivelesConfig.vip.visitasMin) || 24),
                    gastoMin: Math.max(0, Number(nivelesConfig.vip.gastoMin) || 4800),
                    cashbackPct: Math.max(1, Number(nivelesConfig.vip.cashbackPct) || 7),
                    color: nivelesConfig.vip.color || '#0F172A',
                    colorTexto: nivelesConfig.vip.colorTexto || '#F8FAFC',
                    descripcion: nivelesConfig.vip.descripcion.trim(),
                    beneficios: (nivelesConfig.vip.beneficios || []).map((b) => b.trim()).filter(Boolean),
                },
                actualizado_el: Timestamp.now(),
                actualizado_por: user?.email || 'admin',
            };

            const simpleNivelesPayload = {
                member: {
                    nombre: cleanNivelesPayload.member.nombre,
                    min: cleanNivelesPayload.member.visitasMin,
                    max: cleanNivelesPayload.gold.visitasMin - 1,
                },
                gold: {
                    nombre: cleanNivelesPayload.gold.nombre,
                    min: cleanNivelesPayload.gold.visitasMin,
                    max: cleanNivelesPayload.vip.visitasMin - 1,
                },
                vip: {
                    nombre: cleanNivelesPayload.vip.nombre,
                    min: cleanNivelesPayload.vip.visitasMin,
                },
            };

            // Sincronizar en los 3 documentos (usando objeto anidado pase_alfa para actualizar el mapa interno de app_movil)
            await Promise.all([
                setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    ...(isEditingCoins ? { multiplicador_coins_config: cleanMultiplicador } : {}),
                    ...(isEditingNiveles ? { niveles_config: cleanNivelesPayload, niveles: simpleNivelesPayload } : {}),
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'configuracion', 'app_movil'), {
                    ...(isEditingCoins ? { multiplicador_coins_config: cleanMultiplicador } : {}),
                    ...(isEditingNiveles ? { niveles_config: cleanNivelesPayload } : {}),
                    pase_alfa: {
                        beneficios: activeTitles,
                        beneficios_detallados: updatedList,
                        ...(isEditingCoins ? { multiplicador_coins_config: cleanMultiplicador } : {}),
                        ...(isEditingNiveles ? { niveles_config: cleanNivelesPayload, niveles: simpleNivelesPayload } : {}),
                    },
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    ...(isEditingNiveles ? { niveles_config: cleanNivelesPayload, niveles: simpleNivelesPayload } : {}),
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);

            if (isEditingNiveles) {
                setNivelesConfig(cleanNivelesPayload);
            }

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

        const isNivelesBenefit = b.id === 'niveles_pase_alfa' || (b.titulo || '').toLowerCase().includes('nivel');
        const nextNivelesConfig = isNivelesBenefit ? { ...nivelesConfig, activo: nextActive } : undefined;

        try {
            await Promise.all([
                setDoc(doc(db, 'configuracion', 'pase_alfa'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    ...(nextNivelesConfig ? { niveles_config: nextNivelesConfig } : {}),
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'configuracion', 'app_movil'), {
                    ...(nextNivelesConfig ? { niveles_config: nextNivelesConfig } : {}),
                    pase_alfa: {
                        beneficios: activeTitles,
                        beneficios_detallados: updatedList,
                        ...(nextNivelesConfig ? { niveles_config: nextNivelesConfig } : {}),
                    },
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
                setDoc(doc(db, 'ajustes_sitio', 'membresia_vip'), {
                    beneficios: activeTitles,
                    beneficios_detallados: updatedList,
                    ...(nextNivelesConfig ? { niveles_config: nextNivelesConfig } : {}),
                    actualizado_el: Timestamp.now(),
                }, { merge: true }),
            ]);

            if (nextNivelesConfig) {
                setNivelesConfig(nextNivelesConfig);
            }

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
                    pase_alfa: {
                        beneficios: activeTitles,
                        beneficios_detallados: updatedList,
                    },
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
            {/* GESTOR DE BENEFICIOS / PRIVILEGIOS VIP */}
            <Card className="border border-border/70 shadow-xs transition-all">
                <CardContent className="space-y-4 p-3.5 sm:p-5">
                    {loadingPrivilegios ? (
                        <div className="py-8 flex justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                            </div>
                        ) : editingBenefitId === null ? (
                            /* VISTA 1: LISTADO DE BENEFICIOS (INCLUYENDO PROGRAMA PASE ALFA) */
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-end pb-1">
                                    <Button
                                        type="button"
                                        onClick={handleStartNewBenefit}
                                        variant="alfa"
                                        className="font-semibold text-xs h-7.5 px-3 gap-1.5 cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Agregar Beneficio</span>
                                    </Button>
                                </div>
                                <div className="grid gap-2.5">
                                    {/* PROGRAMA PASE ALFA (SIEMPRE PRIMER ELEMENTO) */}
                                    <div
                                        className={cn(
                                            "flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all gap-2.5",
                                            paseAlfaForm.activo
                                                ? "bg-card border-[#C5A880]/40 shadow-2xs hover:border-blue-500/50"
                                                : "bg-muted/30 border-border/50 opacity-70"
                                        )}
                                    >
                                        {/* IZQUIERDA: Miniatura y Detalles */}
                                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                                            {paseAlfaForm.imagenUrl ? (
                                                <div className="w-14 h-12 sm:w-16 sm:h-12 rounded-lg overflow-hidden border border-[#C5A880]/40 shrink-0 bg-slate-950 relative">
                                                    <img
                                                        src={paseAlfaForm.imagenUrl}
                                                        alt={paseAlfaForm.titulo || 'Pase Alfa'}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-muted/40 text-[#C5A880] flex items-center justify-center shrink-0 border border-[#C5A880]/40">
                                                    <Award className="w-4 h-4 text-[#C5A880]" />
                                                </div>
                                            )}

                                            <div className="space-y-0.5 min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <h5 className="font-semibold text-xs text-foreground truncate font-sans uppercase">
                                                        {paseAlfaForm.titulo ? paseAlfaForm.titulo.toUpperCase() : 'PASE ALFA'}
                                                    </h5>
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] py-0 px-1.5 font-medium border-[#C5A880]/40 text-[#C5A880] bg-[#C5A880]/10 font-sans"
                                                    >
                                                        Programa Base
                                                    </Badge>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[10px] py-0 px-1.5 font-medium border font-sans",
                                                            paseAlfaForm.activo
                                                                ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                                                                : "text-muted-foreground border-border bg-muted/20"
                                                        )}
                                                    >
                                                        {paseAlfaForm.activo ? "Visible" : "Pausado"}
                                                    </Badge>
                                                    {paseAlfaForm.mostrar_en_web === false && (
                                                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground border-border bg-muted/20 font-sans">
                                                            Oculto en Web
                                                        </Badge>
                                                    )}
                                                </div>

                                                <p className="text-[11px] text-muted-foreground line-clamp-1 font-sans">
                                                    {paseAlfaForm.recompensa} ({paseAlfaForm.sellosRequeridos} sellos){paseAlfaForm.subtitulo ? ` • ${paseAlfaForm.subtitulo}` : ''}
                                                </p>
                                            </div>
                                        </div>

                                        {/* DERECHA: Switch y Editar */}
                                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                                            <div className="flex items-center gap-1.5 mr-1">
                                                <Label htmlFor="pase-alfa-list-toggle" className="text-[10px] text-muted-foreground cursor-pointer font-sans">
                                                    {paseAlfaForm.activo ? 'Visible' : 'Oculto'}
                                                </Label>
                                                <Switch
                                                    id="pase-alfa-list-toggle"
                                                    checked={paseAlfaForm.activo}
                                                    onCheckedChange={handleTogglePaseAlfaActive}
                                                    className="scale-75"
                                                />
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setEditingBenefitId('pase_alfa')}
                                                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                                                title="Editar Programa Pase Alfa"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* BENEFICIOS ADICIONALES */}
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

                                                                {item.mostrarEnWeb === false && (
                                                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground border-border bg-muted/20 font-sans">
                                                                        Oculto en Web
                                                                    </Badge>
                                                                )}

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
                            </div>
                        ) : editingBenefitId === 'pase_alfa' ? (
                            /* VISTA 2A: FORMULARIO DE EDICIÓN DEL PROGRAMA PASE ALFA */
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-border/50">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="pase-alfa-form-web" className="text-xs font-medium cursor-pointer text-muted-foreground">
                                            {paseAlfaForm.mostrar_en_web !== false ? 'Visible en Sitio Web' : 'Oculto en Sitio Web'}
                                        </Label>
                                        <Switch
                                            id="pase-alfa-form-web"
                                            checked={paseAlfaForm.mostrar_en_web !== false}
                                            onCheckedChange={(checked) =>
                                                setPaseAlfaForm((prev) => ({ ...prev, mostrar_en_web: checked }))
                                            }
                                            className="scale-90"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="pase-alfa-form-active" className="text-xs font-medium cursor-pointer text-muted-foreground">
                                            {paseAlfaForm.activo ? 'Visible' : 'Pausado'}
                                        </Label>
                                        <Switch
                                            id="pase-alfa-form-active"
                                            checked={paseAlfaForm.activo}
                                            onCheckedChange={(checked) =>
                                                setPaseAlfaForm((prev) => ({ ...prev, activo: checked }))
                                            }
                                            className="scale-90"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                                    {/* COLUMNA IZQUIERDA: CAMPOS Y TEXTOS */}
                                    <div className="lg:col-span-8 space-y-3.5">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Label className="text-xs font-semibold text-foreground">Título del Pase</Label>
                                                    <InfoTooltip text="Nombre visible en la tarjeta y en la sección del Pase Alfa." />
                                                </div>
                                                <Input
                                                    value={paseAlfaForm.titulo}
                                                    onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, titulo: e.target.value })}
                                                    placeholder="Ej. PASE ALFA"
                                                    className="h-8.5 text-xs font-medium font-sans"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Label className="text-xs font-semibold text-foreground">Recompensa</Label>
                                                    <InfoTooltip text="Premio que se desbloquea al llenar la tarjeta (ej. El décimo corte GRATIS)." />
                                                </div>
                                                <Input
                                                    value={paseAlfaForm.recompensa}
                                                    onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, recompensa: e.target.value })}
                                                    placeholder="Ej. El décimo corte GRATIS"
                                                    className="h-8.5 text-xs font-medium font-sans"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Label className="text-xs font-semibold text-foreground">Meta de Sellos</Label>
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

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-semibold text-foreground">Subtítulo / Lema Explicativo</Label>
                                                <InfoTooltip text="Lema o frase explicativa visible en la cabecera del pase." />
                                            </div>
                                            <Input
                                                value={paseAlfaForm.subtitulo}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, subtitulo: e.target.value })}
                                                placeholder="Ej. Acumula sellos y Alfa Coins en cada visita..."
                                                className="h-8.5 text-xs font-medium font-sans"
                                            />
                                        </div>

                                        {/* INSTRUCCIONES DE ESCANEO (SOLO TEXTO Y BOTÓN ABRIR) */}
                                        <div className="flex items-center justify-between gap-3 p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl border border-border/60 bg-muted/15">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Label className="text-xs font-semibold text-foreground">
                                                    Instrucciones de Escaneo (Modal QR)
                                                </Label>
                                                <InfoTooltip text="Instrucciones que ve el cliente al abrir su código QR en recepción para sellar su visita." />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openExpandedEditor(
                                                    "Instrucciones de Escaneo (Modal QR)",
                                                    "Edita las instrucciones que ve el cliente al presentar su código QR en recepción.",
                                                    paseAlfaForm.instrucciones,
                                                    (val) => setPaseAlfaForm((prev) => ({ ...prev, instrucciones: val }))
                                                )}
                                                className="h-7.5 px-3 text-xs font-semibold gap-1.5 shrink-0 cursor-pointer"
                                            >
                                                <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                                                <span>Abrir</span>
                                            </Button>
                                        </div>

                                        {/* TÉRMINOS Y CONDICIONES DEL PASE (SOLO TEXTO Y BOTÓN ABRIR) */}
                                        <div className="flex items-center justify-between gap-3 p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl border border-border/60 bg-muted/15">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Label className="text-xs font-semibold text-foreground">
                                                    Términos y Condiciones del Pase
                                                </Label>
                                                <InfoTooltip text="Reglas, restricciones y validez aplicables al Pase Alfa." />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openExpandedEditor(
                                                    "Términos y Condiciones del Programa Pase Alfa",
                                                    "Edita con amplitud las reglas, restricciones y validez aplicables al Programa Pase Alfa.",
                                                    paseAlfaForm.terminos,
                                                    (val) => setPaseAlfaForm((prev) => ({ ...prev, terminos: val }))
                                                )}
                                                className="h-7.5 px-3 text-xs font-semibold gap-1.5 shrink-0 cursor-pointer"
                                            >
                                                <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                                                <span>Abrir</span>
                                            </Button>
                                        </div>
                                    </div>

                                    {/* COLUMNA DERECHA: FOTOGRAFÍA */}
                                    <div className="lg:col-span-4 space-y-1.5">
                                        <div className="flex items-center justify-between gap-1">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-semibold text-foreground">
                                                    Fotografía / Portada
                                                </Label>
                                                <InfoTooltip text="Sube una portada para el Programa Pase Alfa. Tamaño ideal: 1280 x 720 px (16:9)." />
                                            </div>
                                            <span className="text-[10px] font-medium text-slate-400">1280×720</span>
                                        </div>
                                        <ImageUploader
                                            folder="pase_alfa"
                                            currentImageUrl={paseAlfaForm.imagenUrl || ''}
                                            onUpload={(url) => setPaseAlfaForm((prev) => ({ ...prev, imagenUrl: url }))}
                                            onRemove={() => setPaseAlfaForm((prev) => ({ ...prev, imagenUrl: '' }))}
                                            onUploadStateChange={setIsUploadingPaseAlfaImage}
                                            multiple={false}
                                            objectFit="cover"
                                            aspectRatio="16/9"
                                            showPreview={true}
                                            showRemove={true}
                                            className="w-full aspect-video border-2 border-dashed rounded-xl bg-slate-950/90 hover:bg-slate-950 transition-all cursor-pointer shadow-2xs"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end pt-3 border-t border-border/50">
                                    <Button
                                        type="button"
                                        onClick={handleSavePaseAlfa}
                                        disabled={isSavingPaseAlfa || isUploadingPaseAlfaImage}
                                        variant="alfa"
                                        className="font-semibold text-xs px-5 h-8.5 w-full sm:w-auto cursor-pointer"
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
                                                Guardar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            /* VISTA 2B: FORMULARIO DE CREACIÓN / EDICIÓN DE BENEFICIO */
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-border/50">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="benefit-form-web" className="text-xs font-medium cursor-pointer text-muted-foreground">
                                            {newMostrarEnWeb !== false ? 'Visible en Sitio Web' : 'Oculto en Sitio Web'}
                                        </Label>
                                        <Switch
                                            id="benefit-form-web"
                                            checked={newMostrarEnWeb !== false}
                                            onCheckedChange={setNewMostrarEnWeb}
                                            className="scale-90"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
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

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                                    {/* COLUMNA IZQUIERDA: TÍTULO, DESCRIPCIÓN, TÉRMINOS Y VIGENCIA */}
                                    <div className="lg:col-span-8 space-y-3.5">
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

                                        {/* DESCRIPCIÓN (SOLO TEXTO Y BOTÓN ABRIR) */}
                                        <div className="flex items-center justify-between gap-3 p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl border border-border/60 bg-muted/15">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Label className="text-xs font-semibold text-foreground">
                                                    Descripción del beneficio
                                                </Label>
                                                <InfoTooltip text="Detalla qué incluye este beneficio para el cliente." />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openExpandedEditor(
                                                    "Descripción del Beneficio",
                                                    "Detalla con amplitud lo que incluye este beneficio para el cliente.",
                                                    newDescripcion,
                                                    (val) => setNewDescripcion(val)
                                                )}
                                                className="h-7.5 px-3 text-xs font-semibold gap-1.5 shrink-0 cursor-pointer"
                                            >
                                                <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                                                <span>Abrir</span>
                                            </Button>
                                        </div>

                                        {/* TÉRMINOS Y CONDICIONES (SOLO TEXTO Y BOTÓN ABRIR) */}
                                        <div className="flex items-center justify-between gap-3 p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl border border-border/60 bg-muted/15">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Label className="text-xs font-semibold text-foreground">
                                                    Términos y condiciones
                                                </Label>
                                                <InfoTooltip text="Condiciones o restricciones aplicables para hacer válido este beneficio." />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openExpandedEditor(
                                                    "Términos y Condiciones del Beneficio",
                                                    "Edita las reglas y restricciones para hacer válido este beneficio.",
                                                    newTerminos,
                                                    (val) => setNewTerminos(val)
                                                )}
                                                className="h-7.5 px-3 text-xs font-semibold gap-1.5 shrink-0 cursor-pointer"
                                            >
                                                <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                                                <span>Abrir</span>
                                            </Button>
                                        </div>

                                        {/* FECHA LÍMITE DE VIGENCIA */}
                                        <div className="flex items-center justify-between gap-3 p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl border border-border/60 bg-muted/15">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Switch
                                                    id="new-expiry-toggle"
                                                    checked={newHasExpiry}
                                                    onCheckedChange={setNewHasExpiry}
                                                    className="scale-90 shrink-0"
                                                />
                                                <Label htmlFor="new-expiry-toggle" className="text-xs cursor-pointer font-semibold text-foreground truncate">
                                                    Fecha límite de vigencia
                                                </Label>
                                            </div>

                                            {newHasExpiry ? (
                                                <Popover modal={true} open={newDatePickerOpen} onOpenChange={setNewDatePickerOpen}>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className={cn(
                                                                "h-7.5 text-xs px-3 font-semibold justify-start text-left bg-background font-sans shrink-0 gap-1.5 cursor-pointer",
                                                                !newFechaLimite && "text-muted-foreground"
                                                            )}
                                                        >
                                                            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                            <span className="truncate">
                                                                {parseDateSafe(newFechaLimite)
                                                                    ? format(parseDateSafe(newFechaLimite)!, "dd 'de' MMM, yyyy", { locale: es })
                                                                    : "Seleccionar fecha"}
                                                            </span>
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 z-[60] border-2 border-blue-500 rounded-xl shadow-xl" align="end">
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
                                            ) : (
                                                <span className="text-xs text-muted-foreground font-sans shrink-0">
                                                    Permanente / Sin caducidad
                                                </span>
                                            )}
                                        </div>

                                        {/* SI ES EL BENEFICIO DE ALFA COINS: DÍAS DOBLES / TRIPLES INTEGRADO */}
                                        {((newTitle || '').toLowerCase().includes('alfa coin') ||
                                         (benefitId || '').toLowerCase().includes('coin') ||
                                         privilegios.find((p) => p.id === editingBenefitId)?.titulo.toLowerCase().includes('alfa coin')) && (
                                            <div className="rounded-xl border border-border/80 bg-muted/15 p-3.5 sm:p-4 space-y-3.5">
                                                <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <Flame className={cn("h-4 w-4 shrink-0 transition-colors", multiplicadorConfig.activo ? "text-blue-500" : "text-slate-400")} />
                                                        <div>
                                                            <h5 className="text-xs font-bold text-foreground">
                                                                Días de Alfa Coins al Doble (2x) o Triple (3x)
                                                            </h5>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                Multiplica las monedas acumuladas en compras presenciales en sucursal.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <Label htmlFor="coins-mult-toggle" className="text-xs font-medium cursor-pointer text-muted-foreground">
                                                            {multiplicadorConfig.activo ? 'Activo' : 'Inactivo'}
                                                        </Label>
                                                        <Switch
                                                            id="coins-mult-toggle"
                                                            checked={multiplicadorConfig.activo}
                                                            onCheckedChange={(checked) =>
                                                                setMultiplicadorConfig((prev) => ({ ...prev, activo: checked }))
                                                            }
                                                            className="scale-90"
                                                        />
                                                    </div>
                                                </div>

                                                {/* CONTROLES EN FILA CÓMODA Y ELEGANTE */}
                                                <div className={cn("space-y-3 transition-opacity", !multiplicadorConfig.activo && "opacity-50 pointer-events-none")}>
                                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                                                        {/* MULTIPLICADOR: CONTROL SEGMENTADO */}
                                                        <div className="sm:col-span-5 space-y-1.5">
                                                            <Label className="text-xs font-semibold text-foreground">
                                                                Multiplicador
                                                            </Label>
                                                            <div className="flex p-1 rounded-xl bg-muted/40 border border-border/60 gap-1 w-full">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setMultiplicadorConfig((prev) => ({
                                                                        ...prev,
                                                                        multiplicador: 2,
                                                                        mensaje_promo: (prev.mensaje_promo || '').includes('TRIPLE')
                                                                            ? '¡Hoy tus compras generan el DOBLE (2x) de Alfa Coins en cualquier sucursal!'
                                                                            : (prev.mensaje_promo || ''),
                                                                    }))}
                                                                    className={cn(
                                                                        "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                                                                        multiplicadorConfig.multiplicador === 2
                                                                            ? "bg-[#202A49] text-white shadow-xs font-bold"
                                                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                                    )}
                                                                >
                                                                    <span>2x Doble</span>
                                                                    <span className="text-[10px] opacity-75 font-normal">($1 = 2)</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setMultiplicadorConfig((prev) => ({
                                                                        ...prev,
                                                                        multiplicador: 3,
                                                                        mensaje_promo: (prev.mensaje_promo || '').includes('DOBLE')
                                                                            ? '¡Hoy tus compras generan el TRIPLE (3x) de Alfa Coins en cualquier sucursal!'
                                                                            : (prev.mensaje_promo || ''),
                                                                    }))}
                                                                    className={cn(
                                                                        "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                                                                        multiplicadorConfig.multiplicador === 3
                                                                            ? "bg-[#202A49] text-white shadow-xs font-bold"
                                                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                                                    )}
                                                                >
                                                                    <span>3x Triple</span>
                                                                    <span className="text-[10px] opacity-75 font-normal">($1 = 3)</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* DÍAS DE LA SEMANA: PÍLDORAS CALENDARIO */}
                                                        <div className="sm:col-span-7 space-y-1.5">
                                                            <div className="flex items-center justify-between">
                                                                <Label className="text-xs font-semibold text-foreground">
                                                                    Días de la semana
                                                                </Label>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    Toca para activar
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-7 gap-1">
                                                                {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
                                                                    const isSelected = multiplicadorConfig.dias_semana.includes(dayIdx);
                                                                    const isToday = new Date().getDay() === dayIdx;
                                                                    return (
                                                                        <button
                                                                            key={dayIdx}
                                                                            type="button"
                                                                            onClick={() => handleToggleDayOfWeek(dayIdx)}
                                                                            className={cn(
                                                                                "h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex flex-col items-center justify-center",
                                                                                isSelected
                                                                                    ? "bg-blue-600 text-white border-blue-500 shadow-2xs font-bold"
                                                                                    : "bg-muted/20 border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                                                                            )}
                                                                            title={DAY_NAMES_ES[dayIdx]}
                                                                        >
                                                                            <span className="leading-none">{DAY_NAMES_ES[dayIdx].slice(0, 3)}</span>
                                                                            {isToday && (
                                                                                <span className={cn(
                                                                                    "w-1 h-1 rounded-full mt-0.5",
                                                                                    isSelected ? "bg-white" : "bg-blue-500"
                                                                                )} />
                                                                            )}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* MENSAJE PROMOCIONAL */}
                                                    <div className="space-y-1 pt-1">
                                                        <Label className="text-xs font-semibold text-foreground">
                                                            Mensaje de aviso en la App Móvil (Opcional)
                                                        </Label>
                                                        <Input
                                                            value={multiplicadorConfig.mensaje_promo || ''}
                                                            onChange={(e) => setMultiplicadorConfig((prev) => ({ ...prev, mensaje_promo: e.target.value }))}
                                                            placeholder="Ej. ¡Hoy tus compras generan el DOBLE (2x) de Alfa Coins en cualquier sucursal!"
                                                            className="h-8.5 text-xs font-sans"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* SI ES EL BENEFICIO DE NIVELES PASE ALFA: CONFIGURACIÓN COMPLETA DE ALFA MEMBER, ALFA GOLD Y ALFA VIP */}
                                        {((newTitle || '').toLowerCase().includes('nivel') ||
                                         (benefitId || '').toLowerCase().includes('nivel') ||
                                         privilegios.find((p) => p.id === editingBenefitId)?.titulo.toLowerCase().includes('nivel')) && (
                                            <div className={cn(
                                                "rounded-xl border border-border/60 bg-muted/15 transition-all",
                                                isNivelesAjustesOpen ? "p-3 sm:p-3.5 space-y-3.5" : "p-2.5 sm:px-3.5 sm:py-2.5"
                                            )}>
                                                <div
                                                    onClick={() => setIsNivelesAjustesOpen(!isNivelesAjustesOpen)}
                                                    className="flex items-center justify-between cursor-pointer select-none group h-7.5"
                                                >
                                                    <h5 className="text-xs font-bold text-foreground tracking-wide uppercase">
                                                        AJUSTE DE NIVELES
                                                    </h5>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsNivelesAjustesOpen(!isNivelesAjustesOpen);
                                                        }}
                                                        className="text-slate-400 group-hover:text-white transition-colors h-7.5 w-7.5 flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer"
                                                        title={isNivelesAjustesOpen ? 'Minimizar' : 'Maximizar'}
                                                    >
                                                        {isNivelesAjustesOpen ? (
                                                            <ChevronUp className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>

                                                {isNivelesAjustesOpen && (
                                                    <div className="space-y-3.5 pt-3 border-t border-border/50">
                                                        {/* CRITERIO DE ASCENSO */}
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs font-semibold text-foreground">Criterio de Ascenso de Nivel</Label>
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setNivelesConfig((prev) => ({ ...prev, criterio: 'ambos_opcional' }))}
                                                                    className={cn(
                                                                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                                                                        nivelesConfig.criterio === 'ambos_opcional'
                                                                            ? "border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400 font-semibold shadow-xs"
                                                                            : "border-border/60 bg-muted/20 text-muted-foreground hover:border-border"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-xs font-bold text-foreground">Visitas O Gasto Total</span>
                                                                        {nivelesConfig.criterio === 'ambos_opcional' && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                                                                    </div>
                                                                    <span className="text-[10px] text-muted-foreground mt-0.5">El cliente sube al cumplir cualquiera de los 2</span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setNivelesConfig((prev) => ({ ...prev, criterio: 'visitas' }))}
                                                                    className={cn(
                                                                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                                                                        nivelesConfig.criterio === 'visitas'
                                                                            ? "border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400 font-semibold shadow-xs"
                                                                            : "border-border/60 bg-muted/20 text-muted-foreground hover:border-border"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-xs font-bold text-foreground">Solo por Visitas / Sellos</span>
                                                                        {nivelesConfig.criterio === 'visitas' && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                                                                    </div>
                                                                    <span className="text-[10px] text-muted-foreground mt-0.5">Sube al completar los servicios requeridos</span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setNivelesConfig((prev) => ({ ...prev, criterio: 'gasto' }))}
                                                                    className={cn(
                                                                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                                                                        nivelesConfig.criterio === 'gasto'
                                                                            ? "border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400 font-semibold shadow-xs"
                                                                            : "border-border/60 bg-muted/20 text-muted-foreground hover:border-border"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-xs font-bold text-foreground">Solo por Dinero Gastado ($)</span>
                                                                        {nivelesConfig.criterio === 'gasto' && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                                                                    </div>
                                                                    <span className="text-[10px] text-muted-foreground mt-0.5">Sube por el total facturado en la barbería</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* PESTAÑAS DE LOS 3 NIVELES */}
                                                        <div className="space-y-3 pt-1">
                                                            <Tabs value={activeNivelTab} onValueChange={(val: any) => setActiveNivelTab(val)}>
                                                                <TabsList className="grid w-full grid-cols-3 h-9 p-1 bg-muted/40 rounded-xl">
                                                                    <TabsTrigger
                                                                        value="member"
                                                                        className="text-xs font-bold gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                                                                    >
                                                                        <Award className="w-3.5 h-3.5" />
                                                                        <span>{nivelesConfig.member.nombre || 'Alfa Member'}</span>
                                                                    </TabsTrigger>
                                                                    <TabsTrigger
                                                                        value="gold"
                                                                        className="text-xs font-bold gap-1.5 data-[state=active]:bg-[#C5A880] data-[state=active]:text-black"
                                                                    >
                                                                        <Star className="w-3.5 h-3.5" />
                                                                        <span>{nivelesConfig.gold.nombre || 'Alfa Gold'}</span>
                                                                    </TabsTrigger>
                                                                    <TabsTrigger
                                                                        value="vip"
                                                                        className="text-xs font-bold gap-1.5 data-[state=active]:bg-[#10172b] data-[state=active]:text-white"
                                                                    >
                                                                        <Crown className="w-3.5 h-3.5 text-[#C5A880]" />
                                                                        <span>{nivelesConfig.vip.nombre || 'Alfa Black VIP'}</span>
                                                                    </TabsTrigger>
                                                                </TabsList>

                                                                {(['member', 'gold', 'vip'] as const).map((tierKey) => {
                                                                    const tier = nivelesConfig[tierKey];
                                                                    return (
                                                                        <TabsContent key={tierKey} value={tierKey} className="space-y-3 mt-3">
                                                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
                                                                                <div className="space-y-1.5">
                                                                                    <Label className="text-xs font-semibold text-foreground h-5 flex items-center">
                                                                                        Nombre del Nivel
                                                                                    </Label>
                                                                                    <Input
                                                                                        value={tier.nombre}
                                                                                        onChange={(e) => updateNivelField(tierKey, 'nombre', e.target.value)}
                                                                                        className="h-8.5 text-xs font-semibold font-sans text-foreground w-full"
                                                                                    />
                                                                                </div>

                                                                                <div className="space-y-1.5">
                                                                                    <Label className="text-xs font-semibold text-foreground h-5 flex items-center">
                                                                                        Visitas Mínimas
                                                                                    </Label>
                                                                                    <Input
                                                                                        type="number"
                                                                                        min={0}
                                                                                        max={100}
                                                                                        value={tier.visitasMin}
                                                                                        disabled={tierKey === 'member'}
                                                                                        onChange={(e) => updateNivelField(tierKey, 'visitasMin', Math.max(0, parseInt(e.target.value) || 0))}
                                                                                        className="h-8.5 text-xs font-semibold font-sans text-foreground w-full"
                                                                                    />
                                                                                </div>

                                                                                <div className="space-y-1.5">
                                                                                    <Label className="text-xs font-semibold text-foreground h-5 flex items-center">
                                                                                        Gasto mínimo
                                                                                    </Label>
                                                                                    <Input
                                                                                        type="text"
                                                                                        disabled={tierKey === 'member'}
                                                                                        value={
                                                                                            tierKey === 'member'
                                                                                                ? '$ 0.00'
                                                                                                : focusedGastoKey === tierKey
                                                                                                    ? (rawGastoInput.startsWith('$') ? rawGastoInput : (rawGastoInput ? `$ ${rawGastoInput}` : '$ '))
                                                                                                    : `$ ${formatMoney(tier.gastoMin || 0)}`
                                                                                        }
                                                                                        onFocus={() => {
                                                                                            setFocusedGastoKey(tierKey);
                                                                                            setRawGastoInput(tier.gastoMin ? String(tier.gastoMin) : '');
                                                                                        }}
                                                                                        onChange={(e) => {
                                                                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                                            setRawGastoInput(val);
                                                                                            const num = parseFloat(val) || 0;
                                                                                            updateNivelField(tierKey, 'gastoMin', Math.max(0, num));
                                                                                        }}
                                                                                        onBlur={() => {
                                                                                            setFocusedGastoKey(null);
                                                                                        }}
                                                                                        className="h-8.5 text-xs font-semibold font-sans text-foreground w-full"
                                                                                    />
                                                                                </div>

                                                                                <div className="space-y-1.5">
                                                                                    <Label className="text-xs font-semibold text-foreground h-5 flex items-center">
                                                                                        Retorno AlfaCoins
                                                                                    </Label>
                                                                                    <div className="relative flex items-center w-full">
                                                                                        <Input
                                                                                            type="number"
                                                                                            min={1}
                                                                                            max={50}
                                                                                            step={0.5}
                                                                                            value={tier.cashbackPct ?? (tierKey === 'member' ? 3 : tierKey === 'gold' ? 5 : 7)}
                                                                                            onChange={(e) => updateNivelField(tierKey, 'cashbackPct', Math.max(0, parseFloat(e.target.value) || 0))}
                                                                                            className="h-8.5 text-xs font-semibold font-sans text-foreground pr-7 w-full"
                                                                                        />
                                                                                        <span className="absolute right-2.5 text-xs text-muted-foreground font-semibold pointer-events-none select-none">%</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="space-y-1">
                                                                                <Label className="text-xs font-semibold">Descripción del Estatus</Label>
                                                                                <Input
                                                                                    value={tier.descripcion}
                                                                                    onChange={(e) => updateNivelField(tierKey, 'descripcion', e.target.value)}
                                                                                    placeholder="Breve explicación de este rango para el cliente..."
                                                                                    className="h-8.5 text-xs font-sans"
                                                                                />
                                                                            </div>

                                                                            <div className="space-y-2">
                                                                                <Label className="text-xs font-semibold">Beneficios exclusivos de este rango</Label>
                                                                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                                                                    {tier.beneficios.map((b, bIdx) => (
                                                                                        <div key={bIdx} className="flex items-center gap-2 p-1.5 px-2.5 rounded-lg border border-border/60 bg-card text-xs">
                                                                                            <Check className="w-3.5 h-3.5 text-[#C5A880] shrink-0" />
                                                                                            <span className="flex-1 text-foreground">{b}</span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => removeNivelBeneficio(tierKey, bIdx)}
                                                                                                className="text-slate-400 hover:text-red-400 transition-colors p-1"
                                                                                                title="Eliminar beneficio"
                                                                                            >
                                                                                                <Trash2 className="w-3 h-3" />
                                                                                            </button>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                                <div className="flex items-center gap-2 pt-1">
                                                                                    <Input
                                                                                        value={newTierBenefitText}
                                                                                        onChange={(e) => setNewTierBenefitText(e.target.value)}
                                                                                        onKeyDown={(e) => {
                                                                                            if (e.key === 'Enter') {
                                                                                                e.preventDefault();
                                                                                                handleAddNivelBeneficio(tierKey);
                                                                                            }
                                                                                        }}
                                                                                        placeholder={`Agregar beneficio para ${tier.nombre}...`}
                                                                                        className="h-8 text-xs font-sans"
                                                                                    />
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="outline"
                                                                                        size="sm"
                                                                                        onClick={() => handleAddNivelBeneficio(tierKey)}
                                                                                        className="h-8 w-8 p-0 flex items-center justify-center shrink-0 cursor-pointer rounded-lg border-border/70 hover:bg-muted/40 hover:text-foreground"
                                                                                        title="Agregar beneficio"
                                                                                    >
                                                                                        <Plus className="w-4 h-4 text-slate-300" />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        </TabsContent>
                                                                    );
                                                                })}
                                                            </Tabs>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* COLUMNA DERECHA: FOTOGRAFÍA / IMAGEN */}
                                    <div className="lg:col-span-4 space-y-1.5">
                                        <div className="flex items-center justify-between gap-1">
                                            <div className="flex items-center gap-1.5">
                                                <Label className="text-xs font-semibold text-foreground">
                                                    Fotografía / Imagen
                                                </Label>
                                                <InfoTooltip text="Sube una fotografía para este beneficio. Tamaño ideal: 1280 x 720 px (16:9)." />
                                            </div>
                                            <span className="text-[10px] font-medium text-slate-400">1280×720</span>
                                        </div>
                                        <ImageUploader
                                            folder="beneficios_pase_alfa"
                                            currentImageUrl={newImagenUrl}
                                            onUpload={(url) => setNewImagenUrl(url)}
                                            onRemove={() => setNewImagenUrl('')}
                                            onUploadStateChange={setIsUploadingBenefitImage}
                                            multiple={false}
                                            objectFit="cover"
                                            aspectRatio="16/9"
                                            showPreview={true}
                                            showRemove={true}
                                            className="w-full aspect-video border-2 border-dashed rounded-xl bg-slate-950/90 hover:bg-slate-950 transition-all cursor-pointer shadow-2xs"
                                        />
                                    </div>
                                </div>

                                {/* BOTÓN GUARDAR BENEFICIO (CANCELAR ELIMINADO COMO SE SOLICITÓ) */}
                                <div className="flex items-center justify-end pt-3 border-t border-border/50">
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
                                                Guardar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
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
                    className="p-0 overflow-hidden w-screen h-[100dvh] max-w-none rounded-none border-0 sm:border-2 sm:border-blue-500 sm:rounded-2xl sm:w-[95vw] sm:max-w-4xl sm:h-[85vh] sm:max-h-[85vh] flex flex-col shadow-[0_10px_30px_rgba(59,130,246,0.18)]"
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
