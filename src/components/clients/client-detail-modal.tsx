
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ShoppingCart, User, Phone, Mail, Cake, MessageSquare, PlusCircle, VenetianMask } from 'lucide-react';
import type { Client } from '@/lib/types';
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
  fecha_hora_venta: { seconds: number; nanoseconds: number };
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

export function ClientDetailModal({ client, isOpen, onOpenChange, onNewReservation }: ClientDetailModalProps) {
  const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>(
    'reservas',
    isOpen ? where('cliente_id', '==', client.id) : undefined
  );

  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
    'ventas',
    isOpen ? where('cliente_id', '==', client.id) : undefined
  );

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
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <User className="h-6 w-6 text-primary" /> Ficha de Cliente
          </DialogTitle>
          <DialogDescription>
            Información detallada, historial y acciones para {client.nombre} {client.apellido}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-6 flex-grow overflow-hidden">
          {/* Client Info */}
          <div className="md:col-span-1 space-y-6 bg-card/50 p-6 rounded-lg overflow-y-auto">
            <h3 className="text-xl font-bold text-primary">{client.nombre} {client.apellido}</h3>
            <InfoRow icon={Phone} label="Teléfono" value={client.telefono} />
            <InfoRow icon={Mail} label="Correo Electrónico" value={client.correo} />
            <InfoRow icon={Cake} label="Fecha de Nacimiento" value={client.fecha_nacimiento ? formatDate(client.fecha_nacimiento) : null} />
            <InfoRow icon={Calendar} label="Cliente desde" value={client.creado_en ? formatDate(client.creado_en) : null} />
            <InfoRow icon={MessageSquare} label="Notas" value={client.notas} />
            
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
                <Button onClick={onNewReservation}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Crear nueva cita
                </Button>
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
          <div className="md:col-span-2 flex flex-col">
            <Tabs defaultValue="reservations" className="flex-grow flex flex-col">
              <TabsList className="mb-4">
                <TabsTrigger value="reservations"><Calendar className="mr-2 h-4 w-4" /> Historial de Reservas</TabsTrigger>
                <TabsTrigger value="sales"><ShoppingCart className="mr-2 h-4 w-4" /> Historial de Ventas</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="flex-grow pr-2">
                <TabsContent value="reservations">
                  {reservationsLoading ? <Skeleton className="h-40 w-full" /> : reservations.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Servicio</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reservations.map(res => (
                          <TableRow key={res.id}>
                            <TableCell>{formatDate(res.fecha, true)}</TableCell>
                            <TableCell>{res.servicio}</TableCell>
                            <TableCell><Badge>{res.estado}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : <p className="text-muted-foreground text-center py-10">No hay reservas registradas.</p>}
                </TabsContent>

                <TabsContent value="sales">
                  {salesLoading ? <Skeleton className="h-40 w-full" /> : sales.length > 0 ? (
                    <div className="space-y-4">
                      {sales.map(sale => (
                        <Card key={sale.id} className="bg-card/70">
                           <CardHeader className="flex flex-row justify-between items-center p-4">
                                <div>
                                    <CardTitle className="text-lg">{formatDate(sale.fecha_hora_venta, true)}</CardTitle>
                                    <CardDescription>Total: ${sale.total.toLocaleString('es-CL')} ({sale.metodo_pago})</CardDescription>
                                </div>
                           </CardHeader>
                           <CardContent className="p-4 pt-0">
                                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                                    {sale.items.map((item, index) => (
                                        <li key={index}>{item.cantidad}x {item.nombre} - ${item.precio_unitario.toLocaleString('es-CL')} c/u</li>
                                    ))}
                                </ul>
                           </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : <p className="text-muted-foreground text-center py-10">No hay ventas registradas.</p>}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
