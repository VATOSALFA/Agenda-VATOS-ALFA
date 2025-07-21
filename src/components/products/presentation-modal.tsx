
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
import type { ProductPresentation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, Timestamp, getDocs } from 'firebase/firestore';

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSaved: (newPresentationId: string) => void;
}

export function PresentationModal({ isOpen, onClose, onDataSaved }: PresentationModalProps) {
  const { toast } = useToast();
  const [newPresentationName, setNewPresentationName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queryKey, setQueryKey] = useState(0);

  const { data: presentations, loading } = useFirestoreQuery<ProductPresentation>('formatos_productos', queryKey);

  const handleAddPresentation = async () => {
    if (newPresentationName.trim() === '') {
        toast({ variant: 'destructive', title: 'Error', description: 'El nombre del formato no puede estar vacío.' });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const querySnapshot = await getDocs(collection(db, 'formatos_productos'));
        const order = querySnapshot.size;

        const docRef = await addDoc(collection(db, 'formatos_productos'), {
            name: newPresentationName.trim(),
            order,
            created_at: Timestamp.now(),
        });
        setNewPresentationName('');
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Administrar Formatos/Presentaciones</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <div className="space-y-1">
                <Label htmlFor="presentation-name">Nombre</Label>
                <div className="flex gap-2">
                    <Input 
                        id="presentation-name" 
                        placeholder="Ej: 100ml, 80gr, Unidad"
                        value={newPresentationName}
                        onChange={(e) => setNewPresentationName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddPresentation()}
                        disabled={isSubmitting}
                    />
                    <Button variant="outline" onClick={handleAddPresentation} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4"/>}
                        Agregar
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-48 rounded-md border">
                <div className="p-4">
                {loading && <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin"/></div>}
                {!loading && presentations.map((presentation) => (
                    <div key={presentation.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md">
                        <span className="text-sm">{presentation.name}</span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive/70 hover:text-destructive"
                            onClick={() => handleDeletePresentation(presentation.id)}
                        >
                            <Trash2 className="h-4 w-4"/>
                        </Button>
                    </div>
                ))}
                 {!loading && presentations.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-4">No hay formatos creados.</p>
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
