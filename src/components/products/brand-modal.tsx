
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2, Loader2, X, Sparkles } from 'lucide-react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { ProductBrand } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { collection, addDoc, deleteDoc, doc, Timestamp, getDocs } from 'firebase/firestore';

interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: (newBrandId: string) => void;
}

export function BrandModal({ isOpen, onClose, onDataSaved }: BrandModalProps) {
  const { toast } = useToast();
  const [newBrandName, setNewBrandName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queryKey, setQueryKey] = useState(0);
  const { db } = useAuth();

  const { data: brands, loading } = useFirestoreQuery<ProductBrand>('marcas_productos', queryKey);

  const handleAddBrand = async () => {
    if (!db) return;
    if (newBrandName.trim() === '') {
        toast({ variant: 'destructive', title: 'Error', description: 'El nombre de la marca no puede estar vacío.' });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const querySnapshot = await getDocs(collection(db, 'marcas_productos'));
        const order = querySnapshot.size;

        const docRef = await addDoc(collection(db, 'marcas_productos'), {
            name: newBrandName.trim(),
            order,
            created_at: Timestamp.now(),
        });
        setNewBrandName('');
        toast({ title: 'Marca agregada' });
        onDataSaved(docRef.id);
        onClose();
    } catch (error) {
        console.error("Error creating brand:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la marca.' });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleDeleteBrand = async (idToDelete: string) => {
     if (!db) return;
     try {
        await deleteDoc(doc(db, 'marcas_productos', idToDelete));
        toast({ title: 'Marca eliminada' });
        setQueryKey(prev => prev + 1);
     } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la marca.' });
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
              <Sparkles className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                  Marcas
                </DialogTitle>
                <p className="text-xs text-slate-300">
                  Administra las marcas de productos
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
            <Label htmlFor="brand-name" className="text-xs font-semibold">Nueva Marca</Label>
            <div className="flex gap-2">
              <Input 
                id="brand-name" 
                placeholder="Nombre de la marca..."
                className="rounded-xl h-10"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBrand()}
                disabled={isSubmitting}
              />
              <Button 
                variant="alfa" 
                onClick={handleAddBrand} 
                disabled={isSubmitting}
                className="rounded-xl font-bold px-4 h-10 shadow-sm"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4"/>}
                Agregar
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Marcas existentes</Label>
            <ScrollArea className="h-52 rounded-xl border border-border/60">
              <div className="p-2 divide-y divide-border/40">
                {loading && (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>
                  </div>
                )}
                {!loading && brands.map((brand) => (
                  <div key={brand.id} className="flex items-center justify-between p-2.5 hover:bg-muted/30 rounded-lg transition-colors">
                    <span className="text-xs font-medium text-foreground">{brand.name}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDeleteBrand(brand.id)}
                      title="Eliminar marca"
                    >
                      <Trash2 className="h-3.5 w-3.5"/>
                    </Button>
                  </div>
                ))}
                {!loading && brands.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-6">No hay marcas creadas aún.</p>
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
