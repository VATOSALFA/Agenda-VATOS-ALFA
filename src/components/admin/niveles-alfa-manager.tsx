'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Crown,
    Award,
    Sparkles,
    ShieldCheck,
    TrendingUp,
    DollarSign,
    Scissors,
    Save,
    Plus,
    Trash2,
    CheckCircle2,
    Layers,
    AlertCircle,
    Eye,
    RefreshCw,
    Star,
    Check,
    Percent,
    Pencil,
    ArrowUp,
    ArrowDown,
    X,
    FileText,
    Image as ImageIcon,
    Maximize2,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { ImageUploader } from '@/components/shared/image-uploader';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit-logger';
import { cn } from '@/lib/utils';

export type CriterioAscenso = 'visitas' | 'gasto' | 'ambos_opcional';

export interface NivelItemConfig {
    id: 'member' | 'gold' | 'vip';
    nombre: string;
    visitasMin: number;
    gastoMin: number;
    cashbackPct?: number; // % de retorno en AlfaCoins (Ej: 3 = 3% = $0.03 MXN por moneda)
    color: string;
    colorTexto?: string;
    descripcion: string;
    beneficios: string[];
}

export interface NivelesClubConfig {
    activo: boolean;
    criterio: CriterioAscenso;
    titulo_tarjeta?: string;
    descripcion_tarjeta?: string;
    imagenUrl?: string | null;
    terminos?: string;
    member: NivelItemConfig;
    gold: NivelItemConfig;
    vip: NivelItemConfig;
    actualizado_el?: any;
    actualizado_por?: string;
}

export const DEFAULT_NIVELES_IMAGE_URL =
    'https://firebasestorage.googleapis.com/v0/b/agenda-1ae08.firebasestorage.app/o/pase_alfa%2Fniveles_pase_alfa_oficial.png?alt=media&token=927a8ffc-e00d-4fd5-b5c9-a11270a423bf';

export function buildDefaultNivelesTerminos(cfg?: Partial<NivelesClubConfig>): string {
    const memberName = cfg?.member?.nombre || 'Alfa Member';
    const goldName = cfg?.gold?.nombre || 'Alfa Gold';
    const vipName = cfg?.vip?.nombre || 'Alfa Black VIP';

    const goldVisitas = cfg?.gold?.visitasMin ?? 12;
    const goldGasto = cfg?.gold?.gastoMin ?? 2400;
    const vipVisitas = cfg?.vip?.visitasMin ?? 24;
    const vipGasto = cfg?.vip?.gastoMin ?? 4800;

    const memberPct = cfg?.member?.cashbackPct ?? 3;
    const goldPct = cfg?.gold?.cashbackPct ?? 5;
    const vipPct = cfg?.vip?.cashbackPct ?? 7;

    const memberCoinVal = (memberPct / 100).toFixed(2);
    const goldCoinVal = (goldPct / 100).toFixed(2);
    const vipCoinVal = (vipPct / 100).toFixed(2);

    return `Términos y Condiciones de los Niveles y Rangos del Pase Alfa

1. Naturaleza del sistema de niveles
El sistema de Niveles y Rangos del Pase Alfa de VATOS ALFA Barber Shop reconoce y premia la constancia y preferencia de los clientes registrados en la aplicación móvil oficial mediante tres rangos progresivos: ${memberName}, ${goldName} y ${vipName}.

2. Inicio del conteo e historial previo a la App
Al descargar la aplicación móvil de VATOS ALFA Barber Shop e iniciar sesión o vincular su perfil con su correo electrónico y número telefónico registrados en la barbería, el cliente ingresa automáticamente con el rango inicial "${memberName}". El cliente podrá consultar en la aplicación su historial de reservas y compras previas registradas en la barbería; sin embargo, todas las visitas, servicios y compras realizadas antes de la fecha de su registro y vinculación en la aplicación móvil NO contabilizan para el progreso del Pase Alfa, sellos ni ascenso de nivel. El conteo de visitas y consumo acumulado para subir de nivel inicia estrictamente desde cero (0) a partir del momento en que el cliente se registra en la aplicación móvil.

3. Reglas y criterios de ascenso de nivel
El ascenso entre niveles se evalúa de manera automática conforme a las visitas completadas y/o el consumo efectivamente pagado en sucursal con posterioridad al registro del cliente en la aplicación:
- Nivel 1 — ${memberName}: Nivel inicial otorgado al registrarse y activar su cuenta en la aplicación móvil (0 visitas / $0 MXN). Otorga un ${memberPct}% de retorno en el monedero Alfa Coins (1 Alfa Coin = $${memberCoinVal} MXN al canjear).
- Nivel 2 — ${goldName}: Se desbloquea automáticamente al acumular ${goldVisitas} visitas elegibles completadas Ó $${goldGasto.toLocaleString('es-MX')} MXN en compras pagadas a partir de su registro en la app (lo que ocurra primero, o según el criterio activo en el programa). Otorga un ${goldPct}% de retorno en el monedero Alfa Coins (1 Alfa Coin = $${goldCoinVal} MXN al canjear) y privilegios preferenciales de rango Gold.
- Nivel 3 — ${vipName}: Es el máximo rango de distinción y se desbloquea al acumular ${vipVisitas} visitas elegibles completadas Ó $${vipGasto.toLocaleString('es-MX')} MXN en compras pagadas a partir de su registro en la app. Otorga un ${vipPct}% de retorno en el monedero Alfa Coins (1 Alfa Coin = $${vipCoinVal} MXN al canjear) y acceso total a los privilegios VIP.

4. Operaciones válidas para el progreso de nivel
Únicamente suman para el conteo de visitas y gasto acumulado de nivel las ventas efectivamente cobradas y liquidadas en recepción (con efectivo, tarjeta o transferencia) posteriores a la vinculación de la cuenta en la app. Los servicios gratuitos por canje de recompensas, cortesías sin costo o el importe cubierto mediante Alfa Coins no suman gasto pagado para el ascenso de nivel.

5. Cancelaciones, devoluciones o eliminación de ventas
En caso de que una venta o ticket sea cancelado, reembolsado o eliminado por cualquier motivo operativo o administrativo, el sistema descontará automáticamente la visita, el monto acumulado y los Alfa Coins que dicha transacción hubiera generado, recalculando de forma inmediata el nivel y progreso real del titular.

6. Validez en todas las sucursales
El rango alcanzado en el Pase Alfa (${memberName}, ${goldName} o ${vipName}), así como su porcentaje de retorno en Alfa Coins y sus privilegios vigentes, son reconocidos y válidos en cualquier sucursal de VATOS ALFA Barber Shop, tanto en las sucursales actuales como en las próximas aperturas.

7. Carácter personal e intransferible
El nivel, las visitas acumuladas, el historial de consumo y los beneficios asociados a cada rango son estrictamente personales e intransferibles; están vinculados a la cuenta verificada del titular y no pueden cederse, venderse ni combinarse entre distintas cuentas o clientes.

8. Actualización del programa
VATOS ALFA Barber Shop se reserva el derecho de actualizar los umbrales de ascenso, porcentajes de bonificación o privilegios de cada nivel desde su panel oficial, manteniendo siempre visibles las condiciones vigentes dentro de la aplicación móvil y en el sitio web oficial vatosalfa.com.`;
}

