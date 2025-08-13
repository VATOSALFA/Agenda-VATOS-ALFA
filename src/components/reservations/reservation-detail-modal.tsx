

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
} from 'lucide-react';
import type { Reservation } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { CancelReservationModal } from './cancel-reservation-modal';


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
  const { toast } = useToast();

  if (!reservation) return null;
  
  const handleCancelReservation = async (reservationId: string) => {
    try {
        const resRef = doc(db, 'reservas', reservationId);
        await deleteDoc(resRef);
        toast({
            title: "Reserva eliminada con éxito",
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


  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
          <DialogHeader className="p-6 flex-row justify-between items-center border-b">
              <DialogTitle>Detalle de la Reserva</DialogTitle>
              <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
              </Button>
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
                        <a href={`https://wa.me/${reservation.customer.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm"><Send className="w-4 h-4 mr-2"/> Enviar WhatsApp</Button>
                        </a>
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
              {reservation.pago_estado !== 'Pagado' ? (
                <Button variant="destructive" onClick={() => setIsCancelModalOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Cancelar Reserva
                </Button>
              ) : <div />}
              
              {reservation.pago_estado !== 'Pagado' ? (
                <Button onClick={onPay} className="bg-primary hover:bg-primary/90">
                    <CreditCard className="mr-2 h-4 w-4" /> Pagar
                </Button>
              ) : (
                <Button onClick={() => toast({ title: 'Funcionalidad en desarrollo' })}>
                    <Eye className="mr-2 h-4 w-4" /> Ver Pago
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
    </>
  );
}
