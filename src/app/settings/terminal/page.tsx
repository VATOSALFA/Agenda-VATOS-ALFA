

'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { httpsCallable, functions } from '@/lib/firebase-client';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/firebase-auth-context';

export default function TerminalSettingsPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [cashboxSettings, setCashboxSettings] = useState<any>(null);
    const [terminals, setTerminals] = useState<any[]>([]);
    const [isFetchingTerminals, setIsFetchingTerminals] = useState(false);

    useEffect(() => {
        const fetchCashboxSettings = async () => {
            if (!user) return;
            const settingsRef = doc(db, 'configuracion', 'caja');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                setCashboxSettings(docSnap.data());
            }
        }
        fetchCashboxSettings();
    }, [user]);

    const handleFetchTerminals = async () => {
        setIsFetchingTerminals(true);
        try {
            const getTerminals = httpsCallable(functions, 'getPointTerminals');
            const result: any = await getTerminals();
            
            if (result.data.success) {
                const pdvTerminals = result.data.devices.filter((d: any) => d.operating_mode === 'PDV');
                setTerminals(pdvTerminals);
                toast({
                    title: 'Terminales actualizadas',
                    description: `Se encontraron ${pdvTerminals.length} terminales en modo PDV.`,
                });
            } else {
                throw new Error(result.data.error || 'Error desconocido al obtener terminales.');
            }
        } catch (error: any) {
            console.error("Error al buscar terminales:", error);
            toast({
                variant: 'destructive',
                title: 'Error al buscar terminales',
                description: error.message,
            });
        } finally {
            setIsFetchingTerminals(false);
        }
    }

    const handleSetMainTerminal = async (terminalId: string, isChecked: boolean) => {
        if (!isChecked) return; // Only handle turning it on
        try {
            const settingsRef = doc(db, 'configuracion', 'caja');
            await setDoc(settingsRef, { mercadoPagoTerminalId: terminalId }, { merge: true });
            setCashboxSettings((prev: any) => ({...prev, mercadoPagoTerminalId: terminalId}));
            toast({ title: "Terminal principal actualizada." });
        } catch (error) {
            console.error("Error setting main terminal:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la terminal principal.'});
        }
    }

    return (
        <div className="flex-1 space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Terminal de Pagos</h2>
                <p className="text-muted-foreground">
                    Conecta y gestiona tus terminales de pago de Mercado Pago.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Configuración de Terminal</CardTitle>
                    <CardDescription>Conecta y gestiona tus terminales de pago de Mercado Pago.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Button onClick={handleFetchTerminals} disabled={isFetchingTerminals}>
                            {isFetchingTerminals && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Refrescar Terminales
                        </Button>
                    </div>
                    <div className="mt-4 border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Modo de Operación</TableHead>
                                    <TableHead>Principal</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetchingTerminals ? (
                                    <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="animate-spin h-6 w-6"/></TableCell></TableRow>
                                ) : terminals.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center h-24">No se encontraron terminales en modo PDV.</TableCell></TableRow>
                                ) : (
                                    terminals.map((terminal: any) => (
                                        <TableRow key={terminal.id}>
                                            <TableCell className="font-medium">{terminal.name}</TableCell>
                                            <TableCell>{terminal.id}</TableCell>
                                            <TableCell>{terminal.operating_mode}</TableCell>
                                            <TableCell>
                                                <Switch 
                                                    checked={cashboxSettings?.mercadoPagoTerminalId === terminal.id} 
                                                    onCheckedChange={(checked) => handleSetMainTerminal(terminal.id, checked)}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
