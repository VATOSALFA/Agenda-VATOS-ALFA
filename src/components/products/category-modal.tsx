
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2 } from 'lucide-react';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialCategories = [
    { id: 1, name: 'Capilar' },
    { id: 2, name: 'Facial' },
    { id: 3, name: 'Barba' },
];

export function CategoryModal({ isOpen, onClose }: CategoryModalProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [nextId, setNextId] = useState(initialCategories.length + 1);

  const handleAddCategory = () => {
    if (newCategoryName.trim() === '') {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'El nombre de la categoría no puede estar vacío.',
        });
        return;
    }
    
    setCategories([...categories, { id: nextId, name: newCategoryName.trim() }]);
    setNextId(nextId + 1);
    setNewCategoryName('');
    toast({
        title: 'Categoría agregada',
        description: `La categoría "${newCategoryName.trim()}" ha sido creada.`,
    });
  };
  
  const handleDeleteCategory = (idToDelete: number) => {
    const categoryToDelete = categories.find(c => c.id === idToDelete);
    if (categoryToDelete) {
        setCategories(categories.filter(c => c.id !== idToDelete));
        toast({
            title: 'Categoría eliminada',
            description: `La categoría "${categoryToDelete.name}" ha sido eliminada.`,
        });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva categoría</DialogTitle>
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
                {categories.map((category) => (
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
                 {categories.length === 0 && (
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
