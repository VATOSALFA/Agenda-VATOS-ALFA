
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2 } from 'lucide-react';
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
      if(!db) throw new Error("Database not available");
        const docRef = await addDoc(collection(db, 'categorias_servicios'), {
            name: newCategoryName.trim(),
            order: existingCategories.length,
            created_at: Timestamp.now(),
        });
        const newCategory = { id: docRef.id, name: newCategoryName.trim(), order: existingCategories.length };
        setNewCategoryName('');
        if(onDataSaved) onDataSaved(newCategory);
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
            if(!db) throw new Error("Database not available");
            await deleteDoc(doc(db, 'categorias_servicios', idToDelete));
            toast({
                title: 'Categoría eliminada',
                description: `La categoría "${categoryToDelete.name}" ha sido eliminada.`,
            });
            // Refetch is handled by the parent component's queryKey update
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Administrar Categorías</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <div className="space-y-1">
                <Label htmlFor="category-name">Nombre</Label>
                <div className="flex gap-2">
                    <Input 
                        id="category-name" 
                        placeholder="Ingrese el nombre de la categoría"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    />
                    <Button variant="outline" onClick={handleAddCategory}>
                        <Check className="mr-2 h-4 w-4"/>
                        Agregar
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-48 rounded-md border">
                <div className="p-4">
                {existingCategories && existingCategories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
                        <span className="text-sm">{category.name}</span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive/70 hover:text-destructive"
                            onClick={() => handleDeleteCategory(category.id)}
                        >
                            <Trash2 className="h-4 w-4"/>
                        </Button>
                    </div>
                ))}
                 {(!existingCategories || existingCategories.length === 0) && (
                    <p className="text-center text-sm text-muted-foreground py-4">No hay categorías creadas.</p>
                 )}
                </div>
            </ScrollArea>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
