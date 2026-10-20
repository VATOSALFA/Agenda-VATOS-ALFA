
'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ShoppingCart, User, Phone, Mail, Cake, MessageSquare, PlusCircle, VenetianMask, UserCheck, UserX, PiggyBank, XCircle, Sparkles, Scissors, Award, Smartphone, Gift, CheckCircle2, Check, QrCode, X, Pencil, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Client, Profesional, CanjeBeneficio } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { where, doc, onSnapshot, collection, query } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';
import { NewClientForm } from './new-client-form';

interface ClientDetailModalProps {
  client: Client;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onNewReservation?: () => void;
  onClientUpdated?: (updatedClient: Client) => void;
}

interface Reservation {
  id: string;
  fecha: string;
  hora_inicio?: string;
  hora_fin?: string;
  servicio: string;
  barbero_id: string;
  estado: string;
  items?: { barbero_id?: string; [key: string]: any }[];
}

interface Sale {
  id: string;
  fecha_hora_venta: { seconds: number; nanoseconds: number; };
  total: number;
  metodo_pago: string;
  items: { nombre: string; cantidad: number; precio_unitario: number; barbero_id?: string }[];
  pago_estado?: string;
  monto_pagado_real?: number;
}

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className={className}>
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157.1zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
  </svg>
);

const StatCard = ({ title, value, icon: Icon, description }: { title: string, value: string | number, icon: LucideIcon, description?: string }) => (
  <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-xs hover:border-primary/30 transition-all flex flex-col justify-between">
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="text-xs font-medium text-muted-foreground truncate">{title}</span>
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
    </div>
    <div>
      <div className="text-xl font-bold tracking-tight text-foreground">{value}</div>
      {description && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{description}</p>}
    </div>
  </div>
);