export const DEFAULT_NIVELES_TERMINOS = buildDefaultNivelesTerminos();

export const DEFAULT_NIVELES_CONFIG: NivelesClubConfig = {
    activo: true,
    criterio: 'ambos_opcional',
    titulo_tarjeta: 'NIVELES PASE ALFA',
    descripcion_tarjeta:
        'Sube de nivel desde que te registras en la app (Alfa Member, Alfa Gold y Alfa Black VIP) y desbloquea mayor porcentaje en Alfa Coins y privilegios exclusivos en cualquier sucursal de VATOS ALFA Barber Shop.',
    imagenUrl: DEFAULT_NIVELES_IMAGE_URL,
    terminos: DEFAULT_NIVELES_TERMINOS,
    member: {
        id: 'member',
        nombre: 'Alfa Member',
        visitasMin: 0,
        gastoMin: 0,
        cashbackPct: 3, // 3%
        color: '#2563EB', // Azul Real
        colorTexto: '#FFFFFF',
        descripcion: 'Nivel base otorgado automáticamente a todos los caballeros al registrarse en la app.',
        beneficios: [
            '1 AlfaCoin por cada $1 MXN gastado (Retorno del 3% en monedero)',
            'Tarjeta digital Pase Alfa (10.° corte de cabello gratis)',
            'Acceso a promociones y beneficios en cualquier sucursal de VATOS ALFA Barber Shop',
        ],
    },
    gold: {
        id: 'gold',
        nombre: 'Alfa Gold',
        visitasMin: 12,
        gastoMin: 2400,
        cashbackPct: 5, // 5%
        color: '#C5A880', // Dorado Alfa
        colorTexto: '#0F172A',
        descripcion: 'Nivel intermedio para clientes frecuentes con acceso a ventajas preferenciales.',
        beneficios: [
            '1 AlfaCoin por cada $1 MXN gastado con valor preferencial (Retorno del 5% en monedero)',
            'Toalla caliente y vapor de ozono en cada corte regular',
            '10% de descuento en ceras, pomadas y aceites para barba',
            'Arreglo de barba express o delineado a navaja gratis en tu cumpleaños',
            'Atención prioritaria en recepción y bebida de cortesía especial',
        ],
    },
    vip: {
        id: 'vip',
        nombre: 'Alfa Black VIP',
        visitasMin: 24,
        gastoMin: 4800,
        cashbackPct: 7, // 7%
        color: '#0F172A', // Negro Azabache Premium
        colorTexto: '#F8FAFC',
        descripcion: 'Estatus cumbre de distinción y exclusividad para los caballeros más leales.',
        beneficios: [
            '1 AlfaCoin por cada $1 MXN gastado con valor VIP exclusivo (Retorno del 7% en monedero)',
            'Mascarilla de carbón activado (Black Mask) express incluida en tu cita',
            '1 Arreglo de barba express o delineado de contornos a navaja de cortesía al mes',
            '15% de descuento en todos los productos para cuidado y peinado',
            'Cita garantizada con tu barbero favorito y sin lista de espera',
            'Upgrade de cortesía a Paquete Caballero Alfa en tu cumpleaños',
        ],
    },
};

const COLOR_PRESETS = [
    { label: 'Azul Alfa', hex: '#2563EB' },
    { label: 'Dorado Luxury', hex: '#C5A880' },
    { label: 'Negro Azabache', hex: '#0F172A' },
    { label: 'Titanio Grafito', hex: '#334155' },
    { label: 'Esmeralda', hex: '#059669' },
    { label: 'Rubí', hex: '#DC2626' },
    { label: 'Púrpura Real', hex: '#7C3AED' },
];

