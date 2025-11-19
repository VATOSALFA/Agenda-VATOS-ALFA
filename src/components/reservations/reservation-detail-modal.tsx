

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Phone,
  Mail,
  Cake,
  MessageSquare,
  CreditCard,
  Bell,
  Pencil,
  Scissors,
  Calendar as CalendarIcon,
  Tag,
  Clock,
  Circle,
  Save,
  Trash2,
  Send,
  Eye,
  MessageCircle,
} from 'lucide-react';
import type { Reservation, Sale } from '@/lib/types';
import { format, parse, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { doc, deleteDoc, updateDoc, collection, query, where, getDocs, runTransaction, increment } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Loader2 } from 'lucide-react';
import { CancelReservationModal } from './cancel-reservation-modal';
import { SaleDetailModal } from '../sales/sale-detail-modal';
import Link from 'next/link';
import { useFirestoreQuery } from '@/hooks/use-firestore';


interface ReservationDetailModalProps {
  reservation: Reservation;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPay: () => void;
  onUpdateStatus: (reservationId: string, status: string) => void;
  onEdit: () => void;
}

const statusOptions = [
    { status: 'Reservado', color: 'bg-blue-500', label: 'Reservado' },
    { status: 'Confirmado', color: 'bg-yellow-500', label: 'Confirmado' },
    { status: 'Asiste', color: 'bg-pink-500', label: 'Asiste' },
    { status: 'No asiste', color: 'bg-orange-500', label: 'No Asistió' },
    { status: 'Pendiente', color: 'bg-red-500', label: 'Pendiente' },
    { status: 'En espera', color: 'bg-green-500', label: 'En Espera' },
];