export function ClientDetailModal({ client, isOpen, onOpenChange, onNewReservation, onClientUpdated }: ClientDetailModalProps) {
  const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>(
    'reservas',
    isOpen ? where('cliente_id', '==', client.id) : undefined
  );

  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
    'ventas',
    isOpen ? where('cliente_id', '==', client.id) : undefined
  );

  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', isOpen);

  const [liveClient, setLiveClient] = useState<Client>(client);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    setLiveClient(client);
    if (!isOpen || !client?.id || !db) return;
    try {
      const unsub = onSnapshot(doc(db, 'clientes', client.id), (snap) => {
        if (snap.exists()) {
          setLiveClient({ id: snap.id, ...snap.data() } as Client);
        }
      });
      return () => unsub();
    } catch (_) {}
  }, [isOpen, client?.id]);

  const [redemptions, setRedemptions] = useState<CanjeBeneficio[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [nivelesConfig, setNivelesConfig] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !db) return;
    try {
      const unsub = onSnapshot(doc(db, 'configuracion', 'pase_alfa'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setNivelesConfig(data.niveles_config || null);
        }
      });
      return () => unsub();
    } catch (_) {}
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !client?.id || !db) {
      setRedemptions([]);
      return;
    }
    setRedemptionsLoading(true);
    try {
      const q = query(
        collection(db, 'canjes_beneficios'),
        where('clienteId', '==', client.id)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as CanjeBeneficio[];
          setRedemptions(list);
          setRedemptionsLoading(false);
        },
        (err) => {
          console.warn('Advertencia consultando canjes_beneficios:', err);
          setRedemptionsLoading(false);
        }
      );
      return () => unsub();
    } catch (err) {
      console.warn('Error inicializando consulta de canjes_beneficios:', err);
      setRedemptionsLoading(false);
    }
  }, [isOpen, client?.id]);

  const clientPhoto = liveClient.fotoUrl || liveClient.avatarUrl || (liveClient as any).foto_perfil_url || (liveClient as any).photoURL || (liveClient as any).photoUrl;
  const hasAppLinked = Boolean(liveClient.appVinculada === true || (liveClient as any).fecha_registro_app);
  const alfaCoins = hasAppLinked ? Number(liveClient.alfaCoins ?? liveClient.alfa_coins ?? liveClient.puntosLealtad ?? liveClient.puntos_lealtad ?? liveClient.puntos ?? 0) : 0;
  const stamps = Number(liveClient.cortes_acumulados ?? liveClient.cortesAcumulados ?? 0);
  const freeCutReady = Boolean(liveClient.corte_gratis_disponible ?? liveClient.corteGratisDisponible ?? stamps >= 9);

  const isBirthdayMonth = useMemo(() => {
    if (!liveClient.fecha_nacimiento) return false;
    try {
      const currentMonth = new Date().getMonth() + 1;
      let birthMonth: number | null = null;
      if (typeof liveClient.fecha_nacimiento === 'string') {
        const parts = liveClient.fecha_nacimiento.split(/[-/]/);
        if (parts.length >= 2) {
          birthMonth = parseInt(parts[1], 10);
        }
      } else if ((liveClient.fecha_nacimiento as any)?.toDate) {
        birthMonth = (liveClient.fecha_nacimiento as any).toDate().getMonth() + 1;
      }
      return birthMonth === currentMonth;
    } catch {
      return false;
    }
  }, [liveClient.fecha_nacimiento]);

  const { user } = useAuth();
  const canViewPhone = useMemo(() => user?.permissions?.includes('ver_numero_telefono'), [user]);

  const [resSortConfig, setResSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'fecha', direction: 'desc' });
  const [salesSortConfig, setSalesSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'fecha', direction: 'desc' });

  const professionalMap = useMemo(() => {
    if (professionalsLoading) return new Map();
    return new Map(professionals.map(p => [p.id, p.name]));
  }, [professionals, professionalsLoading]);

  const sortedReservations = useMemo(() => {
    if (!reservations) return [];
    const sorted = [...reservations];
    const { key, direction } = resSortConfig;
    const dir = direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      if (key === 'fecha') {
        const timeA = a.hora_inicio ? a.hora_inicio.slice(0, 5) : '00:00';
        const timeB = b.hora_inicio ? b.hora_inicio.slice(0, 5) : '00:00';
        const dateStrA = `${a.fecha || ''}T${timeA}:00`;
        const dateStrB = `${b.fecha || ''}T${timeB}:00`;
        const dateA = new Date(dateStrA).getTime() || (a.fecha ? new Date(a.fecha).getTime() : 0);
        const dateB = new Date(dateStrB).getTime() || (b.fecha ? new Date(b.fecha).getTime() : 0);
        return (dateA - dateB) * dir;
      }
      if (key === 'servicio') return (a.servicio || '').localeCompare(b.servicio || '') * dir;
      if (key === 'profesional') {
        const profA = a.items?.find((i: any) => i.barbero_id)?.barbero_id || a.barbero_id;
        const profB = b.items?.find((i: any) => i.barbero_id)?.barbero_id || b.barbero_id;
        const nameA = professionalMap.get(profA) || '';
        const nameB = professionalMap.get(profB) || '';
        return nameA.localeCompare(nameB) * dir;
      }
      if (key === 'estado') return (a.estado || '').localeCompare(b.estado || '') * dir;
      return 0;
    });
    return sorted;
  }, [reservations, resSortConfig, professionalMap]);

  const sortedSales = useMemo(() => {
    if (!sales) return [];
    const sorted = [...sales];
    const { key, direction } = salesSortConfig;
    const dir = direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      if (key === 'fecha') {
        const dateA = a.fecha_hora_venta?.seconds || 0;
        const dateB = b.fecha_hora_venta?.seconds || 0;
        return (dateA - dateB) * dir;
      }
      if (key === 'total') return ((a.total || 0) - (b.total || 0)) * dir;
      if (key === 'metodo_pago') return (a.metodo_pago || '').localeCompare(b.metodo_pago || '') * dir;
      if (key === 'profesional') {
        const getNames = (s: Sale) => Array.from(new Set(s.items?.map(i => (i.barbero_id ? professionalMap.get(i.barbero_id) : null) || (i as any).barbero_nombre || (i as any).barbero || (s as any).barbero_nombre || (s as any).profesional_nombre).filter(Boolean))).join(', ');
        return getNames(a).localeCompare(getNames(b)) * dir;
      }
      return 0;
    });
    return sorted;
  }, [sales, salesSortConfig, professionalMap]);


  const formatDate = (date: any, includeTime = false, timeStr?: string) => {
    if (!date) return 'N/A';
    let dateObj: Date;
    if (date.seconds) { // Firestore Timestamp
      dateObj = new Date(date.seconds * 1000);
    } else if (typeof date === 'string') { // ISO String or YYYY-MM-DD
      dateObj = parseISO(date);
    } else {
      return 'Fecha inválida';
    }

    if (isNaN(dateObj.getTime())) return 'Fecha inválida';

    const formattedDateOnly = format(dateObj, 'PPP', { locale: es });

    if (includeTime) {
      if (timeStr) {
        return `${formattedDateOnly} ${timeStr.slice(0, 5)}`;
      }
      return format(dateObj, 'PPP p', { locale: es });
    }

    return formattedDateOnly;
  };

  const validSales = useMemo(() => {
    if (salesLoading || !sales) return [];
    return sales.filter(sale => !['Pendiente', 'Anulado', 'Cancelado'].includes(sale.pago_estado || ''));
  }, [sales, salesLoading]);

  const totalSpent = salesLoading
    ? 0
    : validSales.reduce((acc, sale) => {
      const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real !== null)
        ? sale.monto_pagado_real
        : (sale.total || 0);
      return acc + amount;
    }, 0);

  const clientLevelInfo = useMemo(() => {
    const defaultTiers = {
      member: { nombre: 'Alfa Member', color: '#2563EB', visitasMin: 0, gastoMin: 0 },
      gold: { nombre: 'Alfa Gold', color: '#C5A880', visitasMin: 4, gastoMin: 1500 },
      vip: { nombre: 'Alfa Black VIP', color: '#0F172A', visitasMin: 8, gastoMin: 3500 },
    };

    const cfg = nivelesConfig || {
      activo: true,
      criterio: 'ambos_opcional',
      ...defaultTiers,
    };

    const criterio = cfg.criterio || 'ambos_opcional';
    const member = cfg.member || defaultTiers.member;
    const gold = cfg.gold || defaultTiers.gold;
    const vip = cfg.vip || defaultTiers.vip;

    const v = stamps;
    const g = totalSpent || Number((liveClient as any).consumo_total || liveClient.gasto_total || 0);

    let meetsVip = false;
    let meetsGold = false;

    if (criterio === 'visitas') {
      meetsVip = v >= (vip.visitasMin ?? 8);
      meetsGold = v >= (gold.visitasMin ?? 4);
    } else if (criterio === 'gasto') {
      meetsVip = g >= (vip.gastoMin ?? 3500);
      meetsGold = g >= (gold.gastoMin ?? 1500);
    } else {
      meetsVip = v >= (vip.visitasMin ?? 8) || g >= (vip.gastoMin ?? 3500);
      meetsGold = v >= (gold.visitasMin ?? 4) || g >= (gold.gastoMin ?? 1500);
    }

    if (meetsVip) {
      return {
        nombre: vip.nombre || 'Alfa Black VIP',
        color: vip.color || '#0F172A',
        colorTexto: vip.colorTexto || '#FFFFFF',
        id: 'vip',
        nextNombre: null,
        faltanVisitas: 0,
        faltaGasto: 0,
      };
    }
    if (meetsGold) {
      return {
        nombre: gold.nombre || 'Alfa Gold',
        color: gold.color || '#C5A880',
        colorTexto: gold.colorTexto || '#0F172A',
        id: 'gold',
        nextNombre: vip.nombre || 'Alfa Black VIP',
        faltanVisitas: Math.max(0, (vip.visitasMin ?? 8) - v),
        faltaGasto: Math.max(0, (vip.gastoMin ?? 3500) - g),
      };
    }
    return {
      nombre: member.nombre || 'Alfa Member',
      color: member.color || '#2563EB',
      colorTexto: member.colorTexto || '#FFFFFF',
      id: 'member',
      nextNombre: gold.nombre || 'Alfa Gold',
      faltanVisitas: Math.max(0, (gold.visitasMin ?? 4) - v),
      faltaGasto: Math.max(0, (gold.gastoMin ?? 1500) - g),
    };
  }, [nivelesConfig, stamps, totalSpent, liveClient]);

  const clientLevel = liveClient.nivel || clientLevelInfo.nombre;

  const attendedAppointments = (!reservationsLoading && reservations) ? reservations.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado').length : (client.citas_asistidas || 0);
  const unattendedAppointments = (!reservationsLoading && reservations) ? reservations.filter(r => r.estado === 'No asiste').length : (client.citas_no_asistidas || 0);
  const cancelledAppointments = (!reservationsLoading && reservations) ? reservations.filter(r => r.estado === 'Cancelado').length : (client.citas_canceladas || 0);
  const totalAppointments = (!reservationsLoading && reservations) ? reservations.length : (client.citas_totales || 0);

  const SortableHeader = ({ label, sortKey, config, onSort, className, align = 'left' }: { 
    label: string; 
    sortKey: string; 
    config: { key: string; direction: 'asc' | 'desc' }; 
    onSort: (key: string) => void;
    className?: string;
    align?: 'left' | 'right' | 'center';
  }) => (
    <TableHead className={cn("py-1 px-3 text-xs font-semibold", className, align === 'right' && "text-right")}>
      <Button
        variant="ghost"
        className={cn(
          "h-auto p-0 font-bold hover:bg-transparent flex items-center gap-1.5 text-xs",
          align === 'right' && "ml-auto"
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", config.key === sortKey ? "text-primary" : "text-muted-foreground/30")} />
      </Button>
    </TableHead>
  );

  const handleResSort = (key: string) => {
    setResSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSalesSort = (key: string) => {
    setSalesSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };


  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton={true} className="sm:max-w-6xl h-[92vh] max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-background">
        {/* HEADER ESTILO VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          {/* Haz de luz animado sutil */}
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3.5 min-w-0">
              <Avatar className="h-11 w-11 border-2 border-white/20 shadow-md shrink-0">
                <AvatarImage src={clientPhoto} alt={liveClient.nombre} className="object-cover" />
                <AvatarFallback className="text-sm font-bold bg-[#1e293b] text-white">
                  {liveClient.nombre?.charAt(0)}{liveClient.apellido?.charAt(0)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 space-y-0.5">
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2 truncate">
                  <span>{liveClient.nombre} {liveClient.apellido}</span>
                  {freeCutReady && (
                    <Badge className="bg-[#C5A880] text-black font-extrabold text-[10px] px-2 py-0.5 border-none shadow-sm shadow-[#C5A880]/30">
                      10.° CORTE GRATIS
                    </Badge>
                  )}
                  {isBirthdayMonth && (
                    <Badge className="bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/40 text-[10px] px-2 py-0.5">
                      🎉 CUMPLEAÑOS
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Información detallada, historial y acciones para este cliente.
                </DialogDescription>
                <div className="flex items-center gap-2 text-xs text-slate-300 flex-wrap">
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-[11px] border border-white/10">
                    ID: #{liveClient.numero_cliente || liveClient.id?.slice(0, 6) || 'N/A'}
                  </span>
                  <span>•</span>
                  <span
                    className="font-bold px-1.5 py-0.5 rounded text-[11px]"
                    style={{
                      backgroundColor: `${clientLevelInfo.color}33`,
                      color: clientLevelInfo.color === '#0F172A' ? '#E2E8F0' : clientLevelInfo.color,
                      border: `1px solid ${clientLevelInfo.color}66`,
                    }}
                  >
                    {clientLevel}
                  </span>
                  {hasAppLinked && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-blue-400 text-[11px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                        App Vinculada
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Acciones del header y botón cerrar */}
            <div className="flex items-center gap-2 shrink-0 ml-3">
              {onNewReservation && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onNewReservation}
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20 h-8 px-3 rounded-lg"
                  >
                    <Calendar className="h-3.5 w-3.5 text-slate-200" />
                    <span>Agendar Cita</span>
                  </Button>
                  <button
                    type="button"
                    onClick={onNewReservation}
                    className="sm:hidden h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                    title="Agendar Cita"
                    aria-label="Agendar Cita"
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                </>
              )}

              {/* Botón Editar Cliente - Icono de lápiz sin contenedor */}
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                title="Editar Cliente"
                aria-label="Editar Cliente"
              >
                <Pencil className="h-4 w-4" />
              </button>

              {liveClient.telefono && canViewPhone && (
                <a
                  href={`https://wa.me/${!String(liveClient.telefono).trim().startsWith('+') && liveClient.telefono.replace(/\D/g, '').length === 10 ? '52' + liveClient.telefono.replace(/\D/g, '') : liveClient.telefono.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-[#25D366] hover:bg-white/10 flex items-center justify-center transition-colors"
                  title="Enviar WhatsApp"
                  aria-label="WhatsApp"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                </a>
              )}

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                aria-label="Cerrar modal"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar md:overflow-hidden md:grid md:grid-cols-4">
          {/* Lateral Izquierdo Minimalista y Elegante */}
          <div className="md:col-span-1 flex flex-col justify-between p-3.5 sm:p-5 border-b md:border-b-0 md:border-r border-border/60 bg-muted/15 md:overflow-y-auto md:custom-scrollbar space-y-4 shrink-0 md:shrink">
            <div className="space-y-4">
              {/* Mini Perfil Minimalista */}
              <div className="hidden md:flex flex-col items-center text-center pb-3 border-b border-border/40">
                <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-sm mb-2">
                  <AvatarImage src={clientPhoto} alt={liveClient.nombre} className="object-cover" />
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {liveClient.nombre?.charAt(0)}{liveClient.apellido?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center justify-center gap-1.5">
                  <h3 className="font-bold text-base text-foreground leading-tight">
                    {liveClient.nombre} {liveClient.apellido}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="text-slate-400 hover:text-foreground transition-colors p-1"
                    title="Editar Cliente"
                    aria-label="Editar Cliente"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground mt-0.5">
                  Cliente #{liveClient.numero_cliente || 'N/A'}
                </span>
              </div>

              {/* Datos de Contacto Minimalistas */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground/70" /> Teléfono
                  </span>
                  <span className="font-medium text-foreground text-right">
                    {canViewPhone ? (
                      liveClient.telefono || <span className="text-muted-foreground/50 italic">Sin registrar</span>
                    ) : (
                      '••••-••••'
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground/70" /> Correo
                  </span>
                  <span className="font-medium text-foreground text-right truncate max-w-[130px]" title={liveClient.correo || ''}>
                    {liveClient.correo || <span className="text-muted-foreground/50 italic">Sin registrar</span>}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Cake className="h-3.5 w-3.5 text-muted-foreground/70" /> Cumpleaños
                  </span>
                  <span className="font-medium text-foreground text-right">
                    {liveClient.fecha_nacimiento ? (
                      <span className="flex items-center gap-1">
                        {formatDate(liveClient.fecha_nacimiento)}
                        {isBirthdayMonth && <span title="¡Mes de cumpleaños!">🎉</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50 italic">Sin registrar</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" /> Registro
                  </span>
                  <span className="font-medium text-foreground text-right">
                    {liveClient.creado_en ? formatDate(liveClient.creado_en) : <span className="text-muted-foreground/50 italic">Sin registrar</span>}
                  </span>
                </div>
              </div>

              {/* Notas (si existen) */}
              {liveClient.notas && (
                <div className="rounded-xl bg-[#C5A880]/10 border border-[#C5A880]/20 p-2.5 text-xs">
                  <p className="text-[10px] font-bold text-[#C5A880] uppercase tracking-wider mb-1 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Notas
                  </p>
                  <p className="text-foreground/90 italic leading-snug line-clamp-3 hover:line-clamp-none transition-all">
                    {liveClient.notas}
                  </p>
                </div>
              )}

              {/* Pase Alfa Mini Card (Minimalista & Elegante con Nivel Dinámico) */}
              <div className="rounded-xl bg-gradient-to-br from-[#10172b] to-[#1c2847] border border-[#C5A880]/30 p-3 text-white space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#C5A880] uppercase tracking-wider flex items-center gap-1">
                    <Scissors className="h-3 w-3" /> Pase Alfa
                  </span>
                  <Badge
                    className="text-[10px] px-2 py-0 h-4 font-bold border-none shadow-xs"
                    style={{
                      backgroundColor: clientLevelInfo.color,
                      color: clientLevelInfo.colorTexto || '#FFFFFF',
                    }}
                  >
                    {clientLevel}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>Visitas acumuladas</span>
                    <span className="font-bold text-[#C5A880]">{stamps} / 10</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#C5A880] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (stamps / 10) * 100)}%` }}
                    />
                  </div>
                </div>

                {clientLevelInfo.nextNombre && (
                  <div className="text-[10px] text-slate-300 bg-white/5 rounded px-2 py-1 flex items-center justify-between">
                    <span className="text-slate-400">Próximo rango:</span>
                    <span className="font-semibold text-amber-300">
                      {clientLevelInfo.faltanVisitas > 0 ? `${clientLevelInfo.faltanVisitas} visitas` : ''}
                      {clientLevelInfo.faltanVisitas > 0 && clientLevelInfo.faltaGasto > 0 ? ' o ' : ''}
                      {clientLevelInfo.faltaGasto > 0 ? `$${clientLevelInfo.faltaGasto.toLocaleString('es-MX')}` : ''}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-300 border-t border-white/10">
                  <span className="flex items-center gap-1 text-slate-400">
                    <Sparkles className="h-3 w-3 text-[#C5A880]" /> Balance
                  </span>
                  <span className="font-bold text-[#C5A880]">{alfaCoins} ALFA COINS</span>
                </div>

                {freeCutReady && (
                  <div className="mt-1 text-[10px] font-bold bg-[#C5A880]/20 text-[#C5A880] border border-[#C5A880]/40 rounded px-1.5 py-0.5 text-center">
                    ✨ ¡10.° Corte Gratis Listo!
                  </div>
                )}
              </div>

              {/* Estado de App Móvil */}
              {hasAppLinked ? (
                <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span>App Móvil Activa</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-muted/40 border border-border/50 text-muted-foreground text-[11px]">
                  <Smartphone className="h-3 w-3 text-muted-foreground/60" />
                  <span>Sin cuenta en App Móvil</span>
                </div>
              )}
            </div>

            {/* Botones de acción rápida al pie */}
            <div className="pt-2 space-y-2">
              {liveClient.telefono && canViewPhone && (
                <a
                  href={`https://wa.me/${!String(liveClient.telefono).trim().startsWith('+') && liveClient.telefono.replace(/\D/g, '').length === 10 ? '52' + liveClient.telefono.replace(/\D/g, '') : liveClient.telefono.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full"
                >
                  <Button variant="outline" size="sm" className="w-full text-xs font-semibold gap-1.5 hover:border-[#25D366]/50 hover:text-[#25D366]">
                    <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" /> Enviar WhatsApp
                  </Button>
                </a>
              )}
              {onNewReservation && (
                <Button
                  size="sm"
                  onClick={onNewReservation}
                  className="w-full text-xs font-semibold gap-1.5 btn-vatos-alfa rounded-xl"
                >
                  <Calendar className="h-3.5 w-3.5" /> Nueva Cita
                </Button>
              )}
            </div>
          </div>

          {/* History Tabs */}
          <div className="md:col-span-3 flex flex-col min-h-0 min-w-0 p-3.5 sm:p-5 md:overflow-hidden">
            <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0 min-w-0">
              <TabsList className="w-full justify-start mb-3 bg-muted/40 p-1 rounded-xl h-auto flex-wrap gap-1 border border-border/40 shrink-0 sticky top-0 z-10 md:static backdrop-blur-md bg-background/90">
                <TabsTrigger value="general" className="rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-xs">
                  Información General
                </TabsTrigger>
                <TabsTrigger value="reservations" className="rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-xs">
                  Historial de Reservas
                </TabsTrigger>
                <TabsTrigger value="sales" className="rounded-lg text-xs font-semibold data-[state=active]:bg-background data-[state=active]:shadow-xs">
                  Historial de Compras
                </TabsTrigger>
                <TabsTrigger
                  value="app"
                  className="rounded-lg text-xs font-semibold flex items-center gap-1.5 text-[#C5A880] hover:text-[#d4ba94] data-[state=active]:text-[#C5A880] data-[state=active]:bg-background data-[state=active]:shadow-xs"
                >
                  <Smartphone className="h-3.5 w-3.5 text-[#C5A880]" />
                  <span>App & Pase Alfa</span>
                  {freeCutReady && (
                    <span className="h-2 w-2 rounded-full bg-[#C5A880] animate-ping" />
                  )}
                </TabsTrigger>
              </TabsList>

              <div className="md:flex-1 md:overflow-y-auto md:custom-scrollbar md:pr-1">
                <TabsContent value="general" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    <StatCard title="Citas totales" value={reservationsLoading ? '...' : totalAppointments} icon={Calendar} />
                    <StatCard title="Citas asistidas" value={reservationsLoading ? '...' : attendedAppointments} icon={UserCheck} />
                    <StatCard title="Citas no asistidas" value={reservationsLoading ? '...' : unattendedAppointments} icon={UserX} />
                    <StatCard title="Citas canceladas" value={reservationsLoading ? '...' : cancelledAppointments} icon={XCircle} />
                    <StatCard title="Gasto Total" value={salesLoading ? '...' : `$${totalSpent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={PiggyBank} description={`${validSales.length} compras`} />
                    <StatCard title="ALFA COINS (App)" value={alfaCoins} icon={Sparkles} description="Monedas digitales en app" />
                    <StatCard title="Pase Alfa" value={`${stamps} / 10`} icon={Scissors} description={freeCutReady ? '¡10.° Corte DISPONIBLE!' : `Faltan ${Math.max(0, 10 - stamps)} visitas`} />
                    <StatCard title="Nivel del Cliente" value={clientLevel} icon={Award} description="Categoría Pase Alfa Club" />
                  </div>
                </TabsContent>
                <TabsContent value="reservations" className="m-0 h-full">
                  {reservationsLoading ? <Skeleton className="h-60 w-full" /> : (
                    sortedReservations.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                              <SortableHeader label="Fecha" sortKey="fecha" config={resSortConfig} onSort={handleResSort} />
                              <SortableHeader label="Servicio" sortKey="servicio" config={resSortConfig} onSort={handleResSort} />
                              <SortableHeader label="Profesional" sortKey="profesional" config={resSortConfig} onSort={handleResSort} />
                              <SortableHeader label="Estado" sortKey="estado" config={resSortConfig} onSort={handleResSort} />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedReservations.map(res => (
                              <TableRow key={res.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                <TableCell className="py-1.5 px-3 text-xs">{formatDate(res.fecha, true, res.hora_inicio)}</TableCell>
                                <TableCell className="py-1.5 px-3 text-xs">{res.servicio}</TableCell>
                                <TableCell className="py-1.5 px-3 text-xs">{(() => {
                                  const profId = res.items?.find((i: any) => i.barbero_id)?.barbero_id || res.barbero_id;
                                  return professionalMap.get(profId) || profId || 'Sin asignar';
                                })()}</TableCell>
                                <TableCell className="py-1.5 px-3 text-xs"><Badge variant="outline" className="text-[10px]">{res.estado}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-10">No hay reservas registradas.</p>
                    )
                  )}
                </TabsContent>

                <TabsContent value="sales" className="m-0 h-full">
                  {salesLoading ? <Skeleton className="h-60 w-full" /> : (
                    sortedSales.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                              <SortableHeader label="Fecha" sortKey="fecha" config={salesSortConfig} onSort={handleSalesSort} />
                              <TableHead className="py-1 px-3 text-xs font-semibold">Items</TableHead>
                              <SortableHeader label="Profesional" sortKey="profesional" config={salesSortConfig} onSort={handleSalesSort} />
                              <SortableHeader label="Método de pago" sortKey="metodo_pago" config={salesSortConfig} onSort={handleSalesSort} />
                              <SortableHeader label="Total" sortKey="total" config={salesSortConfig} onSort={handleSalesSort} align="right" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedSales.map(sale => {
                              const professionalNames = Array.from(
                                new Set(sale.items?.map(item => (item.barbero_id ? professionalMap.get(item.barbero_id) : null) || (item as any).barbero_nombre || (item as any).barbero || (sale as any).barbero_nombre || (sale as any).profesional_nombre).filter(Boolean))
                              ).join(', ') || 'N/A';

                              return (
                                <TableRow key={sale.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                  <TableCell className="py-1.5 px-3 text-xs">{formatDate(sale.fecha_hora_venta, true)}</TableCell>
                                  <TableCell className="py-1.5 px-3 text-xs">
                                    <ul className="list-disc pl-4 text-xs">
                                      {sale.items?.map((item, index) => (
                                        <li key={index}>{item.cantidad}x {item.nombre}</li>
                                      ))}
                                    </ul>
                                  </TableCell>
                                  <TableCell className="py-1.5 px-3 text-xs">{professionalNames}</TableCell>
                                  <TableCell className="py-1.5 px-3 text-xs capitalize">{sale.metodo_pago}</TableCell>
                                  <TableCell className="py-1.5 px-3 text-xs text-right font-semibold">${(sale.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-10">No hay ventas registradas.</p>
                    )
                  )}
                </TabsContent>

                <TabsContent value="app" className="m-0 space-y-4">
                  {/* Tarjeta Digital Pase Alfa */}
                  <div className="bg-[#0F172A] border border-[#C5A880]/30 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#C5A880]/20 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#C5A880] tracking-wider uppercase">Club de Lealtad</span>
                          <Badge className="bg-[#C5A880]/20 text-[#C5A880] border-[#C5A880]/40 text-xs">
                            {clientLevel}
                          </Badge>
                        </div>
                        <h4 className="text-xl font-bold text-white mt-1">Pase Alfa Digital • {liveClient.nombre}</h4>
                        <p className="text-xs text-gray-300">
                          {stamps} de 10 visitas registradas en sucursal Sombrerete
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="bg-[#1E293B] border border-[#C5A880]/30 rounded-xl px-4 py-2 text-center">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Balance ALFA COINS</p>
                          <p className="text-lg font-black text-[#C5A880] flex items-center justify-center gap-1">
                            <Sparkles className="h-4 w-4 text-[#C5A880]" />
                            {alfaCoins}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Grilla visual de 10 casillas de visitas */}
                    <div className="my-4">
                      <p className="text-xs font-semibold text-gray-300 mb-2">Progreso de Visitas (La Décima va por la Casa):</p>
                      <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                        {Array.from({ length: 10 }).map((_, idx) => {
                          const isFilled = idx < stamps;
                          const isTenth = idx === 9;
                          return (
                            <div
                              key={idx}
                              className={cn(
                                'h-12 rounded-xl flex flex-col items-center justify-center border font-bold text-xs transition-all shadow-sm',
                                isFilled
                                  ? isTenth
                                    ? 'bg-[#C5A880] border-[#C5A880] text-black shadow-[#C5A880]/30'
                                    : 'bg-[#C5A880] border-[#C5A880] text-black'
                                  : isTenth
                                  ? 'bg-[#C5A880]/15 border-dashed border-[#C5A880]/50 text-[#C5A880]'
                                  : 'bg-[#1E293B] border-white/10 text-gray-400'
                              )}
                            >
                              {isFilled ? (
                                isTenth ? (
                                  <>
                                    <Sparkles className="h-4 w-4" />
                                    <span className="text-[9px]">GRATIS</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-4 w-4 stroke-[3]" />
                                    <span className="text-[9px]">{idx + 1}</span>
                                  </>
                                )
                              ) : isTenth ? (
                                <>
                                  <Scissors className="h-4 w-4" />
                                  <span className="text-[9px]">10.º</span>
                                </>
                              ) : (
                                <span>{idx + 1}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Banner si el corte gratis está disponible */}
                    {freeCutReady && (
                      <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border border-[#C5A880]/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-[#C5A880]/20 flex items-center justify-center text-[#C5A880]">
                            <Sparkles className="h-5 w-5 animate-bounce" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#C5A880]">¡10.° Corte de Cortesía Disponible!</p>
                            <p className="text-xs text-gray-300">
                              El cliente completó sus visitas acumuladas y puede disfrutar de su corte gratis hoy.
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-[#C5A880] text-black font-bold">Elegible</Badge>
                      </div>
                    )}

                    {/* Alerta de Cumpleaños si aplica */}
                    {isBirthdayMonth && (
                      <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-[#10172b] to-[#1c2847] border border-blue-500/40 flex items-center gap-3">
                        <Gift className="h-5 w-5 text-blue-400 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-blue-300">🎉 ¡Mes de Cumpleaños del Cliente!</p>
                          <p className="text-[11px] text-gray-300">
                            Tiene activo su beneficio de cortesía de cumpleaños en la app móvil.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Historial de Canjes de Beneficios con QR */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <QrCode className="h-4 w-4 text-primary" />
                            Historial de Canjes de Beneficios
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Registro de folios y promociones escaneadas en recepción para este cliente.
                          </CardDescription>
                        </div>
                        {redemptions && redemptions.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {redemptions.length} canjes
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {redemptionsLoading ? (
                        <Skeleton className="h-28 w-full" />
                      ) : redemptions && redemptions.length > 0 ? (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                <TableHead className="py-1 px-3 text-xs font-semibold">Fecha de Canje</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold">Beneficio</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold">Folio QR</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold">Sucursal</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold text-right">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {redemptions.map((redemption: any) => (
                                <TableRow key={redemption.id || redemption.folio} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                  <TableCell className="py-1.5 px-3 text-xs font-medium">
                                    {formatDate(redemption.fechaCanje || redemption.canjeadoEn || redemption.fechaCreacion, true)}
                                  </TableCell>
                                  <TableCell className="py-1.5 px-3 font-semibold text-xs text-primary">
                                    {redemption.benefitTitle || redemption.titulo || 'Beneficio Alfa'}
                                  </TableCell>
                                  <TableCell className="py-1.5 px-3 font-mono text-xs text-muted-foreground">
                                    {redemption.folio}
                                  </TableCell>
                                  <TableCell className="py-1.5 px-3 text-xs">
                                    {redemption.sucursal || 'Sombrerete'}
                                  </TableCell>
                                  <TableCell className="py-1.5 px-3 text-right">
                                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]">
                                      Canjeado
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground space-y-2">
                          <Gift className="h-8 w-8 mx-auto text-muted-foreground/40" />
                          <p className="text-xs">No hay canjes de beneficios registrados aún para este cliente.</p>
                          <p className="text-[11px] text-muted-foreground/70">
                            Cuando el cliente presente su código QR de cumpleaños, amigo o pase alfa y sea escaneado en recepción, se registrará aquí de forma automática.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* MODAL EDITAR CLIENTE */}
    <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
      <DialogContent
        hideCloseButton={true}
        className="sm:max-w-xl p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background"
      >
        {/* Cabecera Oficial Vatos Alfa */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <Pencil className="h-4 w-4 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">
                  Editar Cliente
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Modifica los datos del cliente.
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          <NewClientForm
            client={liveClient}
            onFormSubmit={() => {
              setIsEditModalOpen(false);
              onClientUpdated?.(liveClient);
            }}
            onCancel={() => {
              setIsEditModalOpen(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
