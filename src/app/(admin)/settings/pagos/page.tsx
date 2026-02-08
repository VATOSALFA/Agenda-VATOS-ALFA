

'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, Copy, Info } from "lucide-react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';

import { BluetoothPrinter } from '@/lib/printer';
import { httpsCallable, functions } from '@/lib/firebase-client';
import { writeBatch } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PagosSettings {
    showTips: boolean;
    onlinePayments: boolean;
    collectionLink: boolean;
    editReservationStatus: boolean;
    bank: string;
    accountHolder: string;
    clabe: string;
    mercadoPagoPublicKey: string;
    mercadoPagoAccessToken: string;
    mercadoPagoUserId: string;
    ticketPrinterEnabled: boolean;
    ticketPrinterDeviceName: string;
}

export default function PagosAgendaProPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);

    // Terminal Settings State
    const { user } = useAuth();
    const [cashboxSettings, setCashboxSettings] = useState<any>(null);
    const [isFetchingTerminals, setIsFetchingTerminals] = useState(false);
    const [queryKey, setQueryKey] = useState(0);

    const { data: terminals, loading: terminalsLoading } = useFirestoreQuery<any>('terminales', queryKey);

    const form = useForm<PagosSettings>({
        defaultValues: {
            showTips: true,
            onlinePayments: true,
            collectionLink: true,
            editReservationStatus: false,
            bank: '',
            accountHolder: '',
            clabe: '',
            mercadoPagoPublicKey: '',
            mercadoPagoAccessToken: '',
            mercadoPagoUserId: '',
            ticketPrinterEnabled: false,
            ticketPrinterDeviceName: '',
        }
    });

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                // Fetch Generic Payment Settings
                const pagosRef = doc(db, 'configuracion', 'pagos');
                const pagosSnap = await getDoc(pagosRef);
                const pagosData = pagosSnap.exists() ? pagosSnap.data() : {};

                // Fetch Mercado Pago Credentials
                const mpRef = doc(db, 'configuracion', 'mercadopago');
                const mpSnap = await getDoc(mpRef);
                const mpData = mpSnap.exists() ? mpSnap.data() : {};

                form.reset({
                    ...pagosData,
                    mercadoPagoPublicKey: mpData.publicKey || '',
                    mercadoPagoAccessToken: mpData.accessToken || '',
                    mercadoPagoUserId: mpData.userId || '',
                    // Default values if missing in pagosData
                    showTips: pagosData.showTips ?? true,
                    onlinePayments: pagosData.onlinePayments ?? true,
                    collectionLink: pagosData.collectionLink ?? true,
                    editReservationStatus: pagosData.editReservationStatus ?? false,
                    bank: pagosData.bank || '',
                    accountHolder: pagosData.accountHolder || '',
                    clabe: pagosData.clabe || '',
                    ticketPrinterEnabled: pagosData.ticketPrinterEnabled ?? false,
                    ticketPrinterDeviceName: pagosData.ticketPrinterDeviceName || '',
                } as PagosSettings);

            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, [form]);

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
    }, [user, queryKey]);

    const handleFetchAndSaveTerminals = async () => {
        setIsFetchingTerminals(true);
        try {
            const getTerminalsFunction = httpsCallable(functions, 'getPointTerminals');
            const result: any = await getTerminalsFunction();

            if (result.data.success) {
                const fetchedTerminals = result.data.devices.filter((d: any) => d.operating_mode === 'PDV');

                const batch = writeBatch(db);
                fetchedTerminals.forEach((terminal: any) => {
                    const terminalRef = doc(db, 'terminales', terminal.id);
                    batch.set(terminalRef, terminal, { merge: true });
                });
                await batch.commit();

                setQueryKey(prev => prev + 1); // Trigger refetch from our DB
                toast({
                    title: 'Terminales actualizadas',
                    description: `Se encontraron y guardaron ${fetchedTerminals.length} terminales en modo PDV.`,
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
        const newTerminalId = isChecked ? terminalId : null;
        try {
            const settingsRef = doc(db, 'configuracion', 'caja');
            await setDoc(settingsRef, { mercadoPagoTerminalId: newTerminalId }, { merge: true });
            setCashboxSettings((prev: any) => ({ ...prev, mercadoPagoTerminalId: newTerminalId }));
            toast({ title: "Terminal principal actualizada." });
        } catch (error) {
            console.error("Error setting main terminal:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la terminal principal.' });
        }
    }

    // Helper functionality
    const collectionUrl = 'https://vatosalfa--agenda-1ae08.us-central1.hosted.app/link-cobro';

    const copyToClipboard = () => {
        navigator.clipboard.writeText(collectionUrl);
        toast({
            title: '¡Copiado!',
            description: 'El link de cobro ha sido copiado al portapapeles.',
        });
    }

    const handleConnectPrinter = async () => {
        setIsConnectingPrinter(true);
        try {
            const printer = BluetoothPrinter.getInstance();
            const deviceName = await printer.connect();
            form.setValue('ticketPrinterDeviceName', deviceName);
            form.setValue('ticketPrinterEnabled', true);
            toast({
                title: "Impresora Conectada",
                description: `Se ha vinculado correctamente con: ${deviceName}`,
            });
        } catch (error: any) {
            console.error("Printer connection error:", error);
            toast({
                variant: "destructive",
                title: "Error de conexión",
                description: error.message || "No se pudo conectar con la impresora.",
            });
        } finally {
            setIsConnectingPrinter(false);
        }
    };

    const handleTestPrint = async () => {
        try {
            const printer = BluetoothPrinter.getInstance();
            if (!printer.isConnected()) {
                await printer.connect();
            }
            await printer.print(`
            PRUEBA DE IMPRESION
            -------------------
            Agenda VATOS ALFA
            Sistema Profesional
            -------------------
            Funcionando correctamente.
            \n\n\n`);
            toast({ title: "Imprimiendo..." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    }

    const onSubmit = async (data: PagosSettings) => {
        setIsSubmitting(true);
        try {
            // 1. Save Generic Payment Settings
            const pagosRef = doc(db, 'configuracion', 'pagos');
            const pagosData = {
                showTips: data.showTips,
                onlinePayments: data.onlinePayments,
                collectionLink: data.collectionLink,
                editReservationStatus: data.editReservationStatus,
                bank: data.bank,
                accountHolder: data.accountHolder,
                clabe: data.clabe,
                ticketPrinterEnabled: data.ticketPrinterEnabled,
                ticketPrinterDeviceName: data.ticketPrinterDeviceName,
            };
            await setDoc(pagosRef, pagosData, { merge: true });

            // 2. Save Mercado Pago Credentials (separately for backend security/isolation)
            const mpRef = doc(db, 'configuracion', 'mercadopago');
            const mpData = {
                publicKey: data.mercadoPagoPublicKey,
                accessToken: data.mercadoPagoAccessToken,
                userId: data.mercadoPagoUserId
            };
            await setDoc(mpRef, mpData, { merge: true });

            toast({
                title: "Configuración guardada con éxito",
                description: "Tus credenciales y preferencias han sido actualizadas."
            })
        } catch (error) {
            console.error("Error saving payment settings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Pagos</h2>
                <p className="text-muted-foreground">
                    Configura tus métodos de pago, comisiones y credenciales.
                </p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">

                <Accordion type="multiple" defaultValue={[]} className="w-full space-y-4">


                    <AccordionItem value="item-3" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6 font-semibold text-base">Proveedores de pago externos (Mercado pago)</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Si tienes una cuenta de MercadoPago puedes agregar tus propias credenciales para que las ventas se procesen a través de tu cuenta.
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="mercadoPagoPublicKey">Public Key</Label>
                                <Controller name="mercadoPagoPublicKey" control={form.control} render={({ field }) => (
                                    <Input id="mercadoPagoPublicKey" {...field} placeholder="Tu Public Key de MercadoPago" />
                                )} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mercadoPagoAccessToken">Access Token</Label>
                                <Controller name="mercadoPagoAccessToken" control={form.control} render={({ field }) => (
                                    <Input id="mercadoPagoAccessToken" {...field} placeholder="Tu Access Token de MercadoPago" type="password" />
                                )} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mercadoPagoUserId">User ID (Requerido para Sincronización)</Label>
                                <Controller name="mercadoPagoUserId" control={form.control} render={({ field }) => (
                                    <Input id="mercadoPagoUserId" {...field} placeholder="Ej: 123456789" />
                                )} />
                            </div>
                            <div className="pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
                                        const token = form.getValues('mercadoPagoAccessToken');
                                        const uid = form.getValues('mercadoPagoUserId');
                                        if (!token || !uid) {
                                            toast({ variant: "destructive", title: "Faltan datos", description: "Guarda primero tu Access Token y User ID." });
                                            return;
                                        }
                                        toast({ title: "Sincronizando...", description: "Creando Sucursal y Caja en Mercado Pago..." });
                                        try {
                                            const res = await fetch('/api/mercadopago/sync-store', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ accessToken: token, userId: uid })
                                            });
                                            const data = await res.json();
                                            if (res.ok) {
                                                toast({ title: "¡Éxito!", description: `Sucursal y Caja sincronizadas. ID Sucursal: ${data.store.id}` });
                                            } else {
                                                throw new Error(data.error || "Error desconocido");
                                            }
                                        } catch (e: any) {
                                            toast({ variant: "destructive", title: "Error", description: e.message });
                                        }
                                    }}
                                >
                                    Sincronizar Sucursales y Cajas (Mejorar Calidad MP)
                                </Button>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Esto creará la sucursal y caja vía API para cumplir con los estándares de calidad de Mercado Pago.
                                </p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-terminal" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6 font-semibold text-base">Terminal de pagos</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-4">
                            <div className="flex flex-col space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Conecta y gestiona tus terminales de pago de Mercado Pago.
                                </p>
                                <div className="flex items-center gap-4">
                                    <Button type="button" onClick={handleFetchAndSaveTerminals} disabled={isFetchingTerminals}>
                                        {isFetchingTerminals && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                                            {terminalsLoading ? (
                                                <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="animate-spin h-6 w-6" /></TableCell></TableRow>
                                            ) : terminals?.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center h-24">No se encontraron terminales. Haz clic en "Refrescar Terminales".</TableCell></TableRow>
                                            ) : (
                                                terminals?.map((terminal: any) => (
                                                    <TableRow key={terminal.id}>
                                                        <TableCell className="font-medium">{terminal.display_name || 'Terminal sin nombre'}</TableCell>
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
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-4" className="border rounded-lg bg-card">
                        <AccordionTrigger className="p-6 font-semibold text-base">Impresora de tickets</AccordionTrigger>
                        <AccordionContent className="p-6 pt-0 space-y-6">
                            <div className="flex flex-col gap-4">
                                <p className="text-sm text-muted-foreground">
                                    Conecta una impresora térmica Bluetooth para imprimir tickets automáticamente al realizar cobros en efectivo.
                                </p>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">Habilitar impresión automática</Label>
                                        <p className="text-sm text-muted-foreground">Se imprimirá un ticket al finalizar una venta en efectivo.</p>
                                    </div>
                                    <Controller name="ticketPrinterEnabled" control={form.control} render={({ field }) => (
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    )} />
                                </div>

                                {form.watch('ticketPrinterEnabled') && (
                                    <Card className="bg-muted/50 border-dashed">
                                        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-3 w-3 rounded-full ${form.watch('ticketPrinterDeviceName') ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">Dispositivo Vinculado</span>
                                                    <span className="text-xs text-muted-foreground">{form.watch('ticketPrinterDeviceName') || 'Ninguno'}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 w-full sm:w-auto">
                                                <Button type="button" variant="secondary" size="sm" onClick={handleTestPrint} disabled={!form.watch('ticketPrinterDeviceName')}>
                                                    Prueba
                                                </Button>
                                                <Button type="button" size="sm" onClick={handleConnectPrinter} disabled={isConnectingPrinter}>
                                                    {isConnectingPrinter && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                    {form.watch('ticketPrinterDeviceName') ? 'Cambiar Impresora' : 'Buscar Impresora'}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                <div className="flex justify-end sticky bottom-0 py-4 bg-background/80 backdrop-blur-sm">
                    <Button type="submit" disabled={isSubmitting || isLoading}>
                        {(isSubmitting || isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </div>
            </form>
        </div>
    );
}
