

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Client } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Combine, User, Mail, Phone, ArrowRight, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '../ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { writeBatch, collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';


interface CombineClientsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClientsCombined: () => void;
}

interface DuplicateGroup {
  key: string;
  clients: Client[];
}

export function CombineClientsModal({ isOpen, onOpenChange, onClientsCombined }: CombineClientsModalProps) {
  const [step, setStep] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const { data: clients, loading } = useFirestoreQuery<Client>('clientes', isOpen);

  const duplicateGroups = useMemo(() => {
    if (loading || clients.length === 0) return [];
    
    const groups: Record<string, Client[]> = {};

    clients.forEach(client => {
      // Group by email
      if (client.correo) {
        const key = `email:${client.correo.toLowerCase()}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(client);
      }
      // Group by phone
      if (client.telefono) {
        const key = `phone:${client.telefono.replace(/\D/g, '')}`;
        if (!groups[key]) groups[key] = [];
        if (!groups[key].some(c => c.id === client.id)) {
            groups[key].push(client);
        }
      }
    });

    return Object.entries(groups)
      .filter(([_, clientList]) => clientList.length > 1)
      .map(([key, clientList]) => ({ key, clients: clientList }));
  }, [clients, loading]);


  const handleSelectGroup = (group: DuplicateGroup) => {
    setSelectedGroup(group);
    setPrimaryClientId(group.clients[0].id); // Default to first client
    setStep(2);
  };
  
  const handleCombine = async () => {
    if (!selectedGroup || !primaryClientId) return;
    setIsProcessing(true);

    try {
        const primaryClient = selectedGroup.clients.find(c => c.id === primaryClientId);
        const secondaryClients = selectedGroup.clients.filter(c => c.id !== primaryClientId);

        if (!primaryClient) throw new Error("Cliente principal no encontrado.");

        const batch = writeBatch(db);

        // Move reservations and sales from secondary clients to primary
        for (const secondaryClient of secondaryClients) {
            const reservationsQuery = query(collection(db, 'reservas'), where('cliente_id', '==', secondaryClient.id));
            const salesQuery = query(collection(db, 'ventas'), where('cliente_id', '==', secondaryClient.id));
            
            const [reservationsSnapshot, salesSnapshot] = await Promise.all([
                getDocs(reservationsQuery),
                getDocs(salesQuery)
            ]);

            reservationsSnapshot.forEach(doc => {
                batch.update(doc.ref, { cliente_id: primaryClientId });
            });

            salesSnapshot.forEach(doc => {
                batch.update(doc.ref, { cliente_id: primaryClientId });
            });
            
            // Delete secondary client
            batch.delete(doc(db, 'clientes', secondaryClient.id));
        }

        // Here you could add logic to merge specific fields into the primary client if needed
        // For now, we are just re-assigning historical data and deleting the duplicate.
        // Example: batch.update(doc(db, 'clientes', primaryClientId), { notas: mergedNotes });

        await batch.commit();

        toast({
            title: "¡Clientes Combinados!",
            description: `Se combinaron ${secondaryClients.length + 1} registros en uno solo.`,
        });
        
        onClientsCombined();
        handleClose();

    } catch (error) {
        console.error("Error combining clients:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudieron combinar los clientes. Inténtalo de nuevo."
        });
    } finally {
        setIsProcessing(false);
        setIsConfirming(false);
    }
  };


  const handleClose = () => {
    setStep(1);
    setSelectedGroup(null);
    setPrimaryClientId(null);
    onOpenChange(false);
  };

  const ComparisonField = ({ label, primaryValue, secondaryValues }: { label: string, primaryValue?: string, secondaryValues: (string | undefined)[] }) => {
    const primaryClient = selectedGroup?.clients.find(c => c.id === primaryClientId);
    
    return (
        <div className="grid grid-cols-2 gap-4 border-b py-2">
            <div className="font-semibold">{label}</div>
            <div className="text-sm">
                <p className="font-bold text-primary">{primaryValue || 'N/A'}</p>
                {secondaryValues.map((val, i) => (
                    val && val !== primaryValue && <p key={i} className="text-xs text-muted-foreground line-through">{val}</p>
                ))}
            </div>
        </div>
    )
  };


  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Combine className="h-6 w-6" /> Combinar Clientes Duplicados</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Selecciona un grupo de clientes duplicados para combinar.' : 'Elige el registro principal y confirma la combinación.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
            <ScrollArea className="flex-grow my-4">
                <div className="space-y-4 pr-4">
                {loading && <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>}
                {!loading && duplicateGroups.length === 0 && (
                    <p className="text-center text-muted-foreground py-10">No se encontraron clientes duplicados.</p>
                )}
                {duplicateGroups.map(group => (
                    <Card key={group.key} className="hover:border-primary transition-colors">
                    <CardHeader>
                        <CardTitle className="text-lg">Duplicados por: {group.key.split(':')[0] === 'email' ? 'Correo' : 'Teléfono'}</CardTitle>
                        <p className="text-sm text-muted-foreground">{group.key.split(':')[1]}</p>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                        {group.clients.map(client => (
                            <li key={client.id} className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span>{client.nombre} {client.apellido}</span>
                                <span className="text-xs text-muted-foreground">({client.id})</span>
                            </li>
                        ))}
                        </ul>
                        <Button className="mt-4" onClick={() => handleSelectGroup(group)}>Combinar este grupo <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    </CardContent>
                    </Card>
                ))}
                </div>
            </ScrollArea>
        )}
        
        {step === 2 && selectedGroup && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 flex-grow overflow-hidden">
                <ScrollArea className="pr-4">
                <RadioGroup value={primaryClientId ?? undefined} onValueChange={setPrimaryClientId}>
                    <div className="space-y-4">
                        <h3 className="font-bold text-lg">Selecciona el registro a conservar:</h3>
                        {selectedGroup.clients.map(client => (
                        <Label key={client.id} htmlFor={client.id} className="flex items-start gap-4 p-4 border rounded-lg cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                            <RadioGroupItem value={client.id} id={client.id} className="mt-1" />
                            <div className="space-y-1">
                                <p className="font-semibold">{client.nombre} {client.apellido}</p>
                                <p className="text-sm flex items-center gap-2"><Mail className="h-3 w-3"/>{client.correo || 'N/A'}</p>
                                <p className="text-sm flex items-center gap-2"><Phone className="h-3 w-3"/>{client.telefono || 'N/A'}</p>
                            </div>
                        </Label>
                        ))}
                    </div>
                </RadioGroup>
                </ScrollArea>
                <Card className="bg-card/50">
                    <CardHeader>
                        <CardTitle>Resumen de combinación</CardTitle>
                        <CardDescription>Los datos de los registros no seleccionados se transferirán al registro principal.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {primaryClientId && (
                            <ComparisonField
                                label="Nombre Completo"
                                primaryValue={`${selectedGroup.clients.find(c => c.id === primaryClientId)?.nombre} ${selectedGroup.clients.find(c => c.id === primaryClientId)?.apellido}`}
                                secondaryValues={selectedGroup.clients.filter(c => c.id !== primaryClientId).map(c => `${c.nombre} ${c.apellido}`)}
                            />
                        )}
                        {primaryClientId && (
                            <ComparisonField
                                label="Correo"
                                primaryValue={selectedGroup.clients.find(c => c.id === primaryClientId)?.correo}
                                secondaryValues={selectedGroup.clients.filter(c => c.id !== primaryClientId).map(c => c.correo)}
                            />
                        )}
                        {primaryClientId && (
                            <ComparisonField
                                label="Teléfono"
                                primaryValue={selectedGroup.clients.find(c => c.id === primaryClientId)?.telefono}
                                secondaryValues={selectedGroup.clients.filter(c => c.id !== primaryClientId).map(c => c.telefono)}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={step === 1 ? handleClose : () => setStep(1)}>
            {step === 1 ? 'Cerrar' : 'Volver'}
          </Button>
          {step === 2 && (
            <Button onClick={() => setIsConfirming(true)} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Combinar Clientes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {isConfirming && (
        <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-destructive" /> ¿Confirmar Combinación?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción es irreversible. Se combinarán los clientes seleccionados. Todo el historial (citas, ventas) será asignado al cliente principal y los otros registros serán eliminados permanentemente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCombine} className="bg-destructive hover:bg-destructive/90">
                        Sí, combinar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </>
  );
}
