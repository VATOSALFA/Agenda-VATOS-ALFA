'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
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
    e.stopPropagation(); 
    if (!reservation || !isConfirmationTextCorrect) return;
    setIsDeleting(true);
    await onConfirm(reservation.id);
    setIsDeleting(false);
    setConfirmationText('');
    // No cerramos manualmente aquí, dejamos que el componente padre maneje el cierre global
  }

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDeleting) return;
    setConfirmationText('');
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
        {/* Usamos DialogContent estándar que es más amigable con inputs anidados */}
        <DialogContent 
            className="sm:max-w-[425px]"
            // Este evento es clave: evita que clics dentro del modal se propaguen
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <DialogHeader>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <DialogTitle className="text-center text-xl">¿Estás seguro?</DialogTitle>
                <DialogDescription className="text-center">
                    Esta acción no se puede revertir. El estado de la reserva cambiará a "Cancelado".
                </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 space-y-2">
                <Label htmlFor="cancel-confirmation">
                    Para confirmar, escribe <strong>CANCELAR</strong> en el campo de abajo.
                </Label>
                <Input
                    id="cancel-confirmation"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder='CANCELAR'
                    autoComplete="off"
                    // Aseguramos que el input capture el foco y no propague el clic
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                />
            </div>

            <DialogFooter className="sm:justify-center gap-2">
                <Button 
                    variant="outline" 
                    onClick={handleClose} 
                    type="button"
                >
                    Volver
                </Button>
                <Button
                    variant="destructive"
                    onClick={handleConfirm}
                    disabled={!isConfirmationTextCorrect || isDeleting}
                    type="button"
                >
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar cancelación
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}