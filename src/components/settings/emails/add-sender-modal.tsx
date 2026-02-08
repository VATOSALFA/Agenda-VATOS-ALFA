
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
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
      <DialogContent className="sm:max-w-md" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar correo' : 'Agregar correo'}</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="email">Ingresa el email</Label>
          <Input
            id="email"
            placeholder="nombre@vatosalfa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
