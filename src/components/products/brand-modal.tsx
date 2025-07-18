
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2 } from 'lucide-react';

interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialBrands = [
    { id: 1, name: 'VATOS ALFA' },
    { id: 2, name: 'Reuzel' },
    { id: 3, name: 'Suavecito' },
];

export function BrandModal({ isOpen, onClose }: BrandModalProps) {
  const { toast } = useToast();
  const [brands, setBrands] = useState(initialBrands);
  const [newBrandName, setNewBrandName] = useState('');
  const [nextId, setNextId] = useState(initialBrands.length + 1);

  const handleAddBrand = () => {
    if (newBrandName.trim() === '') {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'El nombre de la marca no puede estar vacío.',
        });
        return;
    }
    
    setBrands([...brands, { id: nextId, name: newBrandName.trim() }]);
    setNextId(nextId + 1);
    setNewBrandName('');
    toast({
        title: 'Marca agregada',
        description: `La marca "${newBrandName.trim()}" ha sido creada.`,
    });
  };
  
  const handleDeleteBrand = (idToDelete: number) => {
    const brandToDelete = brands.find(c => c.id === idToDelete);
    if (brandToDelete) {
        setBrands(brands.filter(c => c.id !== idToDelete));
        toast({
            title: 'Marca eliminada',
            description: `La marca "${brandToDelete.name}" ha sido eliminada.`,
        });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva marca</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <div className="space-y-1">
                <Label htmlFor="brand-name">Nombre</Label>
                <div className="flex gap-2">
                    <Input 
                        id="brand-name" 
                        placeholder="Ingrese el nombre de la marca"
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddBrand()}
                    />
                    <Button variant="outline" onClick={handleAddBrand}>
                        <Check className="mr-2 h-4 w-4"/>
                        Agregar
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-48 rounded-md border">
                <div className="p-4">
                {brands.map((brand) => (
                    <div key={brand.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
                        <span className="text-sm">{brand.name}</span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive/70 hover:text-destructive"
                            onClick={() => handleDeleteBrand(brand.id)}
                        >
                            <Trash2 className="h-4 w-4"/>
                        </Button>
                    </div>
                ))}
                 {brands.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-4">No hay marcas creadas.</p>
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
