
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2, Loader2, X, Tag } from 'lucide-react';
import type { ProductCategory } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { collection, addDoc, deleteDoc, doc, Timestamp, getDocs } from 'firebase/firestore';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: (newCategoryId: string) => void;
  existingCategories?: ProductCategory[];
}

export function CategoryModal({ isOpen, onClose, onDataSaved, existingCategories = [] }: CategoryModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddCategory = async () => {
    if (newCategoryName.trim() === '') {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'El nombre de la categoría no puede estar vacío.',
        });
        return;
    }
    
    setIsSubmitting(true);
    try {
      if(!db) throw new Error("Database not available");
        const docRef = await addDoc(collection(db, 'categorias_productos'), {
            name: newCategoryName.trim(),
            order: existingCategories.length,
            created_at: Timestamp.now(),
        });
        
        setNewCategoryName('');
        onDataSaved(docRef.id);
        toast({
            title: 'Categoría agregada',
            description: `La categoría "${newCategoryName.trim()}" ha sido creada.`,
        });
        onClose();
    } catch (error) {
        console.error("Error creating category:", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'No se pudo crear la categoría.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleDeleteCategory = async (idToDelete: string) => {
    const categoryToDelete = existingCategories.find(c => c.id === idToDelete);
    if (categoryToDelete) {
        try {
            if(!db) throw new Error("Database not available");
            await deleteDoc(doc(db, 'categorias_productos', idToDelete));
            toast({
                title: 'Categoría eliminada',
                description: `La categoría "${categoryToDelete.name}" ha sido eliminada.`,
            });
            // Refetch is handled by parent's onDataSaved which triggers a queryKey update
            onDataSaved(''); // Pass empty string or a specific signal to refetch
        } catch (error) {
            console.error("Error deleting category:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo eliminar la categoría.',
            });
        }
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
              <Tag className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="font-bold text-base sm:text-lg text-white leading-tight">
                  Categorías
                </DialogTitle>
                <p className="text-xs text-slate-300">
                  Administra las categorías de productos
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
            <Label htmlFor="category-name" className="text-xs font-semibold">Nueva Categoría</Label>
            <div className="flex gap-2">
              <Input 
                id="category-name" 
                placeholder="Nombre de la categoría..."
                className="rounded-xl h-10"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                disabled={isSubmitting}
              />
              <Button 
                variant="alfa" 
                onClick={handleAddCategory} 
                disabled={isSubmitting}
                className="rounded-xl font-bold px-4 h-10 shadow-sm"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="mr-1.5 h-4 w-4"/>}
                Agregar
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Categorías existentes</Label>
            <ScrollArea className="h-52 rounded-xl border border-border/60">
              <div className="p-2 divide-y divide-border/40">
                {existingCategories && existingCategories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between p-2.5 hover:bg-muted/30 rounded-lg transition-colors">
                    <span className="text-xs font-medium text-foreground">{category.name}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => handleDeleteCategory(category.id)}
                      title="Eliminar categoría"
                    >
                      <Trash2 className="h-3.5 w-3.5"/>
                    </Button>
                  </div>
                ))}
                {(!existingCategories || existingCategories.length === 0) && (
                  <p className="text-center text-xs text-muted-foreground py-6">No hay categorías creadas aún.</p>
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
