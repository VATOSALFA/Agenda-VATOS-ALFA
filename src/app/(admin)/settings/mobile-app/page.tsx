'use client';

import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { db } from '@/lib/firebase-client';
import { collection, onSnapshot } from 'firebase/firestore';
import type { Client, CanjeBeneficio } from '@/lib/types';
import { isClientWithApp } from '@/lib/client-app-helper';
import { ClientDetailModal } from '@/components/clients/client-detail-modal';
import { PaseAlfaManager } from '@/components/admin/pase-alfa-manager';
import { NivelesAlfaManager } from '@/components/admin/niveles-alfa-manager';
import { GaleriaCortesManager } from '@/components/admin/galeria-cortes-manager';
import { AppDownloadLinksCard } from '@/components/admin/app-download-links-card';
import { BuzonClientesManager } from '@/components/admin/buzon-clientes-manager';
import PromotionsManager from '../promotions/promotions-manager';
import { cn } from '@/lib/utils';
import {
    Loader2,
    Users,
    Smartphone,
    Scissors,
    Sparkles,
    QrCode,
    BarChart3,
    Download,
    ArrowUpRight,
    Search,
    Crown,
    MessageSquareWarning,
} from 'lucide-react';

export default function MobileAppSettingsPage() {
    // Tab activo controlado
    const [activeTab, setActiveTab] = useState('pase_alfa');

    // -- MÉTRICAS & USO DE LA APP MÓVIL --
    const { data: clientsList = [], loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
    const { data: canjesList = [], loading: canjesLoading } = useFirestoreQuery<CanjeBeneficio>('canjes_beneficios');
    const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);
    const [selectedClientForDetail, setSelectedClientForDetail] = useState<Client | null>(null);
    const [searchAppClient, setSearchAppClient] = useState('');

    useEffect(() => {
        const colRef = collection(db, 'settings', 'app_movil', 'opiniones');
        const unsub = onSnapshot(
            colRef,
            (snap) => {
                const count = snap.docs.filter((d) => d.data()?.estado !== 'atendido').length;
                setPendingFeedbackCount(count);
            },
            () => {
                setPendingFeedbackCount(0);
            }
        );
        return () => unsub();
    }, []);

    const appClients = useMemo(() => {
        if (!clientsList) return [];
        return clientsList.filter(c => isClientWithApp(c));
    }, [clientsList]);

    const activePassClients = useMemo(() => {
        if (!clientsList) return [];
        return clientsList.filter(c => isClientWithApp(c) && Number(c.cortes_acumulados || 0) > 0);
    }, [clientsList]);

    const freeCutEligibleClients = useMemo(() => {
        if (!clientsList) return [];
        return clientsList.filter(c => isClientWithApp(c) && Boolean(c.corte_gratis_disponible || Number(c.cortes_acumulados || 0) >= 9));
    }, [clientsList]);

    const totalCoinsInCirculation = useMemo(() => {
        if (!clientsList) return 0;
        return clientsList.reduce((acc, c) => acc + (isClientWithApp(c) ? Number(c.alfaCoins || (c as any).alfa_coins || c.puntosLealtad || (c as any).puntos || 0) : 0), 0);
    }, [clientsList]);

    const filteredAppClients = useMemo(() => {
        if (!searchAppClient.trim()) return appClients;
        const q = searchAppClient.toLowerCase().trim();
        return appClients.filter(c =>
            `${c.nombre || ''} ${c.apellido || ''}`.toLowerCase().includes(q) ||
            (c.telefono && c.telefono.includes(q)) ||
            (c.numero_cliente && String(c.numero_cliente).includes(q))
        );
    }, [appClients, searchAppClient]);

    return (
        <div className="space-y-5 max-w-7xl pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">App Móvil VATOS ALFA</h2>
                    <p className="text-xs text-muted-foreground">
                        Gestiona el programa Pase Alfa Club, niveles y rangos de lealtad, buzón de opiniones, efectos por temporada y métricas de la app móvil.
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto p-1 gap-1">
                    <TabsTrigger value="pase_alfa" className="text-xs sm:text-sm py-1.5 px-1 sm:px-2.5">Pase Alfa</TabsTrigger>
                    <TabsTrigger value="niveles" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm py-1.5 px-1 sm:px-2.5">
                        <Crown className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                        <span className="truncate">Niveles & Rangos</span>
                    </TabsTrigger>
                    <TabsTrigger value="promociones" className="text-xs sm:text-sm py-1.5 px-1 sm:px-2.5">Promociones</TabsTrigger>
                    <TabsTrigger value="buzon" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm py-1.5 px-1 sm:px-2.5">
                        <MessageSquareWarning className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                        <span className="truncate">Buzón & Quejas</span>
                        {pendingFeedbackCount > 0 && (
                            <Badge className="ml-0.5 text-[10px] px-1 py-0 h-3.5 bg-amber-500 text-black font-black font-sans">
                                {pendingFeedbackCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="metricas" className="flex items-center justify-center gap-1 font-bold text-xs sm:text-sm py-1.5 px-1 sm:px-2.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:inline" />
                        <span className="truncate">Uso & Descargas</span>
                        {appClients.length > 0 && (
                            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 py-0 h-3.5 bg-[#C5A880]/20 text-[#C5A880] border border-[#C5A880]/40 font-sans">
                                {appClients.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* PASE ALFA TAB (SINCRONIZADO EN ESPEJO CON SITIO WEB) */}
                <TabsContent value="pase_alfa" className="mt-6 space-y-6">
                    <AppDownloadLinksCard />
                    <PaseAlfaManager />
                    <GaleriaCortesManager />
                </TabsContent>

                {/* NIVELES & RANGOS TAB (ADMINISTRACIÓN DE CRITERIOS VISITAS/GASTO Y CLUB ALFA) */}
                <TabsContent value="niveles" className="mt-6 space-y-6">
                    <NivelesAlfaManager />
                </TabsContent>

                {/* PROMOCIONES TAB (SINCRONIZADO EN ESPEJO CON SITIO WEB Y /settings/promotions) */}
                <TabsContent value="promociones" className="mt-6 space-y-6">
                    <PromotionsManager hideHeader />
                </TabsContent>

                {/* BUZÓN DE OPINIONES, SUGERENCIAS Y QUEJAS DE CLIENTES */}
                <TabsContent value="buzon" className="mt-6 space-y-6">
                    <BuzonClientesManager />
                </TabsContent>

                {/* MÉTRICAS & USO TAB */}
                <TabsContent value="metricas" className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
                    {/* Tarjetas de Estadísticas Principales */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                        <div className="rounded-xl border border-border/60 bg-card p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1.5 mb-1">
                                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">Clientes con App</span>
                                <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/70 shrink-0" />
                            </div>
                            <div>
                                <div className="text-lg sm:text-2xl font-bold tracking-tight text-foreground font-sans">
                                    {clientsLoading ? '...' : appClients.length}
                                </div>
                                <p className="text-[10px] text-muted-foreground/70 truncate hidden sm:block mt-0.5">
                                    Cuentas en app móvil
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-card p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1.5 mb-1">
                                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">Pases Alfa Activos</span>
                                <Scissors className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/70 shrink-0" />
                            </div>
                            <div>
                                <div className="text-lg sm:text-2xl font-bold tracking-tight text-foreground font-sans">
                                    {clientsLoading ? '...' : activePassClients.length}
                                </div>
                                <p className="text-[10px] text-muted-foreground/70 truncate hidden sm:block mt-0.5">
                                    Acumulando visitas
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-card p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1.5 mb-1">
                                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">Cortes Gratis Listos</span>
                                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#C5A880] shrink-0" />
                            </div>
                            <div>
                                <div className="text-lg sm:text-2xl font-bold tracking-tight text-foreground font-sans">
                                    {clientsLoading ? '...' : freeCutEligibleClients.length}
                                </div>
                                <p className="text-[10px] text-muted-foreground/70 truncate hidden sm:block mt-0.5">
                                    10.° corte disponible
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-card p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1.5 mb-1">
                                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">Canjes QR</span>
                                <QrCode className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/70 shrink-0" />
                            </div>
                            <div>
                                <div className="text-lg sm:text-2xl font-bold tracking-tight text-foreground font-sans">
                                    {canjesLoading ? '...' : canjesList.length}
                                </div>
                                <p className="text-[10px] text-muted-foreground/70 truncate hidden sm:block mt-0.5">
                                    Escaneados en recepción
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Guía y Accesos a Consolas Oficiales para Descargas Totales */}
                    <div className="rounded-xl border border-border/60 bg-card p-2.5 sm:p-3.5 shadow-xs space-y-2">
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/40">
                            <div className="flex items-center gap-1.5">
                                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <h4 className="text-xs sm:text-sm font-bold text-foreground">Descargas en Tiendas Oficiales</h4>
                            </div>
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">Consolas oficiales de distribución</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {/* Google Play */}
                            <a
                                href="https://play.google.com/console"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg border border-border/50 bg-muted/15 hover:bg-muted/30 hover:border-[#202A49]/40 transition-all text-xs group"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-foreground truncate text-[11px] sm:text-xs">Google Play Console</p>
                                        <p className="text-[10px] text-muted-foreground truncate">Instalaciones en Android</p>
                                    </div>
                                </div>
                                <ArrowUpRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0 ml-1.5" />
                            </a>

                            {/* App Store */}
                            <a
                                href="https://appstoreconnect.apple.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg border border-border/50 bg-muted/15 hover:bg-muted/30 hover:border-[#202A49]/40 transition-all text-xs group"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-foreground truncate text-[11px] sm:text-xs">App Store Connect</p>
                                        <p className="text-[10px] text-muted-foreground truncate">Instalaciones en iOS / iPhone</p>
                                    </div>
                                </div>
                                <ArrowUpRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0 ml-1.5" />
                            </a>

                            {/* Firebase Analytics */}
                            <a
                                href="https://console.firebase.google.com/project/agenda-1ae08/analytics"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-2 sm:p-2.5 rounded-lg border border-border/50 bg-muted/15 hover:bg-muted/30 hover:border-[#202A49]/40 transition-all text-xs group"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <BarChart3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-foreground truncate text-[11px] sm:text-xs">Firebase Analytics</p>
                                        <p className="text-[10px] text-muted-foreground truncate">Usuarios activos en tiempo real</p>
                                    </div>
                                </div>
                                <ArrowUpRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0 ml-1.5" />
                            </a>
                        </div>
                    </div>

                    {/* Tabla de Clientes Activos en la App */}
                    <Card className="border border-border/60 shadow-xs overflow-hidden">
                        <CardHeader className="p-3 sm:p-3.5 border-b border-border/40">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div>
                                    <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                                        <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        Clientes Registrados en la App Móvil
                                    </CardTitle>
                                    <CardDescription className="text-[11px] mt-0.5">
                                        {appClients.length} {appClients.length === 1 ? 'cliente activo' : 'clientes activos'} en la app móvil.
                                    </CardDescription>
                                </div>

                                <div className="relative w-full sm:w-60">
                                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={searchAppClient}
                                        onChange={(e) => setSearchAppClient(e.target.value)}
                                        placeholder="Buscar por nombre o teléfono..."
                                        className="h-7 sm:h-8 pl-8 text-xs rounded-lg"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {clientsLoading ? (
                                <div className="p-6 text-center text-xs text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                                    Cargando clientes...
                                </div>
                            ) : filteredAppClients.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-border/50 bg-muted/20 text-muted-foreground text-left text-[11px]">
                                                <th className="p-2.5 sm:p-3 font-semibold whitespace-nowrap">Cliente</th>
                                                <th className="p-2.5 sm:p-3 font-semibold whitespace-nowrap">Teléfono</th>
                                                <th className="p-2.5 sm:p-3 font-semibold whitespace-nowrap">Nivel</th>
                                                <th className="p-2.5 sm:p-3 font-semibold whitespace-nowrap">Pase Alfa</th>
                                                <th className="p-2.5 sm:p-3 font-semibold whitespace-nowrap">AlfaCoins</th>
                                                <th className="p-2.5 sm:p-3 font-semibold text-right whitespace-nowrap">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/30">
                                            {filteredAppClients.map((client) => {
                                                const clientPhoto = client.fotoUrl || client.avatarUrl || (client as any).foto_perfil_url;
                                                const stamps = Number(client.cortes_acumulados ?? client.cortesAcumulados ?? 0);
                                                const coins = Number(client.alfaCoins ?? (client as any).alfa_coins ?? client.puntosLealtad ?? (client as any).puntos ?? 0);
                                                const level = isClientWithApp(client) ? (client.nivel || (stamps >= 8 ? 'Alfa Black VIP' : stamps >= 4 ? 'Alfa Gold' : 'Alfa Member')) : 'Sin Nivel';
                                                const freeCut = Boolean(client.corte_gratis_disponible ?? stamps >= 9);

                                                return (
                                                    <tr key={client.id} className="hover:bg-muted/15 transition-colors">
                                                        <td className="p-2.5 sm:p-3">
                                                            <div className="flex items-center gap-2">
                                                                <Avatar className="h-7 w-7 border border-border/60 shrink-0">
                                                                    <AvatarImage src={clientPhoto} alt={client.nombre || 'Cliente'} />
                                                                    <AvatarFallback className="text-[10px] font-bold bg-muted text-muted-foreground font-sans">
                                                                        {client.nombre
                                                                            ? `${client.nombre.charAt(0)}${client.apellido?.charAt(0) || ''}`
                                                                            : `#${client.numero_cliente || 'CL'}`}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div className="min-w-0">
                                                                    <p className="font-semibold text-foreground text-xs truncate max-w-[120px] sm:max-w-none">
                                                                        {client.nombre
                                                                            ? `${client.nombre} ${client.apellido || ''}`.trim()
                                                                            : `Cliente #${client.numero_cliente || client.id.slice(0, 6)}`}
                                                                    </p>
                                                                    <span className="text-[10px] font-mono text-muted-foreground block">
                                                                        #{client.numero_cliente || client.id.slice(0, 6)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-2.5 sm:p-3 font-mono text-muted-foreground text-[11px]">
                                                            {client.telefono || 'Sin teléfono'}
                                                        </td>
                                                        <td className="p-2.5 sm:p-3 whitespace-nowrap">
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    "whitespace-nowrap text-[10px] sm:text-[11px] font-sans font-medium py-0.5 px-2 rounded-full",
                                                                    level.includes('Black') || level.includes('VIP')
                                                                        ? "border-slate-700 bg-slate-900/90 text-slate-200"
                                                                        : level.includes('Gold')
                                                                        ? "border-[#C5A880]/50 bg-[#C5A880]/15 text-[#C5A880]"
                                                                        : "border-[#C5A880]/40 bg-[#C5A880]/10 text-[#C5A880]"
                                                                )}
                                                            >
                                                                {level}
                                                            </Badge>
                                                        </td>
                                                        <td className="p-2.5 sm:p-3">
                                                            <div className="space-y-1 max-w-[120px]">
                                                                <div className="flex items-center justify-between text-[10px] font-sans">
                                                                    <span className="font-semibold">{stamps}/10</span>
                                                                    {freeCut && (
                                                                        <span className="text-[9px] font-bold text-[#C5A880]">¡Corte Listo!</span>
                                                                    )}
                                                                </div>
                                                                <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                                                                    <div
                                                                        className="bg-[#C5A880] h-full rounded-full transition-all"
                                                                        style={{ width: `${Math.min(100, (stamps / 10) * 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-2.5 sm:p-3 font-semibold text-[#C5A880] font-sans text-xs">
                                                            <span className="flex items-center gap-1">
                                                                <Sparkles className="h-3 w-3 text-[#C5A880]" />
                                                                {coins}
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 sm:p-3 text-right">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => setSelectedClientForDetail(client)}
                                                                className="h-6 text-[11px] px-2 font-sans"
                                                            >
                                                                Ver Ficha
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-6 text-center text-muted-foreground space-y-1.5">
                                    <Smartphone className="h-8 w-8 mx-auto text-muted-foreground/40" />
                                    <p className="text-xs font-semibold text-foreground">
                                        {searchAppClient ? 'No se encontraron clientes' : 'Aún no hay clientes registrados en la App Móvil'}
                                    </p>
                                    <p className="text-[11px] max-w-sm mx-auto text-muted-foreground">
                                        Al iniciar sesión con su celular en la app de VATOS ALFA, se sincronizarán aquí automáticamente.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Modal de Detalle de Cliente */}
            {selectedClientForDetail && (
                <ClientDetailModal
                    client={selectedClientForDetail}
                    isOpen={Boolean(selectedClientForDetail)}
                    onOpenChange={(open) => {
                        if (!open) setSelectedClientForDetail(null);
                    }}
                    onNewReservation={() => setSelectedClientForDetail(null)}
                />
            )}
        </div>
    );
}
