
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2 } from 'lucide-react';

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialPresentations = [
    { id: 1, name: '100ml' },
    { id: 2, name: '120 ml' },
    { id: 3, name: '150' },
    { id: 4, name: '150 gr.' },
    { id: 5, name: '20gr' },
    { id: 6, name: '30 ml' },
    { id: 7, name: '500 ml' },
];

export function PresentationModal({ isOpen, onClose }: PresentationModalProps) {
  const { toast } = useToast();
  const [presentations, setPresentations] = useState(initialPresentations);
  const [newPresentationName, setNewPresentationName] = useState('');
  const [nextId, setNextId] = useState(initialPresentations.length + 1);

  const handleAddPresentation = () => {
    if (newPresentationName.trim() === '') {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'El nombre del formato no puede estar vacío.',
        });
        return;
    }
    
    setPresentations([...presentations, { id: nextId, name: newPresentationName.trim() }]);
    setNextId(nextId + 1);
    setNewPresentationName('');
    toast({
        title: 'Formato agregado',
        description: `El formato "${newPresentationName.trim()}" ha sido creado.`,
    });
  };
  
  const handleDeletePresentation = (idToDelete: number) => {
    const presentationToDelete = presentations.find(c => c.id === idToDelete);
    if (presentationToDelete) {
        setPresentations(presentations.filter(c => c.id !== idToDelete));
        toast({
            title: 'Formato eliminado',
            description: `El formato "${presentationToDelete.name}" ha sido eliminado.`,
        });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo formato/presentación</DialogTitle>
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
                    />
                    <Button variant="outline" onClick={handleAddPresentation}>
                        <Check className="mr-2 h-4 w-4"/>
                        Agregar
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-48 rounded-md border">
                <div className="p-4">
                {presentations.map((presentation) => (
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
                 {presentations.length === 0 && (
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
