'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2, FolderKanban, X } from 'lucide-react';
import type { ServiceCategory } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { collection, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: (newCategory: ServiceCategory) => void;
  existingCategories?: ServiceCategory[];
}

export function CategoryModal({ isOpen, onClose, onDataSaved, existingCategories = [] }: CategoryModalProps) {
  const { toast } = useToast();
  const { db } = useAuth();
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleAddCategory = async () => {
    if (newCategoryName.trim() === '') {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'El nombre de la categoría no puede estar vacío.',
      });
      return;
    }

    try {
      if (!db) throw new Error("Database not available");
      const docRef = await addDoc(collection(db, 'categorias_servicios'), {
        name: newCategoryName.trim(),
        order: existingCategories.length,
        created_at: Timestamp.now(),
      });
      const newCategory = { id: docRef.id, name: newCategoryName.trim(), order: existingCategories.length };
      setNewCategoryName('');
      if (onDataSaved) onDataSaved(newCategory);
      toast({
        title: 'Categoría agregada',
        description: `La categoría "${newCategory.name}" ha sido creada.`,
      });
      onClose();
    } catch (error) {
      console.error("Error creating category:", error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo crear la categoría.',
      });
    }
  };

  const handleDeleteCategory = async (idToDelete: string) => {
    const categoryToDelete = existingCategories.find(c => c.id === idToDelete);
    if (categoryToDelete) {
      try {
        if (!db) throw new Error("Database not available");
        await deleteDoc(doc(db, 'categorias_servicios', idToDelete));
        toast({
          title: 'Categoría eliminada',
          description: `La categoría "${categoryToDelete.name}" ha sido eliminada.`,
        });
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
      <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card">
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-border/60">
          <div className="header-light-beam" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FolderKanban className="h-5 w-5 text-slate-300" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Administrar Categorías
                </DialogTitle>
                <p className="text-xs text-slate-300">
                  Organiza y clasifica los servicios de tu negocio
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category-name" className="text-xs font-medium text-muted-foreground">Nombre de la categoría</Label>
            <div className="flex gap-2">
              <Input
                id="category-name"
                placeholder="Ej. Barbería, Spa, Tintes..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                className="h-9 text-xs sm:text-sm bg-background border-border/60 focus-visible:ring-blue-500"
              />
              <Button variant="alfa" size="sm" onClick={handleAddCategory} className="px-3 shrink-0">
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Categorías existentes</Label>
            <ScrollArea className="h-52 rounded-xl border border-border/60 bg-muted/10 p-2">
              <div className="space-y-1">
                {existingCategories && existingCategories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between py-1.5 px-3 hover:bg-muted/40 rounded-lg border border-border/30 transition-colors">
                    <span className="text-xs sm:text-sm font-medium">{category.name}</span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-400 p-1 transition-colors rounded-md"
                      onClick={() => handleDeleteCategory(category.id)}
                      title="Eliminar categoría"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {(!existingCategories || existingCategories.length === 0) && (
                  <p className="text-center text-xs text-muted-foreground py-8">No hay categorías creadas aún.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="p-3 sm:p-4 border-t border-border/60 flex justify-end bg-muted/20">
          <Button variant="ghost" size="sm" type="button" onClick={onClose} className="text-xs">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
