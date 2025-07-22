

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
  Circle
} from 'lucide-react';
import type { Reservation } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { NewReservationForm } from './new-reservation-form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';


interface ReservationDetailModalProps {
  reservation: Reservation;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPay: () => void;
  onUpdateStatus: (reservationId: string, status: string) => void;
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
}: ReservationDetailModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  if (!reservation) return null;
  
  const handleSaveChanges = async (data: any) => {
    setIsSaving(true);
    try {
        const serviceDuration = 30; // Assuming a default, this should be dynamic based on the service
        const [hour, minute] = data.hora_inicio.split(':').map(Number);
        const startTime = new Date(data.fecha.setHours(hour, minute));
        const endTime = new Date(startTime.getTime() + serviceDuration * 60000);
        
        const dataToSave = {
            ...data,
            fecha: format(data.fecha, 'yyyy-MM-dd'),
            hora_fin: format(endTime, 'HH:mm'),
        };

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


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-3">
            <User className="h-6 w-6 text-primary" />
            Reserva de {reservation.customer}
          </DialogTitle>
          <DialogDescription>
            Detalles de la cita, historial del cliente y acciones rápidas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-hidden">
          <Tabs defaultValue="reserva" className="flex-grow flex flex-col h-full">
            <TabsList className="mb-4">
              <TabsTrigger value="reserva">Reserva</TabsTrigger>
              <TabsTrigger value="pago">Pago</TabsTrigger>
              <TabsTrigger value="recordatorios">Recordatorios</TabsTrigger>
              <TabsTrigger value="cliente">Cliente</TabsTrigger>
            </TabsList>
            <ScrollArea className="flex-grow pr-2">
              <TabsContent value="reserva" className="space-y-4">
                 <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Estado:</p>
                    <TooltipProvider>
                    <div className="flex gap-2">
                        {statusOptions.map(({ status, color, label }) => (
                             <Tooltip key={status}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => onUpdateStatus(reservation.id, status)}
                                        className={cn(`h-6 w-6 rounded-full ${color} transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring`, {
                                            'ring-2 ring-offset-2 ring-primary': reservation.estado === status
                                        })}
                                        aria-label={`Marcar como ${label}`}
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{label}</p>
                                </TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                    </TooltipProvider>
                 </div>
                 <NewReservationForm
                    onFormSubmit={() => {}}
                    onSaveChanges={handleSaveChanges}
                    initialData={reservation}
                    isEditMode
                 />
              </TabsContent>
              <TabsContent value="pago" className="text-center text-muted-foreground p-8">
                 <p>Información de pago estará disponible aquí.</p>
              </TabsContent>
              <TabsContent value="recordatorios" className="text-center text-muted-foreground p-8">
                <p>Historial de recordatorios enviados estará aquí.</p>
              </TabsContent>
              <TabsContent value="cliente" className="text-center text-muted-foreground p-8">
                <p>Detalles del cliente e historial aquí.</p>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
            </Button>
            <div className="flex-grow" />
            <Button onClick={onPay}>
                <CreditCard className="mr-2 h-4 w-4" /> 
                {reservation.pago_estado === 'Pagado' ? 'Ver Pago' : 'Pagar'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
