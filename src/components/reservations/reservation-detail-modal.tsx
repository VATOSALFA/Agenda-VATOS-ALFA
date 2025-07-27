

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
  Trash2
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
        await updateDoc(resRef, { estado: 'Cancelado' });
        toast({
            title: "Reserva cancelada con éxito",
        });
        onOpenChange(false);
        onUpdateStatus(reservationId, 'Cancelado'); // Force refetch
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
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div>
              <p className="font-semibold">{reservation.customer}</p>
              <p className="text-sm text-muted-foreground">{reservation.servicio}</p>
            </div>
            <div>
              <p className="text-sm">
                {format(parseISO(reservation.fecha), "EEEE, dd 'de' MMMM", {locale: es})}
              </p>
              <p className="text-sm">{reservation.hora_inicio} - {reservation.hora_fin}</p>
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
          <DialogFooter className="p-6 border-t">
              <Button variant="destructive" onClick={() => setIsCancelModalOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Cancelar Reserva
              </Button>
              <div className="flex-grow" />
              <Button variant="outline" onClick={onPay}>
                  <CreditCard className="mr-2 h-4 w-4" /> Pagar
              </Button>
               <Button onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
              </Button>
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
