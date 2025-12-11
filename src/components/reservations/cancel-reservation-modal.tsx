
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2 } from 'lucide-react';
import type { Reservation } from '@/lib/types';
import { Label } from '../ui/label';

interface CancelReservationModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (reservationId: string) => Promise<void>;
}

export function CancelReservationModal({ reservation, isOpen, onOpenChange, onConfirm }: CancelReservationModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isConfirmationTextCorrect = confirmationText.toUpperCase() === 'CANCELAR';

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevenir que el clic cierre el modal padre
    if (!reservation || !isConfirmationTextCorrect) return;
    setIsDeleting(true);
    await onConfirm(reservation.id);
    setIsDeleting(false);
    setConfirmationText('');
    // No llamamos onOpenChange(false) aquí porque el padre se encarga de cerrar todo el flujo en su lógica
  }

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevenir propagación al cancelar también
    if (isDeleting) return;
    setConfirmationText('');
    onOpenChange(false);
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {/* 👇 AQUÍ ESTÁ LA SOLUCIÓN: Agregamos eventos para detener clics en cualquier parte del modal */}
        <AlertDialogContent 
            onClick={(e) => e.stopPropagation()} 
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <AlertDialogHeader>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <AlertDialogTitle className="text-center text-xl">¿Estás seguro que quieres cancelar esta reserva?</AlertDialogTitle>
                <AlertDialogDescription className="text-center">
                    Esta acción no se puede revertir. El estado de la reserva cambiará a "Cancelado".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-2">
                <Label htmlFor="cancel-confirmation">Para confirmar, escribe <strong>CANCELAR</strong> en el campo de abajo.</Label>
                <Input
                    id="cancel-confirmation"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder='CANCELAR'
                    autoComplete="off"
                    // 👇 Detenemos la propagación también en el input para máxima seguridad
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={handleClose}>Volver</AlertDialogCancel>
                <AlertDialogAction
                    onClick={handleConfirm}
                    disabled={!isConfirmationTextCorrect || isDeleting}
                    className="bg-destructive hover:bg-destructive/90"
                >
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar cancelación
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
  );
}
