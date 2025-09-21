
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2, Loader2 } from 'lucide-react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { ProductBrand } from '@/lib/types';
import { db } from '@/lib/firebase';
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

  const { data: brands, loading } = useFirestoreQuery<ProductBrand>('marcas_productos', queryKey);

  const handleAddBrand = async () => {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Administrar Marcas</DialogTitle>
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
                        disabled={isSubmitting}
                    />
                    <Button variant="outline" onClick={handleAddBrand} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4"/>}
                        Agregar
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-48 rounded-md border">
                <div className="p-4">
                {loading && <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin"/></div>}
                {!loading && brands.map((brand) => (
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
                 {!loading && brands.length === 0 && (
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