export function ReservationDetailModal({
  reservation,
  isOpen,
  onOpenChange,
  onPay,
  onUpdateStatus,
  onEdit
}: ReservationDetailModalProps) {
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isSaleDetailModalOpen, setIsSaleDetailModalOpen] = useState(false);
  const [saleForReservation, setSaleForReservation] = useState<Sale | null>(null);
  const [isLoadingSale, setIsLoadingSale] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const { toast } = useToast();
  const { db } = useAuth();
  
  const { data: locales } = useFirestoreQuery('locales');
  const { data: professionals } = useFirestoreQuery('profesionales');

  if (!reservation) return null;
  
  const handleCancelClick = () => {
    setIsCancelModalOpen(true);
  }

  const handleCancelReservation = async (reservationId: string) => {
    if (!reservation.cliente_id || !db) {
         toast({ variant: 'destructive', title: "Error", description: "La reserva no tiene un cliente asociado o la base de datos no está disponible." });
         return;
    }
    
    try {
        await runTransaction(db, async (transaction) => {
            if (!db) throw new Error("Database not available in transaction");
            const resRef = doc(db, 'reservas', reservationId);
            const clientRef = doc(db, 'clientes', reservation.cliente_id!);

            transaction.update(resRef, { estado: 'Cancelado' });
            transaction.update(clientRef, {
                citas_canceladas: increment(1)
            });
        });

        toast({
            title: "Reserva Cancelada",
            description: "El estado de la reserva ha sido actualizado a 'Cancelado'.",
        });

        onOpenChange(false);
        onUpdateStatus(reservationId, 'Cancelado'); // Force refetch in parent
        
    } catch (error) {
        console.error("Error canceling reservation: ", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo cancelar la reserva. Inténtalo de nuevo.",
        });
    }
  };

  const handleViewPayment = async () => {
    if(!db) return;
    setIsLoadingSale(true);
    try {
        const salesQuery = query(collection(db, 'ventas'), where('reservationId', '==', reservation.id));
        const salesSnapshot = await getDocs(salesQuery);

        if (!salesSnapshot.empty) {
            const saleDoc = salesSnapshot.docs[0];
            const saleData = saleDoc.data() as Sale;
            setSaleForReservation({ ...saleData, id: saleDoc.id, client: reservation.customer });
            setIsSaleDetailModalOpen(true);
        } else {
            toast({
                variant: 'destructive',
                title: 'Venta no encontrada',
                description: 'No se encontró un pago asociado a esta reserva.',
            });
        }
    } catch (error) {
        console.error("Error fetching sale details:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron obtener los detalles del pago.' });
    } finally {
        setIsLoadingSale(false);
    }
  };
  
  const handleSendReminder = async () => {
    if (!reservation.customer?.telefono) {
        toast({ variant: 'destructive', title: 'Sin teléfono', description: 'El cliente no tiene un número de teléfono registrado.'});
        return;
    }
    
    setIsSending(true);

    try {
        const local = locales.find(l => l.id === reservation.local_id);
        const professionalId = reservation.items?.[0]?.barbero_id;
        const professional = professionalId ? professionals.find(p => p.id === professionalId) : null;

        if(!local || !professional) {
            throw new Error("No se pudo encontrar el local o el profesional asociado.");
        }
        
        const fullDateStr = `${format(parse(reservation.fecha, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", { locale: es })} a las ${reservation.hora_inicio}`;

        const response = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: reservation.customer.telefono,
            contentSid: 'HX259d67c1e5304a9db9b08a09d7db9e1c',
            contentVariables: {
                '1': reservation.customer.nombre,
                '2': local.name,
                '3': fullDateStr,
                '4': reservation.servicio,
                '5': professional.name,
            },
          })
        });

        const result = await response.json();
        
        if (result.success) {
            toast({ title: 'Recordatorio enviado', description: 'El mensaje de recordatorio ha sido enviado al cliente.' });
        } else {
            throw new Error(result.error || 'Error desconocido al enviar el mensaje.');
        }

    } catch(error: any) {
        console.error("Error sending reminder:", error);
        toast({ variant: 'destructive', title: 'Error de envío', description: error.message });
    } finally {
        setIsSending(false);
    }
  }

  const clientNameParam = encodeURIComponent(`${reservation.customer?.nombre} ${reservation.customer?.apellido}`);

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
          <DialogHeader className="p-6 flex-row justify-between items-center border-b">
              <DialogTitle>Detalle de la Reserva</DialogTitle>
              <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSendReminder} disabled={isSending}>
                      {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4" />}
                      Enviar Recordatorio
                  </Button>
                  <Button variant="outline" size="sm" onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                  </Button>
              </div>
          </DialogHeader>
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-lg">{reservation.customer?.nombre} {reservation.customer?.apellido}</p>
                    <p className="text-sm text-muted-foreground">{reservation.professionalNames || 'N/A'}</p>
                </div>
                <Badge variant={reservation.pago_estado === 'Pagado' ? 'default' : 'secondary'} className={cn(reservation.pago_estado === 'Pagado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')}>
                    {reservation.pago_estado}
                </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-primary" /> Fecha y Hora</p>
                  <p className="pl-6">{format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM", {locale: es})}</p>
                  <p className="pl-6">{reservation.hora_inicio} - {reservation.hora_fin}</p>
                </div>
                 <div>
                  <p className="font-medium flex items-center gap-2"><Scissors className="w-4 h-4 text-primary" /> Servicios</p>
                  <ul className="list-disc pl-10">
                    {reservation.items ? reservation.items.map((i, idx) => <li key={idx}>{i.nombre || i.servicio}</li>) : <li>{(reservation as any).servicio}</li>}
                  </ul>
                </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
                <h4 className="font-semibold">Información del Cliente</h4>
                <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{reservation.customer?.correo || 'No registrado'}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{reservation.customer?.telefono || 'No registrado'}</span>
                    </div>
                    {reservation.customer?.telefono && (
                        <Link href={`/admin/conversations?phone=${reservation.customer.telefono}&name=${clientNameParam}`} passHref>
                            <Button variant="outline" size="sm">
                                <MessageCircle className="w-4 h-4 mr-2"/> Ver Conversación
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                {statusOptions.map(({ status, color, label }) => (
                  <TooltipProvider key={status}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onUpdateStatus(reservation.id, status)}
                          className={cn(
                            'h-8 w-8 rounded-full border-2 transition-all',
                            reservation.estado === status ? 'border-primary scale-110' : 'border-transparent opacity-50 hover:opacity-100',
                            color
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{label}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
            </div>
          </div>
          <DialogFooter className="p-6 border-t flex justify-between">
              {reservation.estado !== 'Cancelado' && (
                <Button variant="destructive" onClick={handleCancelClick}>
                    <Trash2 className="mr-2 h-4 w-4" /> Cancelar Reserva
                </Button>
              )}
              
              {reservation.pago_estado !== 'Pagado' ? (
                <Button onClick={onPay} className="bg-primary hover:bg-primary/90">
                    <CreditCard className="mr-2 h-4 w-4" /> Pagar
                </Button>
              ) : (
                <Button onClick={handleViewPayment} disabled={isLoadingSale}>
                    {isLoadingSale ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Eye className="mr-2 h-4 w-4" />}
                    Ver Pago
                </Button>
              )}
          </DialogFooter>
      </DialogContent>
    </Dialog>
    
    <CancelReservationModal
        isOpen={isCancelModalOpen}
        onOpenChange={setIsCancelModalOpen}
        reservation={reservation}
        onConfirm={handleCancelReservation}
    />
    
    <SaleDetailModal
        isOpen={isSaleDetailModalOpen}
        onOpenChange={setIsSaleDetailModalOpen}
        sale={saleForReservation}
    />
    </>
  );
}
