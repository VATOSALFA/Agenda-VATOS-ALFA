'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, ChevronsRight } from 'lucide-react';
import type { Reservation } from '@/lib/types';
import { Label } from '../ui/label';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface CancelReservationModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (reservationId: string, reason: string) => Promise<void>;
}

export function CancelReservationModal({ reservation, isOpen, onOpenChange, onConfirm }: CancelReservationModalProps) {
  const [sliderValue, setSliderValue] = useState(0);
  const [cancelReason, setCancelReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const executeCancellation = useCallback(async (reasonStr: string) => {
    if (!reservation || reasonStr.trim() === '' || isDeleting) {
      setSliderValue(0);
      return;
    }

    setIsDeleting(true);
    try {
      await onConfirm(reservation.id, reasonStr);
      setSliderValue(0);
      setCancelReason('');
    } catch (error) {
      console.error("Error canceling reservation: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cancelar la reserva. Inténtalo de nuevo."
      });
      setSliderValue(0);
    } finally {
      setIsDeleting(false);
    }
  }, [reservation, onConfirm, isDeleting, toast]);

  const updateDragPosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerWidth = rect.width;
    const maxTrackWidth = containerWidth - 48; // handle is 40px + 4px padding on each side

    let dragX = clientX - rect.left - 24; // center handle under pointer
    if (dragX < 0) dragX = 0;
    if (dragX > maxTrackWidth) dragX = maxTrackWidth;

    const percent = Math.round((dragX / maxTrackWidth) * 100);
    setSliderValue(percent);

    if (percent >= 98) {
      setIsDragging(false);
      setSliderValue(100);
      executeCancellation(cancelReason);
    }
  }, [cancelReason, executeCancellation]);

  const handleStartDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (cancelReason.trim() === '' || isDeleting) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    updateDragPosition(clientX);
  };

  useEffect(() => {
    const doDrag = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      // Prevent scrolling on touch devices while dragging
      if (e.cancelable) e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      updateDragPosition(clientX);
    };

    const stopDrag = () => {
      if (!isDragging) return;
      setIsDragging(false);
      setSliderValue((prev) => {
        if (prev < 98) return 0;
        return 100;
      });
    };

    if (isDragging) {
      window.addEventListener('mousemove', doDrag);
      window.addEventListener('mouseup', stopDrag);
      window.addEventListener('touchmove', doDrag, { passive: false });
      window.addEventListener('touchend', stopDrag);
    }
    return () => {
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', doDrag);
      window.removeEventListener('touchend', stopDrag);
    };
  }, [isDragging, updateDragPosition]);

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDeleting || isDragging) return;
    setSliderValue(0);
    setCancelReason('');
    onOpenChange(false);
  };

  const transitionClass = isDragging ? "transition-none" : "transition-all duration-300 ease-out";
  const ratio = sliderValue / 100;
  const fillWidth = `calc(48px + ${ratio} * (100% - 48px))`;
  const handleLeft = `calc(4px + ${ratio} * (100% - 48px))`;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
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

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">
              Motivo de la cancelación
            </Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder='Escribe el motivo aquí...'
              className="resize-none"
              rows={3}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
            />
          </div>

          <div className="space-y-3 pt-4 border-t">
            <Label>
              Desliza para confirmar la cancelación
            </Label>
            
            <div 
              ref={containerRef}
              onMouseDown={handleStartDrag}
              onTouchStart={handleStartDrag}
              className={cn(
                "relative w-full h-12 rounded-full overflow-hidden flex items-center border transition-all duration-300",
                cancelReason.trim() === '' || isDeleting
                  ? "bg-muted border-input opacity-60 cursor-not-allowed"
                  : "bg-red-50 border-red-200 shadow-sm cursor-pointer touch-none"
              )}
            >
              {/* Slider fill track */}
              <div 
                className={cn("absolute left-0 top-0 bottom-0 bg-red-500 rounded-full h-full", transitionClass)}
                style={{ 
                  width: fillWidth 
                }}
              />

              {/* Slider text */}
              <span 
                className={cn(
                  "absolute left-0 right-0 text-center pointer-events-none text-xs font-bold uppercase tracking-wider transition-opacity duration-150 select-none z-10",
                  cancelReason.trim() === ''
                    ? "text-muted-foreground"
                    : "text-red-700 animate-pulse"
                )}
                style={{ opacity: Math.max(0, (80 - sliderValue) / 80) }}
              >
                {isDeleting
                  ? "Cancelando..."
                  : cancelReason.trim() === ''
                    ? "Escribe el motivo primero"
                    : "Deslizar para cancelar >>>"
                }
              </span>

              {/* Slider handle */}
              <div 
                className={cn(
                  "absolute top-1 bottom-1 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center border z-20",
                  cancelReason.trim() === '' || isDeleting
                    ? "border-muted text-muted-foreground"
                    : "border-red-300 text-red-500",
                  transitionClass
                )}
                style={{ 
                  left: handleLeft 
                }}
              >
                {isDeleting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ChevronsRight className="w-5 h-5" />
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            variant="outline"
            onClick={handleClose}
            type="button"
            className="w-full sm:w-auto"
          >
            Volver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}