
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Client } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Loader2, Combine, User, Mail, Phone, ArrowRight, AlertTriangle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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

    const { data: clients, loading } = useFirestoreQuery<Client>(
        'clientes',
        isOpen ? 'active' : 'inactive',
        !isOpen ? where('numero_cliente', '==', 'NO_EXISTE_9999') : undefined
    );

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
        if (!selectedGroup || !primaryClientId || !db) return;
        setIsProcessing(true);

        try {
            const primaryClient = selectedGroup.clients.find(c => c.id === primaryClientId);
            const secondaryClients = selectedGroup.clients.filter(c => c.id !== primaryClientId);

            if (!primaryClient) throw new Error("Cliente principal no encontrado.");

            const batch = writeBatch(db);

            let extraPoints = 0;
            const extraNotes: string[] = [];

            // Move reservations and sales from secondary clients to primary
            for (const secondaryClient of secondaryClients) {
                const reservationsQuery = query(collection(db, 'reservas'), where('cliente_id', '==', secondaryClient.id));
                const salesQuery = query(collection(db, 'ventas'), where('cliente_id', '==', secondaryClient.id));

                const [reservationsSnapshot, salesSnapshot] = await Promise.all([
                    getDocs(reservationsQuery),
                    getDocs(salesQuery)
                ]);

                reservationsSnapshot.forEach(docSnap => {
                    batch.update(docSnap.ref, { cliente_id: primaryClientId });
                });

                salesSnapshot.forEach(docSnap => {
                    batch.update(docSnap.ref, { cliente_id: primaryClientId });
                });

                if (secondaryClient.puntos) {
                    extraPoints += secondaryClient.puntos;
                }

                if (secondaryClient.notas && secondaryClient.notas.trim()) {
                    extraNotes.push(secondaryClient.notas.trim());
                }

                // Delete secondary client
                batch.delete(doc(db, 'clientes', secondaryClient.id));
            }

            // Fetch ALL reservations and sales for primary client (including newly assigned ones)
            const allPrimaryReservationsQuery = query(collection(db, 'reservas'), where('cliente_id', '==', primaryClientId));
            const allPrimarySalesQuery = query(collection(db, 'ventas'), where('cliente_id', '==', primaryClientId));

            const [allResSnap, allSalesSnap] = await Promise.all([
                getDocs(allPrimaryReservationsQuery),
                getDocs(allPrimarySalesQuery)
            ]);

            const allRes = allResSnap.docs.map(d => d.data());
            const allSales = allSalesSnap.docs.map(d => d.data());

            const totalCount = allRes.length;
            const attendedCount = allRes.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado').length;
            const unattendedCount = allRes.filter(r => r.estado === 'No asiste').length;
            const cancelledCount = allRes.filter(r => r.estado === 'Cancelado').length;

            const validSales = allSales.filter(s => !['Pendiente', 'Anulado', 'Cancelado'].includes(s.pago_estado || ''));
            const totalSpent = validSales.reduce((acc, sale) => {
                const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real !== null)
                    ? sale.monto_pagado_real
                    : (sale.total || 0);
                return acc + amount;
            }, 0);

            const finalPoints = (primaryClient.puntos || 0) + extraPoints;

            let finalNotes = primaryClient.notas || '';
            if (extraNotes.length > 0) {
                const mergedText = extraNotes.filter(n => !finalNotes.includes(n)).join(' | ');
                if (mergedText) {
                    finalNotes = finalNotes ? `${finalNotes}\n[Notas combinadas]: ${mergedText}` : `[Notas combinadas]: ${mergedText}`;
                }
            }

            // Update primary client document with consolidated stats
            const primaryRef = doc(db, 'clientes', primaryClientId);
            batch.update(primaryRef, {
                citas_totales: totalCount,
                citas_asistidas: attendedCount,
                citas_no_asistidas: unattendedCount,
                citas_canceladas: cancelledCount,
                gasto_total: totalSpent,
                puntos: finalPoints,
                notas: finalNotes
            });

            await batch.commit();

            toast({
                title: "¡Clientes Combinados!",
                description: `Se combinaron ${secondaryClients.length + 1} registros en uno solo. Citas totales: ${totalCount}, Gasto acumulado: $${totalSpent.toFixed(2)}.`,
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
        onOpenChange(false);
    };

    useEffect(() => {
        if (!isOpen) {
            const timer = setTimeout(() => {
                setStep(1);
                setSelectedGroup(null);
                setPrimaryClientId(null);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const ComparisonField = ({ label, primaryValue, secondaryValues }: { label: string, primaryValue?: string, secondaryValues: (string | undefined)[] }) => {
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
                <DialogContent hideCloseButton={true} className="sm:max-w-4xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
                    {/* Header Oficial Vatos Alfa */}
                    <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-3 min-w-0">
                                <Combine className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Combinar Clientes Duplicados
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300">
                                        {step === 1 ? 'Selecciona un grupo de clientes duplicados para unificar sus datos.' : 'Elige el registro principal y confirma la combinación.'}
                                    </DialogDescription>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleClose}
                                className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {step === 1 && (
                        <div className="flex-grow overflow-y-auto max-h-[58vh] p-4 sm:p-5">
                            <div className="space-y-4">
                                {loading && <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
                                {!loading && duplicateGroups.length === 0 && (
                                    <p className="text-center text-muted-foreground py-10 text-xs">No se encontraron clientes duplicados.</p>
                                )}
                                {duplicateGroups.map(group => (
                                    <Card key={group.key} className="hover:border-primary/50 transition-colors">
                                        <CardHeader className="p-4 pb-2">
                                            <CardTitle className="text-sm font-semibold">Duplicados por: {group.key.split(':')[0] === 'email' ? 'Correo' : 'Teléfono'}</CardTitle>
                                            <p className="text-xs text-muted-foreground font-mono">{group.key.split(':')[1]}</p>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <ul className="space-y-1.5 mt-2">
                                                {group.clients.map(client => (
                                                    <li key={client.id} className="flex items-center gap-2 text-xs">
                                                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        <span className="font-medium text-foreground">{client.nombre} {client.apellido}</span>
                                                        <span className="text-[11px] text-muted-foreground font-mono">({client.numero_cliente ? `#${client.numero_cliente}` : client.id?.slice(0, 6)})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button
                                                className="btn-vatos-alfa rounded-xl h-8 px-3 text-xs font-semibold text-white mt-3"
                                                onClick={() => handleSelectGroup(group)}
                                            >
                                                Combinar este grupo <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 2 && selectedGroup && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-5 flex-grow overflow-y-auto max-h-[58vh]">
                            <div className="overflow-y-auto pr-1">
                                <RadioGroup value={primaryClientId ?? undefined} onValueChange={setPrimaryClientId}>
                                    <div className="space-y-3">
                                        <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-500">Selecciona el registro a conservar:</h3>
                                        {selectedGroup.clients.map(client => (
                                            <Label key={client.id} htmlFor={client.id} className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-500/5 transition-colors">
                                                <RadioGroupItem value={client.id} id={client.id} className="mt-1" />
                                                <div className="space-y-1 text-xs">
                                                    <p className="font-semibold text-sm text-foreground">{client.nombre} {client.apellido}</p>
                                                    <p className="text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" />{client.correo || 'N/A'}</p>
                                                    <p className="text-muted-foreground flex items-center gap-1.5"><Phone className="h-3 w-3" />{client.telefono || 'N/A'}</p>
                                                </div>
                                            </Label>
                                        ))}
                                    </div>
                                </RadioGroup>
                            </div>
                            <Card className="bg-muted/30 border-border/60">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-semibold">Resumen de combinación</CardTitle>
                                    <CardDescription className="text-xs">Los datos e historial de los demás registros se transferirán al principal.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-1 text-xs">
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

                    <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2 shrink-0">
                        {step === 1 ? (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={handleClose}
                                className="rounded-xl h-9 text-xs"
                            >
                                Cerrar
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setStep(1)}
                                className="rounded-xl h-9 text-xs"
                            >
                                Volver
                            </Button>
                        )}
                        {step === 2 && (
                            <Button
                                onClick={() => setIsConfirming(true)}
                                disabled={isProcessing}
                                className="btn-vatos-alfa rounded-xl h-9 px-4 text-xs font-bold text-white shadow-md"
                            >
                                {isProcessing && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                Combinar Clientes
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
                <AlertDialogContent className="p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background max-w-md">
                    {/* Header Oficial Vatos Alfa */}
                    <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center gap-3">
                            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                            <div>
                                <AlertDialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                    ¿Confirmar Combinación?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-xs text-slate-300">
                                    Esta acción es irreversible
                                </AlertDialogDescription>
                            </div>
                        </div>
                    </div>
                    <div className="p-5 text-xs text-muted-foreground leading-relaxed">
                        Se combinarán los clientes seleccionados en un único registro. Todo el historial (citas, ventas y notas) será transferido al cliente principal y los registros secundarios serán eliminados permanentemente.
                    </div>
                    <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2">
                        <AlertDialogCancel className="rounded-xl h-9 text-xs">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCombine} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl h-9 px-4 text-xs font-semibold shadow-sm">
                            Sí, combinar registros
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
