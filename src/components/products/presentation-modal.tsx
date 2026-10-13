
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2, Loader2, X, Layers } from 'lucide-react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { ProductPresentation } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { collection, addDoc, deleteDoc, doc, Timestamp, getDocs } from 'firebase/firestore';

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: (newPresentationId: string) => void;
}

export function PresentationModal({ isOpen, onClose, onDataSaved }: PresentationModalProps) {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('ml');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queryKey, setQueryKey] = useState(0);
  const { db } = useAuth();

  const { data: presentations, loading } = useFirestoreQuery<ProductPresentation>('formatos_productos', queryKey);

  const handleAddPresentation = async () => {
    if (!db) return;
    if (quantity.trim() === '') {
      toast({ variant: 'destructive', title: 'Error', description: 'La cantidad no puede estar vacía.' });
      return;
    }

    // Concatenate for storage
    const newPresentationName = `${quantity.trim()} ${unit}`;


    setIsSubmitting(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'formatos_productos'));
      const order = querySnapshot.size;

      const docRef = await addDoc(collection(db, 'formatos_productos'), {
        name: newPresentationName.trim(),
        order,
        created_at: Timestamp.now(),
      });
      setQuantity('');
      setUnit('ml');
      toast({ title: 'Formato agregado' });
      onDataSaved(docRef.id);
      onClose();
    } catch (error) {
      console.error("Error creating presentation:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear el formato.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePresentation = async (idToDelete: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'formatos_productos', idToDelete));
      toast({ title: 'Formato eliminado' });
      setQueryKey(prev => prev + 1);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el formato.' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
        {/* Official Vatos Alfa Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 text-white border-b border-blue-900/40">
          <div className="header-light-beam" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                  Formatos / Presentaciones
                </DialogTitle>
                <p className="text-xs text-slate-300">
                  Administra los formatos y unidades de los productos
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nuevo Formato</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ej: 100"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="flex-grow rounded-xl h-10"
                onKeyDown={(e) => e.key === 'Enter' && handleAddPresentation()}
                disabled={isSubmitting}
              />
              <div className="w-[100px]">
                <Select value={unit} onValueChange={setUnit} disabled={isSubmitting}>
                  <SelectTrigger className="rounded-xl h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                    <SelectItem value="ml" className="rounded-lg">ml</SelectItem>
                    <SelectItem value="gr" className="rounded-lg">gr</SelectItem>
                    <SelectItem value="oz" className="rounded-lg">oz</SelectItem>
                    <SelectItem value="l" className="rounded-lg">l</SelectItem>
                    <SelectItem value="kg" className="rounded-lg">kg</SelectItem>
                    <SelectItem value="pza" className="rounded-lg">pza</SelectItem>
                    <SelectItem value="u" className="rounded-lg">u</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="alfa" 
                onClick={handleAddPresentation} 
                disabled={isSubmitting}
                className="rounded-xl font-bold px-4 h-10 shadow-sm"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                Agregar
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Formatos existentes</Label>
            <ScrollArea className="h-52 rounded-xl border border-border/60">
              <div className="p-2 divide-y divide-border/40">
                {loading && (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!loading && presentations.map((presentation) => (
                  <div key={presentation.id} className="flex items-center justify-between p-2.5 hover:bg-muted/30 rounded-lg transition-colors">
                    <span className="text-xs font-medium text-foreground">{presentation.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDeletePresentation(presentation.id)}
                      title="Eliminar formato"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {!loading && presentations.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-6">No hay formatos creados aún.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-5 border-t border-border/60 flex items-center justify-end bg-muted/10">
          <Button type="button" variant="outline" className="rounded-xl border-border/60 hover:bg-white/5 font-medium" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
