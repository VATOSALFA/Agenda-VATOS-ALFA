'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { db, storage } from '@/lib/firebase-client';
import { collection, addDoc, updateDoc, doc, deleteDoc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface AppAviso {
    id: string;
    titulo: string;
    descripcion: string;
    imagenUrl: string | null;
    fechaExpiracion: Timestamp | null;
    activo: boolean;
}

interface AppPromocion {
    id: string;
    titulo: string;
    descripcion: string;
    imagenUrl: string | null;
    codigoDescuento: string;
    mostrarQr: boolean;
    activo: boolean;
}

export interface PrivilegioVIP {
    id: string;
    titulo: string;
    activo: boolean;
    fechaLimite?: string | null; // YYYY-MM-DD
    creado_el?: any;
}

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

const isPrivilegeExpired = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const today = format(new Date(), 'yyyy-MM-dd');
    return dateStr < today;
};

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

    // -- AVISOS --
    const { data: avisos, loading: loadingAvisos } = useFirestoreQuery<AppAviso>('app_avisos');
    const [isSavingAviso, setIsSavingAviso] = useState(false);
    
    // -- PROMOCIONES --
    const { data: promociones, loading: loadingPromos } = useFirestoreQuery<AppPromocion>('app_promociones');
    const [isSavingPromo, setIsSavingPromo] = useState(false);
    
    // -- PASE ALFA (CONFIGURACIÓN DINÁMICA DE LEALTAD) --
    const [paseAlfaForm, setPaseAlfaForm] = useState({
        activo: true,
        titulo: 'Pase Alfa Club',
        subtitulo: 'Cada visita cuenta. Presenta tu código QR en recepción y disfruta tu corte de cortesía.',
        sellosRequeridos: 10,
        recompensa: '10.° Corte Totalmente Gratis',
        puntosPorVisita: 10,
        instrucciones: 'Presenta tu código QR en recepción al finalizar tu servicio para que el barbero abone tu sello de visita.',
        terminos: 'Válido en sucursales oficiales de Vatos Alfa Barbería. Aplica en cortes y servicios seleccionados.',
    });
    const [loadingPaseAlfa, setLoadingPaseAlfa] = useState(true);
    const [isSavingPaseAlfa, setIsSavingPaseAlfa] = useState(false);

    // -- PRIVILEGIOS VIP / BENEFICIOS (ESTRUCTURA RICA) --
    const [privilegios, setPrivilegios] = useState<PrivilegioVIP[]>([]);
    const [loadingMembresia, setLoadingMembresia] = useState(true);
    const [isSavingPrivilegios, setIsSavingPrivilegios] = useState(false);

    // Formulario de Nuevo Privilegio
    const [newTitle, setNewTitle] = useState('');
    const [newActivo, setNewActivo] = useState(true);
    const [newHasExpiry, setNewHasExpiry] = useState(false);
    const [newFechaLimite, setNewFechaLimite] = useState('');

    // Modal de Edición
    const [editingPrivilegio, setEditingPrivilegio] = useState<PrivilegioVIP | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editActivo, setEditActivo] = useState(true);
    const [editHasExpiry, setEditHasExpiry] = useState(false);
    const [editFechaLimite, setEditFechaLimite] = useState('');

    // Modal de Eliminación con Barra de Seguridad
    const [deletingPrivilegio, setDeletingPrivilegio] = useState<PrivilegioVIP | null>(null);

    useEffect(() => {
        async function fetchConfig() {
            try {
                let rawBenefits: any[] = [];

                // 1. Cargar configuracion/pase_alfa
                const paseRef = doc(db, 'configuracion', 'pase_alfa');
                const paseSnap = await getDoc(paseRef);

                if (paseSnap.exists()) {
                    const data = paseSnap.data();
                    setPaseAlfaForm({
                        activo: data.activo !== undefined ? Boolean(data.activo) : true,
                        titulo: data.titulo || 'Pase Alfa Club',
                        subtitulo: data.subtitulo || '',
                        sellosRequeridos: Number(data.sellosRequeridos) || 10,
                        recompensa: data.recompensa || '10.° Corte Totalmente Gratis',
                        puntosPorVisita: Number(data.puntosPorVisita) || 10,
                        instrucciones: data.instrucciones || '',
                        terminos: data.terminos || '',
                    });
                    if (Array.isArray(data.beneficios_detallados) && data.beneficios_detallados.length > 0) {
                        rawBenefits = data.beneficios_detallados;
                    } else if (Array.isArray(data.beneficios)) {
                        rawBenefits = data.beneficios;
                    }
                } else {
                    // 2. Fallback a configuracion/app_movil
                    const appMovilRef = doc(db, 'configuracion', 'app_movil');
                    const appMovilSnap = await getDoc(appMovilRef);
                    if (appMovilSnap.exists()) {
                        const mData = appMovilSnap.data();
                        const pData = mData.pase_alfa || mData;
                        if (pData.sellosRequeridos || pData.titulo) {
                            setPaseAlfaForm({
                                activo: pData.activo !== undefined ? Boolean(pData.activo) : true,
                                titulo: pData.titulo || 'Pase Alfa Club',
                                subtitulo: pData.subtitulo || '',
                                sellosRequeridos: Number(pData.sellosRequeridos) || 10,
                                recompensa: pData.recompensa || '10.° Corte Totalmente Gratis',
                                puntosPorVisita: Number(pData.puntosPorVisita) || 10,
                                instrucciones: pData.instrucciones || '',
                                terminos: pData.terminos || '',
                            });
                        }
                        if (Array.isArray(pData.beneficios_detallados) && pData.beneficios_detallados.length > 0) {
                            rawBenefits = pData.beneficios_detallados;
                        } else if (Array.isArray(pData.beneficios)) {
                            rawBenefits = pData.beneficios;
                        }
                    }
                    
                    // 3. Fallback a ajustes_sitio/membresia_vip
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
            } catch (e) {
                console.error('Error cargando configuración móvil:', e);
            } finally {
                setLoadingPaseAlfa(false);
                setLoadingMembresia(false);
            }
        }
        fetchConfig();
    }, []);

    // Avisos handlers
    const [avisoForm, setAvisoForm] = useState({ titulo: '', descripcion: '', fechaExpiracion: '', activo: true });
    const [avisoFile, setAvisoFile] = useState<File | null>(null);

    const [promoForm, setPromoForm] = useState({ titulo: '', descripcion: '', codigoDescuento: '', mostrarQr: true, activo: true });
    const [promoFile, setPromoFile] = useState<File | null>(null);

    const handleCreateAviso = async () => {
        if (!avisoForm.titulo) return toast({ title: 'Error', description: 'El título es obligatorio', variant: 'destructive' });
        setIsSavingAviso(true);
        try {
            let imagenUrl = null;
            if (avisoFile) {
                const storageRef = ref(storage, "app_avisos/" + Date.now() + "_" + avisoFile.name);
                await uploadBytes(storageRef, avisoFile);
                imagenUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, 'app_avisos'), {
                ...avisoForm,
                imagenUrl,
                fechaExpiracion: avisoForm.fechaExpiracion ? Timestamp.fromDate(new Date(avisoForm.fechaExpiracion)) : null,
                createdAt: Timestamp.now()
            });

            toast({ title: 'Éxito', description: 'Aviso creado correctamente.' });
            setAvisoForm({ titulo: '', descripcion: '', fechaExpiracion: '', activo: true });
            setAvisoFile(null);
        } catch (e) {
            toast({ title: 'Error', description: 'No se pudo crear el aviso.', variant: 'destructive' });
        } finally {
            setIsSavingAviso(false);
        }
    };

    const handleToggleAviso = async (id: string, currentStatus: boolean) => {
        await updateDoc(doc(db, 'app_avisos', id), { activo: !currentStatus });
    };

    const handleDeleteAviso = async (id: string) => {
        if (!confirm('¿Eliminar este aviso?')) return;
        await deleteDoc(doc(db, 'app_avisos', id));
    };

    const handleCreatePromo = async () => {
        if (!promoForm.titulo) return toast({ title: 'Error', description: 'El título es obligatorio', variant: 'destructive' });
        setIsSavingPromo(true);
        try {
            let imagenUrl = null;
            if (promoFile) {
                const storageRef = ref(storage, "app_promociones/" + Date.now() + "_" + promoFile.name);
                await uploadBytes(storageRef, promoFile);
                imagenUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, 'app_promociones'), {
                ...promoForm,
                imagenUrl,
                createdAt: Timestamp.now()
            });

            toast({ title: 'Éxito', description: 'Promoción creada correctamente.' });
            setPromoForm({ titulo: '', descripcion: '', codigoDescuento: '', mostrarQr: true, activo: true });
            setPromoFile(null);
        } catch (e) {
            toast({ title: 'Error', description: 'No se pudo crear la promoción.', variant: 'destructive' });
        } finally {
            setIsSavingPromo(false);
        }
    };

    const handleTogglePromo = async (id: string, currentStatus: boolean) => {
        await updateDoc(doc(db, 'app_promociones', id), { activo: !currentStatus });
    };

    const handleDeletePromo = async (id: string) => {
        if (!confirm('¿Eliminar esta promoción?')) return;
        await deleteDoc(doc(db, 'app_promociones', id));
    };

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
                puntosPorVisita: Math.max(1, Number(paseAlfaForm.puntosPorVisita) || 10),
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
                action: 'Modificar Privilegios VIP',
                details: `Total: ${privilegios.length} privilegios configurados (${activeTitles.length} activos en app móvil)`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'info',
            });

            toast({
                title: '¡Privilegios VIP Guardados!',
                description: `Se sincronizaron ${activeTitles.length} beneficios activos con la aplicación móvil.`,
            });
        } catch (e: any) {
            console.error('Error guardando privilegios:', e);
            toast({
                title: 'Error al guardar privilegios',
                description: e.message || 'No se pudieron guardar los cambios en la base de datos.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingPrivilegios(false);
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
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="pase_alfa">Pase Alfa</TabsTrigger>
                    <TabsTrigger value="avisos">Avisos y Comunicados</TabsTrigger>
                    <TabsTrigger value="sugerencias">Sugerencias y Promociones</TabsTrigger>
                    <TabsTrigger value="membresia">Privilegios VIP</TabsTrigger>
                </TabsList>

                {/* PASE ALFA TAB */}
                <TabsContent value="pase_alfa" className="mt-6 space-y-6">
                    <Card className="border border-border/70 shadow-sm">
                        <CardHeader className="pb-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/20 shrink-0 mt-0.5">
                                        <Award className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-lg font-bold">
                                                Control de Programa Pase Alfa
                                            </CardTitle>
                                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                                                Sincronización en Tiempo Real
                                            </Badge>
                                        </div>
                                        <CardDescription className="text-xs md:text-sm mt-0.5">
                                            Configura los sellos necesarios, recompensa y textos del Pase Alfa que ven tus clientes en su app móvil.
                                        </CardDescription>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 self-end md:self-center bg-muted/40 px-3.5 py-2 rounded-xl border border-border/60">
                                    <span className="text-xs font-semibold">
                                        {paseAlfaForm.activo ? 'Pase Alfa Activo' : 'Pase Alfa Pausado'}
                                    </span>
                                    <Switch
                                        checked={paseAlfaForm.activo}
                                        onCheckedChange={(checked) =>
                                            setPaseAlfaForm((prev) => ({ ...prev, activo: checked }))
                                        }
                                    />
                                </div>
                            </div>
                        </CardHeader>

                        {loadingPaseAlfa ? (
                            <CardContent className="py-12 flex justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            </CardContent>
                        ) : (
                            <CardContent className="space-y-6 pt-2">
                                {/* PARÁMETROS BÁSICOS */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/50 pt-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Título del Pase</Label>
                                        <Input
                                            value={paseAlfaForm.titulo}
                                            onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, titulo: e.target.value })}
                                            placeholder="Ej. Pase Alfa Club"
                                            className="font-medium"
                                        />
                                        <p className="text-[11px] text-muted-foreground">Nombre visible en la tarjeta y en la pestaña de lealtad.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Recompensa / Premio al completar los sellos</Label>
                                        <Input
                                            value={paseAlfaForm.recompensa}
                                            onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, recompensa: e.target.value })}
                                            placeholder="Ej. 10.° Corte Totalmente Gratis"
                                            className="font-medium"
                                        />
                                        <p className="text-[11px] text-muted-foreground">Premio que se desbloquea al llenar la tarjeta (ej. Corte Gratis).</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Meta de Sellos Requeridos</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                min="1"
                                                max="20"
                                                value={paseAlfaForm.sellosRequeridos}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, sellosRequeridos: Number(e.target.value) || 10 })}
                                                className="font-bold text-base"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">sellos</span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">Número de visitas o servicios requeridos para ganar la recompensa.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Puntos Alfa otorgados por visita</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                min="1"
                                                value={paseAlfaForm.puntosPorVisita}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, puntosPorVisita: Number(e.target.value) || 10 })}
                                                className="font-bold text-base"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">pts / visita</span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">Puntos de lealtad acreditados en el perfil del cliente por cada corte.</p>
                                    </div>
                                </div>

                                {/* TEXTOS DESCRIPTIVOS */}
                                <div className="space-y-4 border-t border-border/50 pt-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Subtítulo / Lema Explicativo</Label>
                                        <Textarea
                                            value={paseAlfaForm.subtitulo}
                                            onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, subtitulo: e.target.value })}
                                            placeholder="Ej. Cada visita cuenta. Presenta tu código QR en recepción y disfruta tu corte de cortesía."
                                            rows={2}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-semibold">Instrucciones de Escaneo (Modal QR)</Label>
                                            <Textarea
                                                value={paseAlfaForm.instrucciones}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, instrucciones: e.target.value })}
                                                placeholder="Ej. Presenta tu código QR en recepción al finalizar tu servicio..."
                                                rows={2}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-xs font-semibold">Términos y Condiciones del Pase</Label>
                                            <Textarea
                                                value={paseAlfaForm.terminos}
                                                onChange={(e) => setPaseAlfaForm({ ...paseAlfaForm, terminos: e.target.value })}
                                                placeholder="Ej. Válido en sucursales oficiales de Vatos Alfa Barbería..."
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* RESUMEN DE PRIVILEGIOS Y ENLACE DIRECTO */}
                                <div className="space-y-3 border-t border-border/50 pt-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <Label className="text-sm font-bold flex items-center gap-2 text-foreground">
                                                <Sparkles className="w-4 h-4 text-primary" />
                                                Privilegios y Beneficios del Miembro Alfa
                                            </Label>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Cortesías y beneficios que ven tus clientes en su app móvil.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setActiveTab('membresia')}
                                            className="text-xs h-8 border-primary/30 text-primary hover:bg-primary/5 shrink-0 gap-1.5"
                                        >
                                            <Crown className="w-3.5 h-3.5" />
                                            Gestionar Privilegios VIP ({privilegios.length})
                                        </Button>
                                    </div>

                                    <div className="space-y-2 border rounded-xl p-3 bg-muted/20">
                                        {privilegios.length === 0 ? (
                                            <div className="text-center py-6 text-muted-foreground text-xs">
                                                <Info className="w-5 h-5 mx-auto mb-1 text-muted-foreground/60" />
                                                No hay privilegios configurados aún. Ve a la pestaña <span className="font-semibold text-foreground">"Privilegios VIP"</span> para agregar cortesías con fechas de vigencia y controles de activación.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {privilegios.map((p, idx) => (
                                                    <div key={p.id || idx} className="flex items-center justify-between bg-background p-2.5 rounded-lg border shadow-sm">
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    "text-[10px] shrink-0",
                                                                    p.activo
                                                                        ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
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
                                <div className="flex justify-end pt-4 border-t border-border/50">
                                    <Button
                                        onClick={handleSavePaseAlfa}
                                        disabled={isSavingPaseAlfa}
                                        className="bg-[#202A49] hover:bg-[#182038] text-white font-bold px-6 h-11 shadow-lg flex items-center gap-2"
                                    >
                                        {isSavingPaseAlfa ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Guardando en la App...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4 mr-2" />
                                                Guardar Configuración del Pase Alfa
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                </TabsContent>
                
                {/* AVISOS TAB */}
                <TabsContent value="avisos" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Nuevo Aviso</CardTitle>
                            <CardDescription>Crea un comunicado para la pantalla de inicio de la app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Título</Label>
                                    <Input value={avisoForm.titulo} onChange={e => setAvisoForm({...avisoForm, titulo: e.target.value})} placeholder="Ej. Cerrado por festivo" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fecha de Expiración (Opcional)</Label>
                                    <Input type="datetime-local" value={avisoForm.fechaExpiracion} onChange={e => setAvisoForm({...avisoForm, fechaExpiracion: e.target.value})} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Textarea value={avisoForm.descripcion} onChange={e => setAvisoForm({...avisoForm, descripcion: e.target.value})} placeholder="Mensaje para los clientes..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Imagen del aviso (Opcional)</Label>
                                <Input type="file" accept="image/*" onChange={e => setAvisoFile(e.target.files?.[0] || null)} />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-2">
                                    <Switch checked={avisoForm.activo} onCheckedChange={c => setAvisoForm({...avisoForm, activo: c})} />
                                    <Label>Publicar inmediatamente</Label>
                                </div>
                                <Button onClick={handleCreateAviso} disabled={isSavingAviso} className="bg-[#202A49] hover:bg-[#182038] text-white">
                                    {isSavingAviso ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Crear Aviso
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Avisos Vigentes</h4>
                        {loadingAvisos ? <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /> : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {avisos?.map(aviso => (
                                    <Card key={aviso.id} className={!aviso.activo ? 'opacity-60' : ''}>
                                        {aviso.imagenUrl && (
                                            <div className="w-full h-32 overflow-hidden rounded-t-lg bg-muted">
                                                <img src={aviso.imagenUrl} alt="Banner" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <CardContent className="p-4 relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <h5 className="font-bold">{aviso.titulo}</h5>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={aviso.activo} onCheckedChange={() => handleToggleAviso(aviso.id, aviso.activo)} />
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAviso(aviso.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-4">{aviso.descripcion}</p>
                                            {aviso.fechaExpiracion && (
                                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                    Expira: {format(aviso.fechaExpiracion.toDate(), 'PPP p', { locale: es })}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* SUGERENCIAS Y PROMOCIONES TAB */}
                <TabsContent value="sugerencias" className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Nueva Promoción</CardTitle>
                            <CardDescription>Publica una oferta o descuento exclusivo en la app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Título de la promo</Label>
                                    <Input value={promoForm.titulo} onChange={e => setPromoForm({...promoForm, titulo: e.target.value})} placeholder="Ej. 20% en Cera Mate" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Código Promocional</Label>
                                    <Input value={promoForm.codigoDescuento} onChange={e => setPromoForm({...promoForm, codigoDescuento: e.target.value})} placeholder="Ej. ALFA20" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Textarea value={promoForm.descripcion} onChange={e => setPromoForm({...promoForm, descripcion: e.target.value})} placeholder="Términos o detalles del descuento..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Imagen del banner (Opcional)</Label>
                                <Input type="file" accept="image/*" onChange={e => setPromoFile(e.target.files?.[0] || null)} />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <Switch checked={promoForm.mostrarQr} onCheckedChange={c => setPromoForm({...promoForm, mostrarQr: c})} />
                                        <Label>Generar QR canjeable</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch checked={promoForm.activo} onCheckedChange={c => setPromoForm({...promoForm, activo: c})} />
                                        <Label>Activar ahora</Label>
                                    </div>
                                </div>
                                <Button onClick={handleCreatePromo} disabled={isSavingPromo} className="bg-[#202A49] hover:bg-[#182038] text-white">
                                    {isSavingPromo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Crear Promoción
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Promociones Activas</h4>
                        {loadingPromos ? <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /> : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {promociones?.map(promo => (
                                    <Card key={promo.id} className={!promo.activo ? 'opacity-60' : ''}>
                                        {promo.imagenUrl && (
                                            <div className="w-full h-32 overflow-hidden rounded-t-lg bg-muted">
                                                <img src={promo.imagenUrl} alt="Banner" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        <CardContent className="p-4 relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <h5 className="font-bold">{promo.titulo}</h5>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={promo.activo} onCheckedChange={() => handleTogglePromo(promo.id, promo.activo)} />
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeletePromo(promo.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-4">{promo.descripcion}</p>
                                            
                                            {promo.codigoDescuento && (
                                                <div className="flex items-center gap-2 bg-muted p-2 rounded-md w-fit">
                                                    <Badge variant="default" className="text-sm tracking-wider">{promo.codigoDescuento}</Badge>
                                                    {promo.mostrarQr && <Badge variant="secondary" className="text-xs">QR Activado</Badge>}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* MEMBRESIA VIP TAB (GESTOR AVANZADO DE PRIVILEGIOS) */}
                <TabsContent value="membresia" className="mt-6 space-y-6">
                    <Card className="border border-border/70 shadow-sm">
                        <CardHeader className="pb-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/20 shrink-0 mt-0.5">
                                        <Crown className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-lg font-bold">
                                                Privilegios de Membresía VIP
                                            </CardTitle>
                                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                                                Gestión Integral
                                            </Badge>
                                        </div>
                                        <CardDescription className="text-xs md:text-sm mt-0.5">
                                            Configura las cortesías y beneficios de la membresía. Activa, apaga, programa vigencias o edita privilegios para tus clientes en la app móvil.
                                        </CardDescription>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-start md:self-center">
                                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs py-1 px-2.5">
                                        {privilegios.filter(p => p.activo && !isPrivilegeExpired(p.fechaLimite)).length} Activos en App
                                    </Badge>
                                    <Badge variant="outline" className="text-muted-foreground text-xs py-1 px-2.5">
                                        {privilegios.length} Total
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            {/* FORMULARIO AGREGAR PRIVILEGIO */}
                            <div className="bg-muted/30 border border-border/70 rounded-xl p-4 md:p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-bold flex items-center gap-2 text-foreground">
                                        <Plus className="w-4 h-4 text-primary" />
                                        Agregar Nuevo Privilegio
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="new-activo-toggle" className="text-xs font-medium cursor-pointer text-muted-foreground">
                                            {newActivo ? 'Estado: Activo' : 'Estado: Pausado'}
                                        </Label>
                                        <Switch
                                            id="new-activo-toggle"
                                            checked={newActivo}
                                            onCheckedChange={setNewActivo}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Input
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder="Ej. Cortesía de cerveza en cada visita"
                                        className="bg-background text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddPrivilegio()}
                                    />
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                id="new-expiry-toggle"
                                                checked={newHasExpiry}
                                                onCheckedChange={setNewHasExpiry}
                                            />
                                            <Label htmlFor="new-expiry-toggle" className="text-xs cursor-pointer font-medium">
                                                Fecha límite de vigencia (opcional)
                                            </Label>
                                        </div>

                                        {newHasExpiry && (
                                            <div className="flex items-center gap-2 animate-in fade-in duration-200">
                                                <Input
                                                    type="date"
                                                    min={format(new Date(), 'yyyy-MM-dd')}
                                                    value={newFechaLimite}
                                                    onChange={(e) => setNewFechaLimite(e.target.value)}
                                                    className="w-auto h-8 text-xs bg-background py-1"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <Button
                                        onClick={handleAddPrivilegio}
                                        className="bg-[#202A49] hover:bg-[#182038] text-white font-semibold text-xs h-9 px-4 shrink-0 shadow-sm flex items-center gap-1.5"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Agregar Privilegio
                                    </Button>
                                </div>
                            </div>

                            {/* LISTA DE PRIVILEGIOS */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-foreground">
                                        Lista de Privilegios ({privilegios.length})
                                    </h4>
                                    <span className="text-xs text-muted-foreground">
                                        Puedes encender o apagar cualquier privilegio sin eliminarlo.
                                    </span>
                                </div>

                                {loadingMembresia ? (
                                    <div className="py-12 flex justify-center">
                                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                    </div>
                                ) : privilegios.length === 0 ? (
                                    <div className="border border-dashed border-border/80 rounded-xl p-8 text-center bg-muted/10 space-y-2">
                                        <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground/60" />
                                        <p className="text-sm font-medium text-foreground">No hay privilegios configurados</p>
                                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                            Utiliza el formulario de arriba para agregar cortesías o beneficios exclusivos de la membresía VIP.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {privilegios.map((priv) => {
                                            const expired = isPrivilegeExpired(priv.fechaLimite);

                                            return (
                                                <div
                                                    key={priv.id}
                                                    className={cn(
                                                        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border bg-background shadow-sm transition-all",
                                                        !priv.activo && "opacity-60 bg-muted/20 border-border/60",
                                                        expired && "border-red-500/30 bg-red-500/5"
                                                    )}
                                                >
                                                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                                        {/* Switch directo On/Off */}
                                                        <div className="pt-0.5">
                                                            <Switch
                                                                checked={priv.activo}
                                                                onCheckedChange={(val) => handleTogglePrivilegio(priv.id, val)}
                                                                title={priv.activo ? "Apagar privilegio" : "Encender privilegio"}
                                                            />
                                                        </div>

                                                        <div className="space-y-1.5 flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <Badge
                                                                    variant="outline"
                                                                    className={cn(
                                                                        "text-[10px] font-semibold py-0.5",
                                                                        priv.activo
                                                                            ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                                                                            : "text-muted-foreground border-border bg-muted/40"
                                                                    )}
                                                                >
                                                                    {priv.activo ? "Activo" : "Apagado"}
                                                                </Badge>

                                                                {priv.fechaLimite ? (
                                                                    expired ? (
                                                                        <Badge variant="destructive" className="text-[10px] flex items-center gap-1 py-0.5">
                                                                            <Clock className="w-3 h-3" />
                                                                            Expiró: {formatDateDisplay(priv.fechaLimite)}
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-400/30 bg-blue-500/5 flex items-center gap-1 py-0.5">
                                                                            <CalendarDays className="w-3 h-3" />
                                                                            Vence: {formatDateDisplay(priv.fechaLimite)}
                                                                        </Badge>
                                                                    )
                                                                ) : (
                                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border py-0.5">
                                                                        Permanente
                                                                    </Badge>
                                                                )}
                                                            </div>

                                                            <p className={cn(
                                                                "text-sm font-medium text-foreground leading-snug break-words",
                                                                !priv.activo && "text-muted-foreground"
                                                            )}>
                                                                {priv.titulo}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Botones de acción: Editar y Eliminar */}
                                                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleStartEdit(priv)}
                                                            className="h-8 px-2.5 text-xs gap-1 border-border/80 hover:bg-muted"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                                            Editar
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleStartDelete(priv)}
                                                            className="h-8 px-2.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-500/10 gap-1"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Eliminar
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* BOTÓN GUARDAR PRIVILEGIOS */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border/50">
                                <span className="text-xs text-muted-foreground">
                                    Los cambios se sincronizan en tiempo real con la app móvil al guardar.
                                </span>
                                <Button
                                    onClick={handleSavePrivilegios}
                                    disabled={isSavingPrivilegios}
                                    className="bg-[#202A49] hover:bg-[#182038] text-white font-bold px-6 h-11 shadow-md w-full sm:w-auto flex items-center gap-2"
                                >
                                    {isSavingPrivilegios ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Guardando privilegios...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Guardar Beneficios VIP
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* MODAL DE EDICIÓN DE PRIVILEGIO */}
            <Dialog open={editingPrivilegio !== null} onOpenChange={(open) => !open && setEditingPrivilegio(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
                            <Pencil className="w-5 h-5 text-primary" />
                            Editar Privilegio VIP
                        </DialogTitle>
                        <DialogDescription>
                            Modifica la descripción, estado de activación o vigencia de este beneficio.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-3">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold">Descripción del Privilegio</Label>
                            <Textarea
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Ej. Cortesía de cerveza en cada visita"
                                rows={3}
                                className="text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-between border rounded-xl p-3 bg-muted/20">
                            <div>
                                <Label className="text-xs font-semibold">Estado en la App</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    {editActivo ? 'Visible para clientes VIP' : 'Pausado temporalmente'}
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
                                <div className="pt-2 border-t">
                                    <Label className="text-xs text-muted-foreground mb-1 block">Fecha de vencimiento</Label>
                                    <Input
                                        type="date"
                                        min={format(new Date(), 'yyyy-MM-dd')}
                                        value={editFechaLimite}
                                        onChange={(e) => setEditFechaLimite(e.target.value)}
                                        className="bg-background text-sm"
                                    />
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
        </div>
    );
}
