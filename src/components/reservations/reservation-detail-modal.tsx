

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { NewReservationForm } from './new-reservation-form';
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
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reserva");


  if (!reservation) return null;
  
  const handleSaveChanges = async (data: any) => {
    setIsSaving(true);
    try {
        const hora_inicio = `${data.hora_inicio_h}:${data.hora_inicio_m}`;
        const serviceDuration = 30; // Assuming a default, this should be dynamic based on the service
        const startTime = new Date(data.fecha.setHours(data.hora_inicio_h, data.hora_inicio_m));
        const endTime = new Date(startTime.getTime() + serviceDuration * 60000);
        
        const dataToSave = {
            ...data,
            fecha: format(data.fecha, 'yyyy-MM-dd'),
            hora_inicio,
            hora_fin: format(endTime, 'HH:mm'),
        };
        
        delete dataToSave.hora_inicio_h;
        delete dataToSave.hora_inicio_m;

        const resRef = doc(db, 'reservas', reservation.id);
        await updateDoc(resRef, dataToSave);
        toast({ title: '¡Éxito!', description: 'La reserva ha sido actualizada.' });
        onUpdateStatus(reservation.id, reservation.estado); // to force a refetch
        onOpenChange(false);

    } catch (error) {
        console.error('Error al actualizar la reserva:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la reserva.' });
    } finally {
        setIsSaving(false);
    }
  }

  const handleDeleteReservation = async (reservationId: string) => {
    try {
        await deleteDoc(doc(db, "reservas", reservationId));
        toast({
            title: "Reserva cancelada con éxito",
        });
        onOpenChange(false);
        // The parent component (AgendaView) will refetch due to the onSnapshot listener
    } catch (error) {
        console.error("Error deleting reservation: ", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo cancelar la reserva. Inténtalo de nuevo.",
        });
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 flex-row justify-between items-center border-b">
              <DialogTitle>Detalle de la Reserva</DialogTitle>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setIsCancelModalOpen(true)}>
                  <Trash2 className="h-5 w-5" />
              </Button>
          </DialogHeader>
          <div className="flex-grow overflow-hidden flex flex-col">
            <NewReservationForm
              onFormSubmit={() => {}}
              onSaveChanges={handleSaveChanges}
              initialData={reservation}
              isEditMode
              isDialogChild={true}
            />
          </div>
        </DialogContent>
        {isCancelModalOpen &&
            <CancelReservationModal
                isOpen={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
                reservation={reservation}
                onConfirm={handleDeleteReservation}
            />
        }
    </Dialog>
  );
}
