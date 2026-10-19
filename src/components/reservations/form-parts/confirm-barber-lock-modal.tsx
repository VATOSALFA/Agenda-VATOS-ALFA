'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Scissors, X } from 'lucide-react';
import type { Profesional } from '@/lib/types';

interface ConfirmBarberLockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingConfirmProfs: string[];
  currentConfirmIdx: number;
  professionals: Profesional[];
  onConfirmAnswer: (locked: boolean) => Promise<void>;
  onReset: () => void;
}

export function ConfirmBarberLockModal({
  open,
  onOpenChange,
  pendingConfirmProfs,
  currentConfirmIdx,
  professionals,
  onConfirmAnswer,
  onReset,
}: ConfirmBarberLockModalProps) {
  const currentProfId = pendingConfirmProfs[currentConfirmIdx];
  const professionalName = professionals.find(p => p.id === currentProfId)?.name;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          onReset();
        }
      }}
    >
      <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background flex flex-col">
        {/* CABECERA OFICIAL VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Scissors className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Confirmación de Barbero
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Preferencia exclusiva de profesional
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onReset();
              }}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">
            {professionalName
              ? `¿El cliente pidió exclusivamente con ${professionalName}?`
              : '¿El cliente pidió exclusivamente con el barbero?'}
          </p>
        </div>
        <DialogFooter className="px-5 pb-5 pt-0 flex justify-end gap-3 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onConfirmAnswer(false)}
          >
            No
          </Button>
          <Button
            type="button"
            className="btn-vatos-alfa rounded-xl font-bold text-xs"
            onClick={() => onConfirmAnswer(true)}
          >
            Sí
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
