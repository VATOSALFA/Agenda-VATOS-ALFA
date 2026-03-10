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
import { useAuth } from '@/contexts/firebase-auth-context';
import { getDocs, query, collection, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { logAuditAction } from '@/lib/audit-logger';

interface CancelReservationModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (reservationId: string) => Promise<void>;
}

export function CancelReservationModal({ reservation, isOpen, onOpenChange, onConfirm }: CancelReservationModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [authCode, setAuthCode] = useState('');

  const { user } = useAuth();
  const { toast } = useToast();

  const requiresAuthCode = user?.role !== 'Administrador general';

  const isConfirmationTextCorrect = confirmationText.toUpperCase() === 'CANCELAR';

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!reservation || !isConfirmationTextCorrect) return;

    if (requiresAuthCode) {
      if (!authCode) {
        toast({ variant: 'destructive', title: 'Código requerido' });
        return;
      }
      const authCodeQuery = query(
        collection(db, 'codigos_autorizacion'),
        where('code', '==', authCode),
        where('active', '==', true),
        where('reserves', '==', true)
      );
      const querySnapshot = await getDocs(authCodeQuery);
      if (querySnapshot.empty) {
        toast({ variant: 'destructive', title: 'Código inválido o sin permiso' });
        return;
      }

      await logAuditAction({
        action: 'Autorización por Código',
        details: `Cancelación de reserva autorizada (Reserva: ${reservation.id}).`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        authCode: authCode,
        severity: 'warning'
      });
    }

    setIsDeleting(true);
    await onConfirm(reservation.id);
    setIsDeleting(false);
    setConfirmationText('');
    setAuthCode('');
    // No cerramos manualmente aquí, dejamos que el componente padre maneje el cierre global
  }

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDeleting) return;
    setConfirmationText('');
    setAuthCode('');
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

          {requiresAuthCode && (
            <div className="pt-2">
              <Label htmlFor="auth-code-cancel">
                Código de autorización requerido
              </Label>
              <Input
                id="auth-code-cancel"
                type="password"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder='Código a 6 caracteres'
                autoComplete="off"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
              />
            </div>
          )}
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
            disabled={(!isConfirmationTextCorrect) || (requiresAuthCode && !authCode) || isDeleting}
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