export function NivelesAlfaManager() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<NivelesClubConfig>(DEFAULT_NIVELES_CONFIG);
    const [selectedTab, setSelectedTab] = useState<'member' | 'gold' | 'vip'>('gold');

    // Inputs para agregar nuevos beneficios por nivel
    const [newBenefitInput, setNewBenefitInput] = useState<string>('');

    // Estado para editar un privilegio existente en línea
    const [editingBenefit, setEditingBenefit] = useState<{
        tierId: 'member' | 'gold' | 'vip';
        index: number;
        text: string;
    } | null>(null);

    // Simulador interactivo en vivo
    const [simVisitas, setSimVisitas] = useState<number>(5);
    const [simGasto, setSimGasto] = useState<number>(1800);
    const [expandedTerminosOpen, setExpandedTerminosOpen] = useState<boolean>(false);

    // Cargar configuración desde Firestore
    useEffect(() => {
        let isMounted = true;
        async function fetchConfig() {
            setLoading(true);
            try {
                const [paseSnap, appMovilSnap] = await Promise.all([
                    getDoc(doc(db, 'configuracion', 'pase_alfa')),
                    getDoc(doc(db, 'configuracion', 'app_movil')),
                ]);

                const paseData = paseSnap.exists() ? paseSnap.data() : null;
                const appData = appMovilSnap.exists() ? appMovilSnap.data() : null;

                const rawNiveles =
                    paseData?.niveles_config ||
                    appData?.niveles_config ||
                    appData?.pase_alfa?.niveles_config;

                if (rawNiveles && isMounted) {
                    const mergedCfg: NivelesClubConfig = {
                        activo: rawNiveles.activo !== undefined ? Boolean(rawNiveles.activo) : true,
                        criterio: rawNiveles.criterio || 'ambos_opcional',
                        titulo_tarjeta: rawNiveles.titulo_tarjeta || DEFAULT_NIVELES_CONFIG.titulo_tarjeta,
                        descripcion_tarjeta: rawNiveles.descripcion_tarjeta || DEFAULT_NIVELES_CONFIG.descripcion_tarjeta,
                        imagenUrl: rawNiveles.imagenUrl || DEFAULT_NIVELES_IMAGE_URL,
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
                    };
                    setConfig(mergedCfg);
                }
            } catch (err) {
                console.warn('Error cargando configuración de niveles:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchConfig();
        return () => {
            isMounted = false;
        };
    }, []);

    // Guardar cambios en Firestore
    const saveConfiguration = async (cfgToSave: NivelesClubConfig, isToggleOnly = false) => {
        setSaving(true);
        try {
            const payload: NivelesClubConfig = {
                activo: Boolean(cfgToSave.activo),
                criterio: cfgToSave.criterio,
                titulo_tarjeta: (cfgToSave.titulo_tarjeta || 'NIVELES PASE ALFA').trim(),
                descripcion_tarjeta: (
                    cfgToSave.descripcion_tarjeta ||
                    DEFAULT_NIVELES_CONFIG.descripcion_tarjeta ||
                    ''
                ).trim(),
                imagenUrl: cfgToSave.imagenUrl || DEFAULT_NIVELES_IMAGE_URL,
                terminos: (cfgToSave.terminos || buildDefaultNivelesTerminos(cfgToSave)).trim(),
                member: {
                    id: 'member',
                    nombre: cfgToSave.member.nombre.trim() || 'Alfa Member',
                    visitasMin: Math.max(0, Number(cfgToSave.member.visitasMin) || 0),
                    gastoMin: Math.max(0, Number(cfgToSave.member.gastoMin) || 0),
                    cashbackPct: Math.max(1, Number(cfgToSave.member.cashbackPct) || 3),
                    color: cfgToSave.member.color || '#2563EB',
                    colorTexto: cfgToSave.member.colorTexto || '#FFFFFF',
                    descripcion: cfgToSave.member.descripcion.trim(),
                    beneficios: (cfgToSave.member.beneficios || []).map((b) => b.trim()).filter(Boolean),
                },
                gold: {
                    id: 'gold',
                    nombre: cfgToSave.gold.nombre.trim() || 'Alfa Gold',
                    visitasMin: Math.max(1, Number(cfgToSave.gold.visitasMin) || 12),
                    gastoMin: Math.max(0, Number(cfgToSave.gold.gastoMin) || 2400),
                    cashbackPct: Math.max(1, Number(cfgToSave.gold.cashbackPct) || 5),
                    color: cfgToSave.gold.color || '#C5A880',
                    colorTexto: cfgToSave.gold.colorTexto || '#0F172A',
                    descripcion: cfgToSave.gold.descripcion.trim(),
                    beneficios: (cfgToSave.gold.beneficios || []).map((b) => b.trim()).filter(Boolean),
                },
                vip: {
                    id: 'vip',
                    nombre: cfgToSave.vip.nombre.trim() || 'Alfa Black VIP',
                    visitasMin: Math.max(2, Number(cfgToSave.vip.visitasMin) || 24),
                    gastoMin: Math.max(0, Number(cfgToSave.vip.gastoMin) || 4800),
                    cashbackPct: Math.max(1, Number(cfgToSave.vip.cashbackPct) || 7),
                    color: cfgToSave.vip.color || '#0F172A',
                    colorTexto: cfgToSave.vip.colorTexto || '#F8FAFC',
                    descripcion: cfgToSave.vip.descripcion.trim(),
                    beneficios: (cfgToSave.vip.beneficios || []).map((b) => b.trim()).filter(Boolean),
                },
                actualizado_el: Timestamp.now(),
                actualizado_por: user?.email || 'admin',
            };

            // Retrocompatibilidad con esquemas simples de niveles
            const simpleNivelesPayload = {
                member: {
                    nombre: payload.member.nombre,
                    min: payload.member.visitasMin,
                    max: payload.gold.visitasMin - 1,
                },
                gold: {
                    nombre: payload.gold.nombre,
                    min: payload.gold.visitasMin,
                    max: payload.vip.visitasMin - 1,
                },
                vip: {
                    nombre: payload.vip.nombre,
                    min: payload.vip.visitasMin,
                    max: 9999,
                },
            };

            // Sincronizar también la tarjeta "NIVELES PASE ALFA" dentro de beneficios_detallados y privilegios
            const nivelesBenefitCard = {
                id: 'niveles_pase_alfa',
                titulo: payload.titulo_tarjeta || 'NIVELES PASE ALFA',
                descripcion:
                    payload.descripcion_tarjeta ||
                    'Sube de nivel desde que te registras en la app (Alfa Member, Alfa Gold y Alfa Black VIP) y desbloquea mayor porcentaje en Alfa Coins y privilegios exclusivos en cualquier sucursal de VATOS ALFA Barber Shop.',
                imagenUrl: payload.imagenUrl || DEFAULT_NIVELES_IMAGE_URL,
                activo: payload.activo,
                terminos: payload.terminos || buildDefaultNivelesTerminos(payload),
                vigenciaInicio: null,
                vigenciaFin: null,
            };

            const [paseSnap, appMovilSnap, vipSnap] = await Promise.all([
                getDoc(doc(db, 'configuracion', 'pase_alfa')),
                getDoc(doc(db, 'configuracion', 'app_movil')),
                getDoc(doc(db, 'ajustes_sitio', 'membresia_vip')),
            ]);

            const upsertNivelesBenefit = (list: any[]) => {
                const arr = Array.isArray(list) ? [...list] : [];
                const idx = arr.findIndex(
                    (b) =>
                        b?.id === 'niveles_pase_alfa' ||
                        String(b?.titulo || '').toUpperCase().includes('NIVELES PASE ALFA') ||
                        String(b?.titulo || '').toUpperCase().includes('NIVELES DEL PASE ALFA')
                );
                if (idx >= 0) {
                    arr[idx] = { ...arr[idx], ...nivelesBenefitCard, id: 'niveles_pase_alfa' };
                } else {
                    arr.push(nivelesBenefitCard);
                }
                return arr;
            };

            const paseData = paseSnap.exists() ? paseSnap.data() : {};
            const updatedPaseBeneficios = upsertNivelesBenefit(paseData?.beneficios_detallados || []);

            const appMovilData = appMovilSnap.exists() ? appMovilSnap.data() : {};
            const updatedAppBeneficios = upsertNivelesBenefit(
                appMovilData?.pase_alfa?.beneficios_detallados || updatedPaseBeneficios
            );

            // 1. Guardar en configuracion/pase_alfa
            await setDoc(
                doc(db, 'configuracion', 'pase_alfa'),
                {
                    niveles_config: payload,
                    niveles: simpleNivelesPayload,
                    beneficios_detallados: updatedPaseBeneficios,
                    actualizado_el: Timestamp.now(),
                },
                { merge: true }
            );

            // 2. Guardar en configuracion/app_movil en espejo (raíz y subobjeto pase_alfa)
            await setDoc(
                doc(db, 'configuracion', 'app_movil'),
                {
                    niveles_config: payload,
                    pase_alfa: {
                        ...(appMovilData?.pase_alfa || {}),
                        niveles_config: payload,
                        niveles: simpleNivelesPayload,
                        beneficios_detallados: updatedAppBeneficios,
                    },
                    'pase_alfa.niveles_config': payload,
                    actualizado_el: Timestamp.now(),
                },
                { merge: true }
            );

            // 3. Sincronizar en ajustes_sitio/membresia_vip para la página web y tarjetas de beneficios
            if (vipSnap.exists()) {
                const vipData = vipSnap.exists() ? vipSnap.data() : {};
                const updatedVipBeneficios = upsertNivelesBenefit(vipData?.beneficios_detallados || []);
                const privList = Array.isArray(vipData?.privilegios) ? [...vipData.privilegios] : [];
                const privIdx = privList.findIndex(
                    (p: any) =>
                        p?.id === 'niveles_pase_alfa' ||
                        String(p?.titulo || '').toUpperCase().includes('NIVELES PASE ALFA')
                );
                const privItem = {
                    id: 'niveles_pase_alfa',
                    icono: 'Crown',
                    titulo: nivelesBenefitCard.titulo,
                    descripcion: nivelesBenefitCard.descripcion,
                    imagenUrl: nivelesBenefitCard.imagenUrl,
                    activo: nivelesBenefitCard.activo,
                    terminos: nivelesBenefitCard.terminos,
                    vigenciaInicio: null,
                    vigenciaFin: null,
                };
                if (privIdx >= 0) {
                    privList[privIdx] = { ...privList[privIdx], ...privItem };
                } else {
                    privList.push(privItem);
                }
                await setDoc(
                    doc(db, 'ajustes_sitio', 'membresia_vip'),
                    {
                        beneficios_detallados: updatedVipBeneficios,
                        privilegios: privList,
                        updatedAt: Timestamp.now(),
                    },
                    { merge: true }
                );
            }

            // 4. Registrar en bitácora de auditoría
            await logAuditAction({
                action: 'ACTUALIZAR_NIVELES_PASE_ALFA',
                userId: user?.uid || (user as any)?.id || 'admin',
                userName: user?.displayName || user?.email || 'Administrador',
                details: `Configuración de niveles Pase Alfa actualizada (${payload.activo ? 'ACTIVO' : 'PAUSADO'}). Criterio: ${payload.criterio}. Member: ${payload.member.visitasMin}v/$${payload.member.gastoMin} (${payload.member.cashbackPct}%), Gold: ${payload.gold.visitasMin}v/$${payload.gold.gastoMin} (${payload.gold.cashbackPct}%), VIP: ${payload.vip.visitasMin}v/$${payload.vip.gastoMin} (${payload.vip.cashbackPct}%)`,
                severity: 'info',
            });

            toast({
                title: isToggleOnly
                    ? payload.activo
                        ? '¡Niveles y Rangos Activados!'
                        : 'Niveles y Rangos en Pausa'
                    : '¡Niveles Actualizados con Éxito!',
                description: isToggleOnly
                    ? payload.activo
                        ? 'El sistema de ascenso automático y beneficios por nivel ya está activo en la App y en la Agenda.'
                        : 'El programa de niveles se ha pausado temporalmente en la App y en la Agenda.'
                    : 'Los nuevos requisitos, porcentajes de cashback y privilegios ya están sincronizados en tiempo real con la app móvil y recepción.',
                variant: 'default',
            });
        } catch (err: any) {
            console.error('Error al guardar niveles:', err);
            toast({
                title: 'Error al Guardar',
                description: err?.message || 'No se pudieron guardar los cambios en la base de datos.',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        await saveConfiguration(config, false);
    };

    // Funciones de gestión de beneficios por nivel
    const handleAddBenefit = (tierId: 'member' | 'gold' | 'vip') => {
        if (!newBenefitInput.trim()) return;
        setConfig((prev) => ({
            ...prev,
            [tierId]: {
                ...prev[tierId],
                beneficios: [...prev[tierId].beneficios, newBenefitInput.trim()],
            },
        }));
        setNewBenefitInput('');
    };

    const handleRemoveBenefit = (tierId: 'member' | 'gold' | 'vip', index: number) => {
        setConfig((prev) => ({
            ...prev,
            [tierId]: {
                ...prev[tierId],
                beneficios: prev[tierId].beneficios.filter((_, idx) => idx !== index),
            },
        }));
        if (editingBenefit && editingBenefit.tierId === tierId && editingBenefit.index === index) {
            setEditingBenefit(null);
        }
    };

    const handleStartEditBenefit = (tierId: 'member' | 'gold' | 'vip', index: number, currentText: string) => {
        setEditingBenefit({ tierId, index, text: currentText });
    };

    const handleSaveEditBenefit = () => {
        if (!editingBenefit || !editingBenefit.text.trim()) return;
        const { tierId, index, text } = editingBenefit;
        setConfig((prev) => {
            const list = [...prev[tierId].beneficios];
            list[index] = text.trim();
            return {
                ...prev,
                [tierId]: {
                    ...prev[tierId],
                    beneficios: list,
                },
            };
        });
        setEditingBenefit(null);
    };

    const handleMoveBenefitUp = (tierId: 'member' | 'gold' | 'vip', index: number) => {
        if (index <= 0) return;
        setConfig((prev) => {
            const list = [...prev[tierId].beneficios];
            const temp = list[index - 1];
            list[index - 1] = list[index];
            list[index] = temp;
            return {
                ...prev,
                [tierId]: {
                    ...prev[tierId],
                    beneficios: list,
                },
            };
        });
        if (editingBenefit && editingBenefit.tierId === tierId) {
            if (editingBenefit.index === index) {
                setEditingBenefit({ ...editingBenefit, index: index - 1 });
            } else if (editingBenefit.index === index - 1) {
                setEditingBenefit({ ...editingBenefit, index });
            }
        }
    };

    const handleMoveBenefitDown = (tierId: 'member' | 'gold' | 'vip', index: number) => {
        setConfig((prev) => {
            const list = [...prev[tierId].beneficios];
            if (index >= list.length - 1) return prev;
            const temp = list[index + 1];
            list[index + 1] = list[index];
            list[index] = temp;
            return {
                ...prev,
                [tierId]: {
                    ...prev[tierId],
                    beneficios: list,
                },
            };
        });
        if (editingBenefit && editingBenefit.tierId === tierId) {
            if (editingBenefit.index === index) {
                setEditingBenefit({ ...editingBenefit, index: index + 1 });
            } else if (editingBenefit.index === index + 1) {
                setEditingBenefit({ ...editingBenefit, index });
            }
        }
    };

    // Cálculo dinámico para el simulador
    const simulatedTier = useMemo(() => {
        const { criterio, member, gold, vip } = config;
        const v = Number(simVisitas) || 0;
        const g = Number(simGasto) || 0;

        let meetsVip = false;
        let meetsGold = false;

        if (criterio === 'visitas') {
            meetsVip = v >= vip.visitasMin;
            meetsGold = v >= gold.visitasMin;
        } else if (criterio === 'gasto') {
            meetsVip = g >= vip.gastoMin;
            meetsGold = g >= gold.gastoMin;
        } else {
            // ambos_opcional: lo que cumpla primero
            meetsVip = v >= vip.visitasMin || g >= vip.gastoMin;
            meetsGold = v >= gold.visitasMin || g >= gold.gastoMin;
        }

        if (meetsVip) {
            return {
                tier: vip,
                nextTier: null,
                faltanVisitas: 0,
                faltaGasto: 0,
                mensaje: '¡Nivel Máximo Alcanzado! Estatus VIP exclusivo en el club.',
            };
        }

        if (meetsGold) {
            const faltanV = Math.max(0, vip.visitasMin - v);
            const faltaG = Math.max(0, vip.gastoMin - g);
            let msg = '';
            if (criterio === 'visitas') msg = `Faltan ${faltanV} visitas para ${vip.nombre}`;
            else if (criterio === 'gasto') msg = `Faltan $${faltaG.toLocaleString('es-MX')} MXN para ${vip.nombre}`;
            else msg = `Faltan ${faltanV} visitas o $${faltaG.toLocaleString('es-MX')} MXN para ${vip.nombre}`;

            return {
                tier: gold,
                nextTier: vip,
                faltanVisitas: faltanV,
                faltaGasto: faltaG,
                mensaje: msg,
            };
        }

        const faltanV = Math.max(0, gold.visitasMin - v);
        const faltaG = Math.max(0, gold.gastoMin - g);
        let msg = '';
        if (criterio === 'visitas') msg = `Faltan ${faltanV} visitas para ${gold.nombre}`;
        else if (criterio === 'gasto') msg = `Faltan $${faltaG.toLocaleString('es-MX')} MXN para ${gold.nombre}`;
        else msg = `Faltan ${faltanV} visitas o $${faltaG.toLocaleString('es-MX')} MXN para ${gold.nombre}`;

        return {
            tier: member,
            nextTier: gold,
            faltanVisitas: faltanV,
            faltaGasto: faltaG,
            mensaje: msg,
        };
    }, [config, simVisitas, simGasto]);

    if (loading) {
        return (
            <Card className="border-border/60 shadow-xs">
                <CardContent className="flex items-center justify-center p-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-[#C5A880] mr-2" />
                    <span className="text-sm text-muted-foreground">Cargando configuración de niveles...</span>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* 1. Header con Guardar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 sm:p-5 rounded-2xl border border-border/60 shadow-xs">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Crown className="h-5 w-5 text-[#C5A880]" />
                        <h3 className="text-lg font-bold text-foreground tracking-tight">
                            Niveles y Rangos de Clientes (Pase Alfa)
                        </h3>
                        <Badge
                            variant={config.activo ? 'default' : 'secondary'}
                            className={cn(
                                'text-[11px] px-2 py-0.5',
                                config.activo
                                    ? 'bg-[#C5A880] text-black font-bold'
                                    : 'bg-muted text-muted-foreground'
                            )}
                        >
                            {config.activo ? 'Programa Activo' : 'Pausado'}
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-2xl">
                        Define las reglas bajo las cuales los caballeros escalan de nivel (por visitas completadas, dinero gastado, o ambos), los beneficios exclusivos y el diseño de sus insignias en la app móvil.
                    </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2 mr-2">
                        <Switch
                            checked={config.activo}
                            disabled={saving}
                            onCheckedChange={(checked) => {
                                const updated = { ...config, activo: checked };
                                setConfig(updated);
                                saveConfiguration(updated, true);
                            }}
                            id="switch-niveles-activo"
                        />
                        <Label htmlFor="switch-niveles-activo" className="text-xs font-semibold cursor-pointer">
                            {config.activo ? 'Activado' : 'Pausado'}
                        </Label>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-[#C5A880] hover:bg-[#b09268] text-black font-bold text-xs shadow-md flex items-center gap-1.5 h-9 px-4 rounded-xl"
                    >
                        {saving ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                                <span>Guardando...</span>
                            </>
                        ) : (
                            <>
                                <Save className="h-3.5 w-3.5 mr-1" />
                                <span>Guardar Niveles</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* 2. Criterio de Ascenso */}
            <Card className="border-border/60 shadow-xs">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-[#C5A880]" />
                        <CardTitle className="text-sm font-bold">Criterio de Ascenso de Nivel</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                        Selecciona el método que evaluará el sistema en la app móvil y en la agenda para promover a los clientes.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Opción 1: Ambos Opcional (Recomendado) */}
                        <div
                            onClick={() => setConfig((prev) => ({ ...prev, criterio: 'ambos_opcional' }))}
                            className={cn(
                                'cursor-pointer p-4 rounded-xl border transition-all relative flex flex-col justify-between',
                                config.criterio === 'ambos_opcional'
                                    ? 'border-[#C5A880] bg-[#C5A880]/10 shadow-sm ring-1 ring-[#C5A880]'
                                    : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40'
                            )}
                        >
                            {config.criterio === 'ambos_opcional' && (
                                <span className="absolute top-2.5 right-2.5 text-[#C5A880]">
                                    <CheckCircle2 className="h-4 w-4 fill-[#C5A880] text-black" />
                                </span>
                            )}
                            <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <Sparkles className="h-4 w-4 text-[#C5A880]" />
                                    <span className="text-xs font-bold text-foreground">Visitas O Gasto Total</span>
                                    <Badge className="bg-[#C5A880] text-black text-[9px] px-1 py-0 h-3.5 font-bold">
                                        Recomendado
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    El cliente sube al cumplir <strong>cualquiera de los dos umbrales</strong> (visitas mínimas O dinero gastado acumulado). Es el más justo y motivador.
                                </p>
                            </div>
                            <div className="mt-3 text-[10px] font-semibold text-[#C5A880]">
                                Ejemplo: 4 visitas Ó $1,500 MXN gastados
                            </div>
                        </div>

                        {/* Opción 2: Solo Visitas */}
                        <div
                            onClick={() => setConfig((prev) => ({ ...prev, criterio: 'visitas' }))}
                            className={cn(
                                'cursor-pointer p-4 rounded-xl border transition-all relative flex flex-col justify-between',
                                config.criterio === 'visitas'
                                    ? 'border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500'
                                    : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40'
                            )}
                        >
                            {config.criterio === 'visitas' && (
                                <span className="absolute top-2.5 right-2.5 text-blue-500">
                                    <CheckCircle2 className="h-4 w-4 fill-blue-500 text-white" />
                                </span>
                            )}
                            <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <Scissors className="h-4 w-4 text-blue-500" />
                                    <span className="text-xs font-bold text-foreground">Solo por Visitas / Sellos</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    El cliente sube únicamente al acumular el número especificado de servicios completados en la barbería.
                                </p>
                            </div>
                            <div className="mt-3 text-[10px] font-semibold text-blue-400">
                                Premia la frecuencia y constancia de visitas
                            </div>
                        </div>

                        {/* Opción 3: Solo Gasto */}
                        <div
                            onClick={() => setConfig((prev) => ({ ...prev, criterio: 'gasto' }))}
                            className={cn(
                                'cursor-pointer p-4 rounded-xl border transition-all relative flex flex-col justify-between',
                                config.criterio === 'gasto'
                                    ? 'border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500'
                                    : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40'
                            )}
                        >
                            {config.criterio === 'gasto' && (
                                <span className="absolute top-2.5 right-2.5 text-emerald-500">
                                    <CheckCircle2 className="h-4 w-4 fill-emerald-500 text-white" />
                                </span>
                            )}
                            <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <DollarSign className="h-4 w-4 text-emerald-500" />
                                    <span className="text-xs font-bold text-foreground">Solo por Dinero Gastado ($ MXN)</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    El cliente sube únicamente por el total facturado en cortes, barba, tratamientos y productos de cuidado personal.
                                </p>
                            </div>
                            <div className="mt-3 text-[10px] font-semibold text-emerald-400">
                                Premia el ticket promedio y volumen de compra
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 3. Pestañas de Edición por Rango / Nivel */}
            <Card className="border-border/60 shadow-xs">
                <CardHeader className="pb-3 border-b border-border/40">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-[#C5A880]" />
                            <CardTitle className="text-sm font-bold">Configuración de Rangos & Privilegios</CardTitle>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    <Tabs value={selectedTab} onValueChange={(val: any) => setSelectedTab(val)}>
                        <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/40 rounded-xl mb-4">
                            <TabsTrigger
                                value="member"
                                className="flex items-center justify-center gap-1.5 text-xs py-2 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white font-bold"
                            >
                                <Award className="h-3.5 w-3.5" />
                                <span>{config.member.nombre || 'Alfa Member'}</span>
                                <span className="text-[10px] opacity-75 font-normal">
                                    ({config.member.visitasMin}v / ${config.member.gastoMin})
                                </span>
                            </TabsTrigger>

                            <TabsTrigger
                                value="gold"
                                className="flex items-center justify-center gap-1.5 text-xs py-2 data-[state=active]:bg-[#C5A880] data-[state=active]:text-black font-bold"
                            >
                                <Star className="h-3.5 w-3.5" />
                                <span>{config.gold.nombre || 'Alfa Gold'}</span>
                                <span className="text-[10px] opacity-75 font-normal">
                                    ({config.gold.visitasMin}v / ${config.gold.gastoMin})
                                </span>
                            </TabsTrigger>

                            <TabsTrigger
                                value="vip"
                                className="flex items-center justify-center gap-1.5 text-xs py-2 data-[state=active]:bg-[#0F172A] data-[state=active]:text-white border border-slate-700 font-bold"
                            >
                                <Crown className="h-3.5 w-3.5 text-[#C5A880]" />
                                <span>{config.vip.nombre || 'Alfa Black VIP'}</span>
                                <span className="text-[10px] opacity-75 font-normal">
                                    ({config.vip.visitasMin}v / ${config.vip.gastoMin})
                                </span>
                            </TabsTrigger>
                        </TabsList>

                        {/* Contenido para cada nivel */}
                        {(['member', 'gold', 'vip'] as const).map((tierKey) => {
                            const tier = config[tierKey];
                            return (
                                <TabsContent key={tierKey} value={tierKey} className="space-y-4 m-0">
                                    {/* Insignia Preview & Datos Generales */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Columna Izquierda: Datos Principales */}
                                        <div className="md:col-span-2 space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-semibold">Nombre del Nivel</Label>
                                                    <Input
                                                        value={tier.nombre}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                [tierKey]: { ...prev[tierKey], nombre: e.target.value },
                                                            }))
                                                        }
                                                        className="h-9 text-xs font-bold"
                                                        placeholder="Ej. Alfa Gold"
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <Label className="text-xs font-semibold flex items-center gap-1">
                                                        <Scissors className="h-3 w-3 text-muted-foreground" />
                                                        Visitas Mínimas
                                                    </Label>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={tier.visitasMin}
                                                        disabled={tierKey === 'member'}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                [tierKey]: {
                                                                    ...prev[tierKey],
                                                                    visitasMin: Math.max(0, parseInt(e.target.value) || 0),
                                                                },
                                                            }))
                                                        }
                                                        className="h-9 text-xs"
                                                    />
                                                    {tierKey === 'member' && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            Nivel inicial (0 visitas)
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1">
                                                    <Label className="text-xs font-semibold flex items-center gap-1">
                                                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                                                        Gasto Mínimo ($ MXN)
                                                    </Label>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        step={100}
                                                        value={tier.gastoMin}
                                                        disabled={tierKey === 'member'}
                                                        onChange={(e) =>
                                                            setConfig((prev) => ({
                                                                ...prev,
                                                                [tierKey]: {
                                                                    ...prev[tierKey],
                                                                    gastoMin: Math.max(0, parseInt(e.target.value) || 0),
                                                                },
                                                            }))
                                                        }
                                                        className="h-9 text-xs"
                                                    />
                                                    {tierKey === 'member' && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            Nivel inicial ($0 gasto)
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1">
                                                    <Label className="text-xs font-semibold flex items-center gap-1 text-[#C5A880]">
                                                        <Percent className="h-3 w-3 text-[#C5A880]" />
                                                        % Cashback AlfaCoins
                                                    </Label>
                                                    <div className="relative flex items-center">
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            max={50}
                                                            step={0.5}
                                                            value={tier.cashbackPct ?? (tierKey === 'member' ? 3 : tierKey === 'gold' ? 5 : 7)}
                                                            onChange={(e) =>
                                                                setConfig((prev) => ({
                                                                    ...prev,
                                                                    [tierKey]: {
                                                                        ...prev[tierKey],
                                                                        cashbackPct: Math.max(0, parseFloat(e.target.value) || 0),
                                                                    },
                                                                }))
                                                            }
                                                            className="h-9 text-xs pr-7 font-bold text-right"
                                                        />
                                                        <span className="absolute right-2.5 text-xs text-muted-foreground font-bold pointer-events-none">%</span>
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground block truncate">
                                                        1 coin = ${((tier.cashbackPct ?? (tierKey === 'member' ? 3 : tierKey === 'gold' ? 5 : 7)) / 100).toFixed(2)} MXN
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Descripción */}
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Descripción del Estatus</Label>
                                                <Textarea
                                                    rows={2}
                                                    value={tier.descripcion}
                                                    onChange={(e) =>
                                                        setConfig((prev) => ({
                                                            ...prev,
                                                            [tierKey]: { ...prev[tierKey], descripcion: e.target.value },
                                                        }))
                                                    }
                                                    placeholder="Breve explicación de este rango para el cliente..."
                                                    className="text-xs resize-none"
                                                />
                                            </div>

                                            {/* Selector de Color de Insignia */}
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-semibold">Color de la Insignia en la App</Label>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {COLOR_PRESETS.map((p) => (
                                                        <button
                                                            key={p.hex}
                                                            type="button"
                                                            onClick={() =>
                                                                setConfig((prev) => ({
                                                                    ...prev,
                                                                    [tierKey]: {
                                                                        ...prev[tierKey],
                                                                        color: p.hex,
                                                                        colorTexto: p.hex === '#C5A880' ? '#0F172A' : '#FFFFFF',
                                                                    },
                                                                }))
                                                            }
                                                            className={cn(
                                                                'h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-all',
                                                                tier.color === p.hex
                                                                    ? 'ring-2 ring-primary border-primary shadow-sm scale-105'
                                                                    : 'border-border/60 opacity-80 hover:opacity-100'
                                                            )}
                                                            style={{ backgroundColor: p.hex, color: p.hex === '#C5A880' ? '#000' : '#FFF' }}
                                                        >
                                                            {tier.color === p.hex && <Check className="h-3 w-3" />}
                                                            <span>{p.label}</span>
                                                        </button>
                                                    ))}
                                                    <div className="flex items-center gap-1 ml-auto">
                                                        <span className="text-[11px] text-muted-foreground">Hex:</span>
                                                        <Input
                                                            value={tier.color}
                                                            onChange={(e) =>
                                                                setConfig((prev) => ({
                                                                    ...prev,
                                                                    [tierKey]: { ...prev[tierKey], color: e.target.value },
                                                                }))
                                                            }
                                                            className="h-7 w-24 text-[11px] font-mono px-2"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Columna Derecha: Vista Previa de la Insignia */}
                                        <div className="rounded-xl border border-border/60 bg-gradient-to-b from-[#10172b] to-[#1c2847] p-4 text-white flex flex-col justify-between shadow-sm relative overflow-hidden">
                                            <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />

                                            <div>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                                                    Vista Previa en App Móvil
                                                </span>

                                                <div className="flex items-center gap-2 mb-2">
                                                    <div
                                                        className="px-2.5 py-1 rounded-full text-xs font-black shadow-md flex items-center gap-1.5"
                                                        style={{
                                                            backgroundColor: tier.color,
                                                            color: tier.colorTexto || (tier.color === '#C5A880' ? '#0F172A' : '#FFFFFF'),
                                                        }}
                                                    >
                                                        {tierKey === 'vip' ? (
                                                            <Crown className="h-3.5 w-3.5 text-[#C5A880]" />
                                                        ) : tierKey === 'gold' ? (
                                                            <Star className="h-3.5 w-3.5" />
                                                        ) : (
                                                            <Award className="h-3.5 w-3.5" />
                                                        )}
                                                        <span>{tier.nombre}</span>
                                                    </div>
                                                </div>

                                                <p className="text-xs text-slate-300 italic mb-3 leading-relaxed">
                                                    "{tier.descripcion || 'Sin descripción'}"
                                                </p>
                                            </div>

                                            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-300 space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400">Requisito Visitas:</span>
                                                    <span className="font-bold text-[#C5A880]">{tier.visitasMin} visitas</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400">Requisito Gasto:</span>
                                                    <span className="font-bold text-white font-sans">
                                                        ${tier.gastoMin.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Lista de Beneficios Exclusivos de este Nivel */}
                                    <div className="space-y-2.5 pt-2 border-t border-border/40">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                <Sparkles className="h-3.5 w-3.5 text-[#C5A880]" />
                                                Privilegios Desbloqueados en {tier.nombre} ({tier.beneficios.length})
                                            </Label>
                                            <span className="text-[11px] text-muted-foreground">
                                                Se muestran en el modal interactivo de la app móvil
                                            </span>
                                        </div>

                                        <div className="flex gap-2">
                                            <Input
                                                value={newBenefitInput}
                                                onChange={(e) => setNewBenefitInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddBenefit(tierKey);
                                                    }
                                                }}
                                                placeholder={`Agregar nuevo privilegio para ${tier.nombre}...`}
                                                className="h-9 text-xs"
                                            />
                                            <Button
                                                type="button"
                                                onClick={() => handleAddBenefit(tierKey)}
                                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 px-3 shrink-0"
                                            >
                                                <Plus className="h-3.5 w-3.5 mr-1" />
                                                Agregar
                                            </Button>
                                        </div>

                                        {tier.beneficios.length === 0 ? (
                                            <div className="text-center py-4 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/60">
                                                No hay beneficios agregados para este nivel aún. Escribe uno arriba y haz clic en Agregar.
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                                {tier.beneficios.map((beneficio, bIdx) => {
                                                    const isEditing = editingBenefit?.tierId === tierKey && editingBenefit?.index === bIdx;

                                                    if (isEditing) {
                                                        return (
                                                            <div
                                                                key={bIdx}
                                                                className="flex items-center gap-2 p-1.5 px-2.5 rounded-lg bg-card border-2 border-[#C5A880] text-xs shadow-xs"
                                                            >
                                                                <Input
                                                                    value={editingBenefit.text}
                                                                    onChange={(e) => setEditingBenefit({ ...editingBenefit, text: e.target.value })}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            handleSaveEditBenefit();
                                                                        } else if (e.key === 'Escape') {
                                                                            setEditingBenefit(null);
                                                                        }
                                                                    }}
                                                                    className="h-8 text-xs flex-1 bg-background"
                                                                    autoFocus
                                                                    placeholder="Escribe el privilegio..."
                                                                />
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    onClick={handleSaveEditBenefit}
                                                                    className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shrink-0 gap-1"
                                                                    title="Guardar cambio"
                                                                >
                                                                    <Check className="h-3.5 w-3.5" />
                                                                    <span>Guardar</span>
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setEditingBenefit(null)}
                                                                    className="h-8 px-2 text-muted-foreground hover:text-foreground text-[11px] shrink-0"
                                                                    title="Cancelar edición"
                                                                >
                                                                    <X className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            key={bIdx}
                                                            className="flex items-center justify-between gap-2 p-2 px-3 rounded-lg bg-card border border-border/60 text-xs shadow-2xs hover:border-primary/30 transition-all group"
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <CheckCircle2 className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                                                                <span className="font-medium text-foreground truncate">{beneficio}</span>
                                                            </div>

                                                            <div className="flex items-center gap-1 shrink-0">
                                                                {/* Subir */}
                                                                <button
                                                                    type="button"
                                                                    disabled={bIdx === 0}
                                                                    onClick={() => handleMoveBenefitUp(tierKey, bIdx)}
                                                                    className={cn(
                                                                        "p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                                                                        bIdx === 0 ? "opacity-25 cursor-not-allowed" : "cursor-pointer"
                                                                    )}
                                                                    title={bIdx === 0 ? "Ya está en la primera posición" : "Subir de posición"}
                                                                >
                                                                    <ArrowUp className="h-3.5 w-3.5" />
                                                                </button>

                                                                {/* Bajar */}
                                                                <button
                                                                    type="button"
                                                                    disabled={bIdx === tier.beneficios.length - 1}
                                                                    onClick={() => handleMoveBenefitDown(tierKey, bIdx)}
                                                                    className={cn(
                                                                        "p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                                                                        bIdx === tier.beneficios.length - 1 ? "opacity-25 cursor-not-allowed" : "cursor-pointer"
                                                                    )}
                                                                    title={bIdx === tier.beneficios.length - 1 ? "Ya está en la última posición" : "Bajar de posición"}
                                                                >
                                                                    <ArrowDown className="h-3.5 w-3.5" />
                                                                </button>

                                                                {/* Editar */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleStartEditBenefit(tierKey, bIdx, beneficio)}
                                                                    className="text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 p-1.5 rounded transition-colors cursor-pointer"
                                                                    title="Editar privilegio"
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </button>

                                                                {/* Eliminar */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveBenefit(tierKey, bIdx)}
                                                                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded transition-colors cursor-pointer"
                                                                    title="Eliminar privilegio"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            );
                        })}
                    </Tabs>
                </CardContent>
            </Card>

            {/* 4. Tarjeta de Beneficio "Niveles Pase Alfa" y Términos y Condiciones */}
            <Card className="border-border/60 shadow-xs">
                <CardHeader className="pb-3 border-b border-border/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="h-4 w-4 text-[#C5A880]" />
                            <CardTitle className="text-sm font-bold">
                                Tarjeta de Beneficio &quot;Niveles Pase Alfa&quot; y Términos y Condiciones
                            </CardTitle>
                        </div>
                        <Badge className="bg-[#C5A880]/15 text-[#C5A880] border-[#C5A880]/40 text-[10px] w-fit">
                            Visible en App Móvil y Sitio Web
                        </Badge>
                    </div>
                    <CardDescription className="text-xs">
                        Personaliza la imagen de portada, el título, la descripción y los términos y condiciones legales de los Niveles del Pase Alfa que aparecen como tarjeta en la sección de Beneficios de la App y en la web.
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                        {/* Imagen de Portada */}
                        <div className="md:col-span-4 space-y-1.5">
                            <Label className="text-xs font-semibold flex items-center gap-1.5">
                                <ImageIcon className="h-3.5 w-3.5 text-[#C5A880]" />
                                Imagen de la Tarjeta (Pase Alfa)
                            </Label>
                            <ImageUploader
                                folder="pase_alfa"
                                currentImageUrl={config.imagenUrl || DEFAULT_NIVELES_IMAGE_URL}
                                onUpload={(url) => setConfig((prev) => ({ ...prev, imagenUrl: url }))}
                                onRemove={() => setConfig((prev) => ({ ...prev, imagenUrl: DEFAULT_NIVELES_IMAGE_URL }))}
                                className="max-w-full"
                            />
                            <p className="text-[10px] text-muted-foreground leading-snug">
                                Esta imagen se muestra en la tarjeta de niveles dentro de la sección Beneficios de la app móvil y del sitio web.
                            </p>
                        </div>

                        {/* Título, Descripción y Términos */}
                        <div className="md:col-span-8 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold">Título de la Tarjeta</Label>
                                    <Input
                                        value={config.titulo_tarjeta || 'NIVELES PASE ALFA'}
                                        onChange={(e) =>
                                            setConfig((prev) => ({ ...prev, titulo_tarjeta: e.target.value }))
                                        }
                                        placeholder="NIVELES PASE ALFA"
                                        className="h-9 text-xs font-bold uppercase"
                                    />
                                </div>
                                <div className="space-y-1 flex flex-col justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                terminos: buildDefaultNivelesTerminos(prev),
                                            }))
                                        }
                                        className="h-9 text-xs font-semibold border-[#C5A880]/50 text-[#C5A880] hover:bg-[#C5A880]/10"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                        Sincronizar Términos con Valores Actuales
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Descripción de la Tarjeta</Label>
                                <Textarea
                                    rows={2}
                                    value={config.descripcion_tarjeta || ''}
                                    onChange={(e) =>
                                        setConfig((prev) => ({ ...prev, descripcion_tarjeta: e.target.value }))
                                    }
                                    placeholder="Breve resumen del sistema de niveles Pase Alfa..."
                                    className="text-xs resize-none"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5 text-[#C5A880]" />
                                        Términos y Condiciones de los Niveles del Pase Alfa
                                    </Label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setExpandedTerminosOpen(true)}
                                        className="h-7 px-2 text-[11px] font-semibold text-[#C5A880] hover:text-[#C5A880] hover:bg-[#C5A880]/10 gap-1"
                                    >
                                        <Maximize2 className="h-3 w-3" />
                                        Ampliar Editor
                                    </Button>
                                </div>
                                <Textarea
                                    rows={7}
                                    value={config.terminos || ''}
                                    onChange={(e) =>
                                        setConfig((prev) => ({ ...prev, terminos: e.target.value }))
                                    }
                                    placeholder="Escribe aquí las reglas y términos legales de los niveles del Pase Alfa..."
                                    className="text-xs font-mono leading-relaxed"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Modal ampliado para editar Términos y Condiciones de los Niveles */}
            <Dialog open={expandedTerminosOpen} onOpenChange={setExpandedTerminosOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <FileText className="h-4 w-4 text-[#C5A880]" />
                            Términos y Condiciones — {config.titulo_tarjeta || 'NIVELES PASE ALFA'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Edita las cláusulas oficiales del sistema de niveles. Recuerda hacer clic en &quot;Guardar Niveles&quot; para publicar los cambios en la app móvil y el sitio web.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 py-2 overflow-hidden flex flex-col gap-2">
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        terminos: buildDefaultNivelesTerminos(prev),
                                    }))
                                }
                                className="h-8 text-xs font-semibold border-[#C5A880]/50 text-[#C5A880] hover:bg-[#C5A880]/10"
                            >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Regenerar con Visitas, Gasto y % Actuales
                            </Button>
                        </div>
                        <Textarea
                            value={config.terminos || ''}
                            onChange={(e) => setConfig((prev) => ({ ...prev, terminos: e.target.value }))}
                            className="min-h-[380px] flex-1 text-xs font-mono leading-relaxed resize-y"
                            placeholder="Escribe aquí los términos y condiciones..."
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setExpandedTerminosOpen(false)}
                            className="text-xs"
                        >
                            Cerrar Vista Ampliada
                        </Button>
                        <Button
                            type="button"
                            onClick={async () => {
                                setExpandedTerminosOpen(false);
                                await handleSave();
                            }}
                            disabled={saving}
                            className="bg-[#C5A880] hover:bg-[#b09268] text-black font-bold text-xs"
                        >
                            <Save className="h-3.5 w-3.5 mr-1.5" />
                            Guardar y Sincronizar Todo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 5. Simulador Interactivo en Vivo */}
            <Card className="border-border/60 bg-muted/15 shadow-xs">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-[#C5A880]" />
                            <CardTitle className="text-sm font-bold">Simulador de Nivel en Vivo</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-background">
                            Comprobador de Reglas
                        </Badge>
                    </div>
                    <CardDescription className="text-xs">
                        Ingresa visitas y consumo de prueba para verificar cómo clasificará el algoritmo al cliente y qué texto de progreso verá en su pantalla.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Visitas del Cliente</Label>
                            <Input
                                type="number"
                                min={0}
                                value={simVisitas}
                                onChange={(e) => setSimVisitas(Math.max(0, parseInt(e.target.value) || 0))}
                                className="h-9 text-xs bg-background"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-semibold">Dinero Gastado ($ MXN)</Label>
                            <Input
                                type="number"
                                min={0}
                                step={100}
                                value={simGasto}
                                onChange={(e) => setSimGasto(Math.max(0, parseInt(e.target.value) || 0))}
                                className="h-9 text-xs bg-background"
                            />
                        </div>

                        {/* Resultado de la simulación */}
                        <div className="sm:col-span-2 rounded-xl bg-card border border-border/80 p-3 shadow-2xs space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-muted-foreground font-medium">Nivel Calculado:</span>
                                <Badge
                                    className="font-bold text-xs shadow-xs"
                                    style={{
                                        backgroundColor: simulatedTier.tier.color,
                                        color: simulatedTier.tier.colorTexto || '#FFFFFF',
                                    }}
                                >
                                    {simulatedTier.tier.nombre}
                                </Badge>
                            </div>
                            <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                                <span>{simulatedTier.mensaje}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
