'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { db } from '@/lib/firebase-client';
import {
    collection,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    addDoc,
    Timestamp,
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    MessageSquareWarning,
    MessageSquarePlus,
    Star,
    CheckCircle2,
    Clock,
    Search,
    Trash2,
    ExternalLink,
    User,
    MapPin,
    Scissors,
    Sparkles,
    Lightbulb,
    AlertTriangle,
    HeartHandshake,
    RefreshCw,
    MessageCircle,
    StickyNote,
    Check,
    X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type TipoOpinionApp = 'queja' | 'sugerencia' | 'felicitacion' | 'calificacion';

export interface OpinionClienteApp {
    id: string;
    tipo: TipoOpinionApp;
    calificacion: number;
    comentario: string;
    sucursalId?: string;
    sucursalNombre?: string;
    barberoNombre?: string;
    clienteId?: string;
    clienteNombre?: string;
    clienteTelefono?: string;
    clienteEmail?: string;
    nivelCliente?: string;
    anonimo?: boolean;
    estado: 'pendiente' | 'atendido';
    nota_admin?: string;
    atendido_por?: string;
    creado_el?: any;
    actualizado_el?: any;
}

export function BuzonClientesManager() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [opiniones, setOpiniones] = useState<OpinionClienteApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroTipo, setFiltroTipo] = useState<'todos' | 'pendientes' | 'queja' | 'sugerencia' | 'felicitacion'>('todos');
    const [busqueda, setBusqueda] = useState('');
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    useEffect(() => {
        const colRef = collection(db, 'settings', 'app_movil', 'opiniones');
        const unsub = onSnapshot(
            colRef,
            (snap) => {
                const list: OpinionClienteApp[] = snap.docs.map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        tipo: (data.tipo as TipoOpinionApp) || 'sugerencia',
                        calificacion: Number(data.calificacion ?? 5),
                        comentario: data.comentario || '',
                        sucursalId: data.sucursalId || '',
                        sucursalNombre: data.sucursalNombre || 'Sucursal Cipreses',
                        barberoNombre: data.barberoNombre || '',
                        clienteId: data.clienteId || '',
                        clienteNombre: data.clienteNombre || 'Cliente Alfa',
                        clienteTelefono: data.clienteTelefono || '',
                        clienteEmail: data.clienteEmail || '',
                        nivelCliente: data.nivelCliente || 'Alfa Member',
                        anonimo: Boolean(data.anonimo),
                        estado: data.estado === 'atendido' ? 'atendido' : 'pendiente',
                        nota_admin: data.nota_admin || '',
                        atendido_por: data.atendido_por || '',
                        creado_el: data.creado_el,
                        actualizado_el: data.actualizado_el,
                    };
                });

                // Ordenar por fecha más reciente primero
                list.sort((a, b) => {
                    const timeA = a.creado_el?.toMillis ? a.creado_el.toMillis() : (a.creado_el?.seconds ? a.creado_el.seconds * 1000 : 0);
                    const timeB = b.creado_el?.toMillis ? b.creado_el.toMillis() : (b.creado_el?.seconds ? b.creado_el.seconds * 1000 : 0);
                    return timeB - timeA;
                });

                setOpiniones(list);
                setLoading(false);
            },
            (err) => {
                console.warn('Error escuchando opiniones:', err);
                setLoading(false);
            }
        );

        return () => unsub();
    }, []);

    // Métricas resumen
    const stats = useMemo(() => {
        const total = opiniones.length;
        const pendientes = opiniones.filter((o) => o.estado === 'pendiente').length;
        const quejas = opiniones.filter((o) => o.tipo === 'queja').length;
        const sugerencias = opiniones.filter((o) => o.tipo === 'sugerencia' || o.tipo === 'felicitacion').length;
        const promedio =
            total > 0
                ? (opiniones.reduce((acc, o) => acc + (Number(o.calificacion) || 5), 0) / total).toFixed(1)
                : '5.0';

        return { total, pendientes, quejas, sugerencias, promedio };
    }, [opiniones]);

    // Filtrado
    const filteredOpiniones = useMemo(() => {
        return opiniones.filter((item) => {
            if (filtroTipo === 'pendientes' && item.estado !== 'pendiente') return false;
            if (filtroTipo === 'queja' && item.tipo !== 'queja') return false;
            if (filtroTipo === 'sugerencia' && item.tipo !== 'sugerencia') return false;
            if (filtroTipo === 'felicitacion' && item.tipo !== 'felicitacion' && item.tipo !== 'calificacion') return false;

            if (busqueda.trim()) {
                const q = busqueda.toLowerCase().trim();
                const matchNombre = (item.clienteNombre || '').toLowerCase().includes(q);
                const matchComentario = (item.comentario || '').toLowerCase().includes(q);
                const matchSucursal = (item.sucursalNombre || '').toLowerCase().includes(q);
                const matchBarbero = (item.barberoNombre || '').toLowerCase().includes(q);
                const matchTel = (item.clienteTelefono || '').toLowerCase().includes(q);
                if (!matchNombre && !matchComentario && !matchSucursal && !matchBarbero && !matchTel) {
                    return false;
                }
            }

            return true;
        });
    }, [opiniones, filtroTipo, busqueda]);

    const handleToggleEstado = async (item: OpinionClienteApp) => {
        setUpdatingId(item.id);
        const nuevoEstado = item.estado === 'pendiente' ? 'atendido' : 'pendiente';
        try {
            await updateDoc(doc(db, 'settings', 'app_movil', 'opiniones', item.id), {
                estado: nuevoEstado,
                atendido_por: user?.displayName || user?.email || 'Admin',
                actualizado_el: Timestamp.now(),
            });
            toast({
                title: nuevoEstado === 'atendido' ? 'Marcado como Atendido' : 'Reabierto como Pendiente',
                description: `El mensaje de ${item.anonimo ? 'Cliente Anónimo' : item.clienteNombre} fue actualizado.`,
            });
        } catch (err: any) {
            toast({
                title: 'Error al actualizar',
                description: err?.message || 'No se pudo cambiar el estado.',
                variant: 'destructive',
            });
        } finally {
            setUpdatingId(null);
        }
    };

    const handleSaveNote = async (id: string) => {
        setUpdatingId(id);
        try {
            await updateDoc(doc(db, 'settings', 'app_movil', 'opiniones', id), {
                nota_admin: noteText.trim(),
                actualizado_el: Timestamp.now(),
            });
            setEditingNoteId(null);
            setNoteText('');
            toast({
                title: 'Nota guardada',
                description: 'Se guardó el seguimiento interno en este comentario.',
            });
        } catch (err: any) {
            toast({
                title: 'Error al guardar nota',
                description: err?.message || 'Intenta nuevamente.',
                variant: 'destructive',
            });
        } finally {
            setUpdatingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Estás seguro de eliminar este mensaje del buzón permanentemente?')) return;
        try {
            await deleteDoc(doc(db, 'settings', 'app_movil', 'opiniones', id));
            toast({
                title: 'Mensaje eliminado',
                description: 'El comentario ha sido removido del buzón.',
            });
        } catch (err: any) {
            toast({
                title: 'Error al eliminar',
                description: err?.message || 'No se pudo eliminar el registro.',
                variant: 'destructive',
            });
        }
    };

    const handleContactWhatsApp = (item: OpinionClienteApp) => {
        const rawPhone = (item.clienteTelefono || '').replace(/\D/g, '');
        if (!rawPhone) return;
        const phoneWithCode = rawPhone.length === 10 ? `52${rawPhone}` : rawPhone;
        const saludo = `Hola ${item.clienteNombre || 'Caballero'}, te escribimos de gerencia de *VATOS ALFA Barber Shop* respecto a tu ${
            item.tipo === 'queja' ? 'reporte' : 'comentario'
        } en nuestra App Móvil: "${item.comentario.slice(0, 80)}...". Para nosotros tu experiencia es prioridad.`;
        window.open(`https://wa.me/${phoneWithCode}?text=${encodeURIComponent(saludo)}`, '_blank');
    };

    const formatFecha = (ts: any) => {
        if (!ts) return 'Hace un momento';
        try {
            const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
            return d.toLocaleDateString('es-MX', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return 'Fecha reciente';
        }
    };

    const getTipoBadge = (tipo: TipoOpinionApp) => {
        switch (tipo) {
            case 'queja':
                return (
                    <Badge className="bg-red-500/15 text-red-500 border border-red-500/30 font-bold text-[10px] gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Queja / Detalle de Servicio
                    </Badge>
                );
            case 'sugerencia':
                return (
                    <Badge className="bg-blue-500/15 text-blue-500 border border-blue-500/30 font-bold text-[10px] gap-1">
                        <Lightbulb className="h-3 w-3" />
                        Sugerencia o Idea
                    </Badge>
                );
            case 'felicitacion':
            case 'calificacion':
            default:
                return (
                    <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold text-[10px] gap-1">
                        <HeartHandshake className="h-3 w-3" />
                        Felicitación / Reseña
                    </Badge>
                );
        }
    };

    return (
        <div className="space-y-5">
            {/* Encabezado y Escudo de Reputación */}
            <div className="rounded-xl border border-[#C5A880]/40 bg-gradient-to-r from-[#10172b] via-[#18223f] to-[#10172b] p-4 sm:p-5 text-white shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <MessageSquareWarning className="h-5 w-5 text-[#C5A880]" />
                            <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                                Buzón de Clientes & Escudo de Reputación
                            </h3>
                            {stats.pendientes > 0 && (
                                <Badge className="bg-amber-500 text-black font-black text-[10px] px-2 py-0.5">
                                    {stats.pendientes} por revisar
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                            Aquí llegan en tiempo real las sugerencias, felicitaciones y quejas enviadas desde la App Móvil.
                            Además, cuando un cliente califica con <strong>1 a 3 estrellas</strong>, la app retiene el comentario en privado aquí en lugar de enviarlo a Google Maps.
                        </p>
                    </div>
                </div>
            </div>

            {/* Tarjetas de Estadísticas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="border-border/60 shadow-2xs">
                    <CardContent className="p-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-medium text-muted-foreground">Total Mensajes</p>
                            <p className="text-2xl font-bold text-foreground mt-0.5">{stats.total}</p>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <MessageSquarePlus className="h-4 w-4" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-2xs">
                    <CardContent className="p-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-medium text-muted-foreground">Pendientes de Revisión</p>
                            <p className="text-2xl font-bold text-amber-500 mt-0.5">{stats.pendientes}</p>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                            <Clock className="h-4 w-4" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-2xs">
                    <CardContent className="p-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-medium text-muted-foreground">Quejas / Reportes</p>
                            <p className="text-2xl font-bold text-red-500 mt-0.5">{stats.quejas}</p>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                            <AlertTriangle className="h-4 w-4" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-2xs">
                    <CardContent className="p-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-medium text-muted-foreground">Satisfacción App</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-2xl font-bold text-foreground">{stats.promedio}</span>
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            </div>
                        </div>
                        <div className="h-9 w-9 rounded-lg bg-[#C5A880]/15 flex items-center justify-center text-[#C5A880]">
                            <Sparkles className="h-4 w-4" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <Card className="border-border/60 shadow-xs">
                <CardHeader className="pb-3 border-b border-border/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {[
                                { id: 'todos', label: `Todos (${stats.total})` },
                                { id: 'pendientes', label: `Pendientes (${stats.pendientes})` },
                                { id: 'queja', label: `⚠️ Quejas (${stats.quejas})` },
                                { id: 'sugerencia', label: '💡 Sugerencias' },
                                { id: 'felicitacion', label: '⭐ Felicitaciones' },
                            ].map((tab) => (
                                <Button
                                    key={tab.id}
                                    type="button"
                                    size="sm"
                                    variant={filtroTipo === tab.id ? 'default' : 'outline'}
                                    onClick={() => setFiltroTipo(tab.id as any)}
                                    className={cn(
                                        'h-8 text-xs font-semibold rounded-lg px-3',
                                        filtroTipo === tab.id && 'bg-[#202A49] text-white hover:bg-[#1a223b]'
                                    )}
                                >
                                    {tab.label}
                                </Button>
                            ))}
                        </div>

                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar por cliente, barbero, texto..."
                                className="h-8 pl-8 text-xs"
                            />
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-[#C5A880]" />
                            <span>Cargando buzón de clientes...</span>
                        </div>
                    ) : filteredOpiniones.length === 0 ? (
                        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border/60 bg-muted/15 space-y-2">
                            <MessageSquarePlus className="h-8 w-8 text-muted-foreground mx-auto opacity-60" />
                            <p className="text-sm font-bold text-foreground">No hay mensajes en esta vista</p>
                            <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                Cuando un cliente envíe una sugerencia, felicitación o queja desde la sección "Buzón Alfa" de la aplicación móvil, aparecerá aquí al instante.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredOpiniones.map((item) => {
                                const isEditingNote = editingNoteId === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            'rounded-xl border p-4 transition-all space-y-3',
                                            item.estado === 'pendiente'
                                                ? item.tipo === 'queja'
                                                    ? 'border-red-500/40 bg-red-500/5'
                                                    : 'border-[#C5A880]/50 bg-card shadow-xs'
                                                : 'border-border/50 bg-muted/15 opacity-85'
                                        )}
                                    >
                                        {/* Fila Superior: Categoría, Estrellas, Fecha y Estado */}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {getTipoBadge(item.tipo)}

                                                {/* Estrellas */}
                                                <div className="flex items-center gap-0.5 bg-muted/40 px-2 py-0.5 rounded-full border border-border/50">
                                                    {[1, 2, 3, 4, 5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={cn(
                                                                'h-3 w-3',
                                                                star <= item.calificacion
                                                                    ? 'fill-amber-400 text-amber-400'
                                                                    : 'text-muted-foreground/30'
                                                            )}
                                                        />
                                                    ))}
                                                    <span className="text-[10px] font-bold ml-1 text-foreground">
                                                        {item.calificacion}/5
                                                    </span>
                                                </div>

                                                {item.estado === 'pendiente' ? (
                                                    <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px]">
                                                        Pendiente
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] gap-1">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Atendido
                                                    </Badge>
                                                )}
                                            </div>

                                            <span className="text-[11px] text-muted-foreground font-medium">
                                                {formatFecha(item.creado_el)}
                                            </span>
                                        </div>

                                        {/* Comentario del Cliente */}
                                        <div className="p-3 rounded-lg bg-background/80 border border-border/50 text-xs sm:text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                            "{item.comentario}"
                                        </div>

                                        {/* Metadatos: Cliente, Sucursal y Barbero */}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1.5">
                                                <User className="h-3.5 w-3.5 text-[#C5A880]" />
                                                <span className="font-semibold text-foreground">
                                                    {item.anonimo ? 'Enviado como Anónimo' : item.clienteNombre || 'Cliente Alfa'}
                                                </span>
                                                {!item.anonimo && item.nivelCliente && (
                                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                                        {item.nivelCliente}
                                                    </Badge>
                                                )}
                                                {!item.anonimo && item.clienteTelefono && (
                                                    <span className="text-[11px] text-muted-foreground">
                                                        • Tel: {item.clienteTelefono}
                                                    </span>
                                                )}
                                            </div>

                                            {item.sucursalNombre && (
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="h-3.5 w-3.5 text-blue-400" />
                                                    <span>{item.sucursalNombre}</span>
                                                </div>
                                            )}

                                            {item.barberoNombre && (
                                                <div className="flex items-center gap-1">
                                                    <Scissors className="h-3.5 w-3.5 text-amber-400" />
                                                    <span>Barbero: <strong>{item.barberoNombre}</strong></span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Nota de Seguimiento Interno */}
                                        {item.nota_admin && !isEditingNote && (
                                            <div className="p-2.5 rounded-lg bg-[#C5A880]/10 border border-[#C5A880]/30 text-xs flex items-start justify-between gap-2">
                                                <div className="space-y-0.5">
                                                    <span className="text-[10px] font-bold text-[#C5A880] uppercase tracking-wider block">
                                                        Nota Interna de Seguimiento:
                                                    </span>
                                                    <p className="text-foreground">{item.nota_admin}</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setEditingNoteId(item.id);
                                                        setNoteText(item.nota_admin || '');
                                                    }}
                                                    className="h-6 px-2 text-[10px]"
                                                >
                                                    Editar nota
                                                </Button>
                                            </div>
                                        )}

                                        {isEditingNote && (
                                            <div className="space-y-2 pt-1">
                                                <Textarea
                                                    rows={2}
                                                    value={noteText}
                                                    onChange={(e) => setNoteText(e.target.value)}
                                                    placeholder="Escribe qué solución o seguimiento se le dio al cliente..."
                                                    className="text-xs resize-none"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => handleSaveNote(item.id)}
                                                        disabled={updatingId === item.id}
                                                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                                    >
                                                        <Check className="h-3 w-3" />
                                                        Guardar Nota
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setEditingNoteId(null);
                                                            setNoteText('');
                                                        }}
                                                        className="h-7 text-xs"
                                                    >
                                                        <X className="h-3 w-3 mr-1" />
                                                        Cancelar
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Botones de Acción */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={item.estado === 'pendiente' ? 'default' : 'outline'}
                                                    disabled={updatingId === item.id}
                                                    onClick={() => handleToggleEstado(item)}
                                                    className={cn(
                                                        'h-8 text-xs font-semibold gap-1.5',
                                                        item.estado === 'pendiente' &&
                                                            'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                    )}
                                                >
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    {item.estado === 'pendiente' ? 'Marcar como Atendido' : 'Reabrir como Pendiente'}
                                                </Button>

                                                {!item.anonimo && item.clienteTelefono && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleContactWhatsApp(item)}
                                                        className="h-8 text-xs font-semibold gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                                                    >
                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                        Responder por WhatsApp
                                                        <ExternalLink className="h-3 w-3" />
                                                    </Button>
                                                )}

                                                {!isEditingNote && !item.nota_admin && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setEditingNoteId(item.id);
                                                            setNoteText('');
                                                        }}
                                                        className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                                                    >
                                                        <StickyNote className="h-3.5 w-3.5" />
                                                        Agregar Nota
                                                    </Button>
                                                )}
                                            </div>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(item.id)}
                                                className="h-8 px-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs"
                                                title="Eliminar mensaje"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
