'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, X } from 'lucide-react';
import type { Sender } from '@/app/(admin)/settings/emails/page';

interface AddSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (email: string) => void;
  sender: Sender | null;
}

export function AddSenderModal({ isOpen, onClose, onSave, sender }: AddSenderModalProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditMode = !!sender;

  useEffect(() => {
    if (isOpen) {
      setEmail(sender?.email || '');
      setError('');
      setIsSubmitting(false);
    }
  }, [sender, isOpen]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async () => {
    setError('');

    if (!email.trim()) {
      setError('El correo es requerido.');
      return;
    }

    if (!validateEmail(email)) {
      setError('Debe ser un correo electrónico válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(email);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        hideCloseButton={true}
        className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-card"
      >
        {/* Cabecera Oficial de Modal con Haz de Luz Oblicuo */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="header-light-beam absolute inset-0 pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <Mail className="h-5 w-5 text-slate-300 shrink-0" />
            <div>
              <DialogTitle className="text-base font-bold text-white tracking-tight">
                {isEditMode ? 'Editar Correo Remitente' : 'Nuevo Correo Remitente'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-300">
                Dirección desde donde se enviarán las notificaciones.
              </DialogDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 relative z-10"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cerrar</span>
          </Button>
        </div>

        <div className="p-5 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs font-semibold text-foreground">
              Dirección de correo electrónico
            </Label>
            <Input
              id="email"
              placeholder="nombre@vatosalfa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              className="h-8 text-xs sm:text-sm font-sans"
            />
            {error && <p className="text-[11px] text-destructive font-medium">{error}</p>}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border/50 bg-muted/10 flex items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs h-8 px-3 rounded-lg"
          >
            Cerrar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            variant="alfa"
            className="text-xs h-8 px-4 font-semibold"
          >
            {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isEditMode ? 'Guardar Cambios' : 'Agregar Correo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
