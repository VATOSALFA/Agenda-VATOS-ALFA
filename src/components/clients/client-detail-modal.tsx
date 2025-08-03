

'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ShoppingCart, User, Phone, Mail, Cake, MessageSquare, PlusCircle, VenetianMask, UserCheck, UserX, PiggyBank, XCircle } from 'lucide-react';
import type { Client, Profesional } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';

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
  items: { nombre: string; cantidad: number; precio_unitario: number }[];
}

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: string | undefined | null }) => (
  <div className="flex items-start gap-3">
    <Icon className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
    <div>
      <p className="font-semibold text-muted-foreground">{label}</p>
      <p className="text-card-foreground">{value || 'No registrado'}</p>
    </div>
  </div>
);

const StatCard = ({ title, value, icon: Icon, description }: { title: string, value: string | number, icon: React.ElementType, description?: string }) => (
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
  
  const professionalMap = useMemo(() => {
    if (professionalsLoading) return new Map();
    return new Map(professionals.map(p => [p.id, p.name]));
  }, [professionals, professionalsLoading]);


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
  
  const totalSpent = client.gasto_total || (salesLoading ? 0 : sales.reduce((acc, sale) => acc + (sale.total || 0), 0));
  
  const attendedAppointments = client.citas_asistidas || (reservationsLoading ? 0 : reservations.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado').length);
  const unattendedAppointments = client.citas_no_asistidas || (reservationsLoading ? 0 : reservations.filter(r => r.estado === 'No asiste').length);
  const cancelledAppointments = client.citas_canceladas || (reservationsLoading ? 0 : reservations.filter(r => r.estado === 'Cancelado').length);
  const totalAppointments = client.citas_totales || (reservationsLoading ? 0 : reservations.length);


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
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
            <InfoRow icon={User} label="Número de cliente" value={client.id} />
            <InfoRow icon={Phone} label="Teléfono" value={client.telefono} />
            <InfoRow icon={Mail} label="Correo Electrónico" value={client.correo} />
            <InfoRow icon={Cake} label="Fecha de Nacimiento" value={client.fecha_nacimiento ? formatDate(client.fecha_nacimiento) : null} />
            <InfoRow icon={Calendar} label="Cliente desde" value={client.creado_en ? formatDate(client.creado_en) : null} />
            <InfoRow icon={MessageSquare} label="Notas" value={client.notas} />
            
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
                {client.telefono && (
                 <a href={`https://wa.me/${client.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full">
                        <VenetianMask className="mr-2 h-4 w-4" /> Enviar WhatsApp
                    </Button>
                 </a>
                )}
            </div>
          </div>

          {/* History Tabs */}
          <div className="md:col-span-3 flex flex-col">
            <Tabs defaultValue="general" className="flex-grow flex flex-col">
              <TabsList className="mb-4">
                <TabsTrigger value="general">Información General</TabsTrigger>
                <TabsTrigger value="reservations">Historial de Reservas</TabsTrigger>
                <TabsTrigger value="sales">Historial de Compras</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="flex-grow pr-2">
                <TabsContent value="general" className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Citas totales" value={reservationsLoading ? '...' : totalAppointments} icon={Calendar} />
                        <StatCard title="Citas asistidas" value={reservationsLoading ? '...' : attendedAppointments} icon={UserCheck} />
                        <StatCard title="Citas no asistidas" value={reservationsLoading ? '...' : unattendedAppointments} icon={UserX} />
                        <StatCard title="Citas canceladas" value={reservationsLoading ? '...' : cancelledAppointments} icon={XCircle} />
                        <StatCard title="Gasto Total" value={salesLoading ? '...' : `$${totalSpent.toLocaleString('es-CL')}`} icon={PiggyBank} description={`${sales.length} compras`} />
                    </div>
                </TabsContent>
                <TabsContent value="reservations">
                  {reservationsLoading ? <Skeleton className="h-60 w-full" /> : (
                    reservations.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fecha</TableHead>
                              <TableHead>Servicio</TableHead>
                              <TableHead>Profesional</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reservations.map(res => (
                              <TableRow key={res.id}>
                                <TableCell>{formatDate(res.fecha, true)}</TableCell>
                                <TableCell>{res.servicio}</TableCell>
                                <TableCell>{professionalMap.get(res.barbero_id) || res.barbero_id}</TableCell>
                                <TableCell><Badge>{res.estado}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                    ) : (
                        <p className="text-muted-foreground text-center py-10">No hay reservas registradas.</p>
                    )
                  )}
                </TabsContent>

                <TabsContent value="sales">
                  {salesLoading ? <Skeleton className="h-60 w-full" /> : (
                    sales.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead>Método de pago</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                            {sales.map(sale => (
                                <TableRow key={sale.id}>
                                    <TableCell>{formatDate(sale.fecha_hora_venta, true)}</TableCell>
                                    <TableCell>
                                        <ul className="list-disc pl-4 text-xs">
                                            {sale.items?.map((item, index) => (
                                                <li key={index}>{item.cantidad}x {item.nombre}</li>
                                            ))}
                                        </ul>
                                    </TableCell>
                                    <TableCell className="capitalize">{sale.metodo_pago}</TableCell>
                                    <TableCell className="text-right font-semibold">${(sale.total ?? 0).toLocaleString('es-CL')}</TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-muted-foreground text-center py-10">No hay ventas registradas.</p>
                    )
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
