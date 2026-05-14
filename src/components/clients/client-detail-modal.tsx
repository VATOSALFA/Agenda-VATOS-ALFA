
'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ShoppingCart, User, Phone, Mail, Cake, MessageSquare, PlusCircle, VenetianMask, UserCheck, UserX, PiggyBank, XCircle, type LucideIcon } from 'lucide-react';
import type { Client, Profesional } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';

interface ClientDetailModalProps {
  client: Client;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onNewReservation: () => void;
}

interface Reservation {
  id: string;
  fecha: string;
  servicio: string;
  barbero_id: string;
  estado: string;
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

const InfoRow = ({ icon: Icon, label, value }: { icon: LucideIcon, label: string, value: string | undefined | null }) => (
  <div className="flex items-start gap-3">
    <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
    <div>
      <p className="font-semibold text-muted-foreground">{label}</p>
      <p className="text-card-foreground">{value || 'No registrado'}</p>
    </div>
  </div>
);

const StatCard = ({ title, value, icon: Icon, description }: { title: string, value: string | number, icon: LucideIcon, description?: string }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </CardContent>
  </Card>
);

export function ClientDetailModal({ client, isOpen, onOpenChange, onNewReservation }: ClientDetailModalProps) {
  const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>(
    'reservas',
    isOpen ? where('cliente_id', '==', client.id) : undefined
  );

  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
    'ventas',
    isOpen ? where('cliente_id', '==', client.id) : undefined
  );

  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', isOpen);

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
        const dateA = a.fecha ? new Date(a.fecha).getTime() : 0;
        const dateB = b.fecha ? new Date(b.fecha).getTime() : 0;
        return (dateA - dateB) * dir;
      }
      if (key === 'servicio') return (a.servicio || '').localeCompare(b.servicio || '') * dir;
      if (key === 'profesional') {
        const nameA = professionalMap.get(a.barbero_id) || '';
        const nameB = professionalMap.get(b.barbero_id) || '';
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
        const getNames = (s: Sale) => Array.from(new Set(s.items?.map(i => i.barbero_id ? professionalMap.get(i.barbero_id) : '').filter(Boolean))).join(', ');
        return getNames(a).localeCompare(getNames(b)) * dir;
      }
      return 0;
    });
    return sorted;
  }, [sales, salesSortConfig, professionalMap]);


  const formatDate = (date: any, includeTime = false) => {
    if (!date) return 'N/A';
    let dateObj: Date;
    if (date.seconds) { // Firestore Timestamp
      dateObj = new Date(date.seconds * 1000);
    } else if (typeof date === 'string') { // ISO String
      dateObj = parseISO(date);
    } else {
      return 'Fecha inválida';
    }

    if (isNaN(dateObj.getTime())) return 'Fecha inválida';

    return format(dateObj, includeTime ? 'PPP p' : 'PPP', { locale: es });
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

  const attendedAppointments = client.citas_asistidas || (reservationsLoading ? 0 : reservations.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado').length);
  const unattendedAppointments = client.citas_no_asistidas || (reservationsLoading ? 0 : reservations.filter(r => r.estado === 'No asiste').length);
  const cancelledAppointments = client.citas_canceladas || (reservationsLoading ? 0 : reservations.filter(r => r.estado === 'Cancelado').length);
  const totalAppointments = client.citas_totales || (reservationsLoading ? 0 : reservations.length);

  const SortableHeader = ({ label, sortKey, config, onSort, className, align = 'left' }: { 
    label: string; 
    sortKey: string; 
    config: { key: string; direction: 'asc' | 'desc' }; 
    onSort: (key: string) => void;
    className?: string;
    align?: 'left' | 'right' | 'center';
  }) => (
    <TableHead className={cn(className, align === 'right' && "text-right")}>
      <Button
        variant="ghost"
        className={cn(
          "h-auto p-0 font-bold hover:bg-transparent flex items-center gap-2",
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <User className="h-6 w-6 text-primary" /> Ficha de Cliente: {client.nombre} {client.apellido}
          </DialogTitle>
          <DialogDescription>
            Información detallada, historial y acciones para este cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-4 gap-6 flex-grow overflow-hidden py-4">
          {/* Client Info and Actions */}
          <div className="md:col-span-1 space-y-6 bg-card/50 p-6 rounded-lg overflow-y-auto">
            <h3 className="text-xl font-bold text-primary">{client.nombre} {client.apellido}</h3>
            <InfoRow icon={User} label="Número de cliente" value={client.numero_cliente || 'N/A'} />
            <InfoRow icon={Phone} label="Teléfono" value={canViewPhone ? client.telefono : '****-****'} />
            <InfoRow icon={Mail} label="Correo Electrónico" value={client.correo} />
            <InfoRow icon={Cake} label="Fecha de Nacimiento" value={client.fecha_nacimiento ? formatDate(client.fecha_nacimiento) : null} />
            <InfoRow icon={Calendar} label="Cliente desde" value={client.creado_en ? formatDate(client.creado_en) : null} />
            <InfoRow icon={MessageSquare} label="Notas" value={client.notas} />

            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              {client.telefono && canViewPhone && (
                <a href={`https://wa.me/${client.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full">
                    <VenetianMask className="mr-2 h-4 w-4" /> Enviar WhatsApp
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* History Tabs */}
          <div className="md:col-span-3 flex flex-col min-h-0 min-w-0">
            <Tabs defaultValue="general" className="flex-grow flex flex-col min-h-0 min-w-0">
              <TabsList className="w-full justify-start mb-4 bg-muted/50 p-1 h-auto flex-wrap">
                <TabsTrigger value="general">Información General</TabsTrigger>
                <TabsTrigger value="reservations">Historial de Reservas</TabsTrigger>
                <TabsTrigger value="sales">Historial de Compras</TabsTrigger>
              </TabsList>

              <div className="flex-grow pr-2 overflow-y-auto overflow-x-hidden">
                <TabsContent value="general" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Citas totales" value={reservationsLoading ? '...' : totalAppointments} icon={Calendar} />
                    <StatCard title="Citas asistidas" value={reservationsLoading ? '...' : attendedAppointments} icon={UserCheck} />
                    <StatCard title="Citas no asistidas" value={reservationsLoading ? '...' : unattendedAppointments} icon={UserX} />
                    <StatCard title="Citas canceladas" value={reservationsLoading ? '...' : cancelledAppointments} icon={XCircle} />
                    <StatCard title="Gasto Total" value={salesLoading ? '...' : `$${totalSpent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={PiggyBank} description={`${validSales.length} compras`} />
                  </div>
                </TabsContent>
                <TabsContent value="reservations" className="m-0 h-full">
                  {reservationsLoading ? <Skeleton className="h-60 w-full" /> : (
                    sortedReservations.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <SortableHeader label="Fecha" sortKey="fecha" config={resSortConfig} onSort={handleResSort} />
                              <SortableHeader label="Servicio" sortKey="servicio" config={resSortConfig} onSort={handleResSort} />
                              <SortableHeader label="Profesional" sortKey="profesional" config={resSortConfig} onSort={handleResSort} />
                              <SortableHeader label="Estado" sortKey="estado" config={resSortConfig} onSort={handleResSort} />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedReservations.map(res => (
                              <TableRow key={res.id}>
                                <TableCell>{formatDate(res.fecha, true)}</TableCell>
                                <TableCell>{res.servicio}</TableCell>
                                <TableCell>{professionalMap.get(res.barbero_id) || res.barbero_id}</TableCell>
                                <TableCell><Badge>{res.estado}</Badge></TableCell>
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
                            <TableRow>
                              <SortableHeader label="Fecha" sortKey="fecha" config={salesSortConfig} onSort={handleSalesSort} />
                              <TableHead>Items</TableHead>
                              <SortableHeader label="Profesional" sortKey="profesional" config={salesSortConfig} onSort={handleSalesSort} />
                              <SortableHeader label="Método de pago" sortKey="metodo_pago" config={salesSortConfig} onSort={handleSalesSort} />
                              <SortableHeader label="Total" sortKey="total" config={salesSortConfig} onSort={handleSalesSort} align="right" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedSales.map(sale => {
                              const professionalNames = Array.from(
                                new Set(sale.items?.map(item => item.barbero_id ? professionalMap.get(item.barbero_id) : null).filter(Boolean))
                              ).join(', ') || 'N/A';

                              return (
                                <TableRow key={sale.id}>
                                  <TableCell>{formatDate(sale.fecha_hora_venta, true)}</TableCell>
                                  <TableCell>
                                    <ul className="list-disc pl-4 text-xs">
                                      {sale.items?.map((item, index) => (
                                        <li key={index}>{item.cantidad}x {item.nombre}</li>
                                      ))}
                                    </ul>
                                  </TableCell>
                                  <TableCell className="text-sm">{professionalNames}</TableCell>
                                  <TableCell className="capitalize">{sale.metodo_pago}</TableCell>
                                  <TableCell className="text-right font-semibold">${(sale.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
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
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
