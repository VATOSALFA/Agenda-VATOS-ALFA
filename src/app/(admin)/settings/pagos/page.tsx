'use client';

import { useForm, Controller } from 'react-hook-form';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Loader2, CreditCard, RefreshCw, Smartphone, CheckCircle2 } from "lucide-react";
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, httpsCallable, functions } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
}

export default function PagosAgendaProPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const { user } = useAuth();
    const [cashboxSettings, setCashboxSettings] = useState<any>(null);
    const [isFetchingTerminals, setIsFetchingTerminals] = useState(false);
    const [isSyncingStore, setIsSyncingStore] = useState(false);
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
        }
    });

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                const pagosRef = doc(db, 'configuracion', 'pagos');
                const pagosSnap = await getDoc(pagosRef);
                const pagosData = pagosSnap.exists() ? pagosSnap.data() : {};

                const mpRef = doc(db, 'configuracion', 'mercadopago');
                const mpSnap = await getDoc(mpRef);
                const mpData = mpSnap.exists() ? mpSnap.data() : {};

                form.reset({
                    ...pagosData,
                    mercadoPagoPublicKey: mpData.publicKey || '',
                    mercadoPagoAccessToken: mpData.accessToken || '',
                    mercadoPagoUserId: mpData.userId || '',
                    showTips: pagosData.showTips ?? true,
                    onlinePayments: pagosData.onlinePayments ?? true,
                    collectionLink: pagosData.collectionLink ?? true,
                    editReservationStatus: pagosData.editReservationStatus ?? false,
                    bank: pagosData.bank || '',
                    accountHolder: pagosData.accountHolder || '',
                    clabe: pagosData.clabe || '',
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
        };
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

                setQueryKey(prev => prev + 1);
                toast({
                    title: 'Terminales actualizadas',
                    description: `Se sincronizaron ${fetchedTerminals.length} terminales en modo PDV.`,
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
    };

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
    };

    const handleSyncStore = async () => {
        const token = form.getValues('mercadoPagoAccessToken');
        const uid = form.getValues('mercadoPagoUserId');
        if (!token || !uid) {
            toast({ variant: "destructive", title: "Faltan datos", description: "Guarda primero tu Access Token y User ID." });
            return;
        }
        setIsSyncingStore(true);
        try {
            const res = await fetch('/api/mercadopago/sync-store', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: token, userId: uid })
            });
            const data = await res.json();
            if (res.ok) {
                toast({ title: "¡Éxito!", description: `Sucursal y Caja sincronizadas. ID Sucursal: ${data.store?.id || 'OK'}` });
            } else {
                throw new Error(data.error || "Error desconocido");
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        } finally {
            setIsSyncingStore(false);
        }
    };

    const onSubmit = async (data: PagosSettings) => {
        setIsSubmitting(true);
        try {
            const pagosRef = doc(db, 'configuracion', 'pagos');
            const pagosData = {
                showTips: data.showTips,
                onlinePayments: data.onlinePayments,
                collectionLink: data.collectionLink,
                editReservationStatus: data.editReservationStatus,
                bank: data.bank,
                accountHolder: data.accountHolder,
                clabe: data.clabe,
            };
            await setDoc(pagosRef, pagosData, { merge: true });

            const mpRef = doc(db, 'configuracion', 'mercadopago');
            const mpData = {
                publicKey: data.mercadoPagoPublicKey,
                accessToken: data.mercadoPagoAccessToken,
                userId: data.mercadoPagoUserId
            };
            await setDoc(mpRef, mpData, { merge: true });

            toast({
                title: "Configuración guardada",
                description: "Tus credenciales y preferencias han sido actualizadas."
            });
        } catch (error) {
            console.error("Error saving payment settings:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los cambios.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 space-y-5 max-w-5xl pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/60">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Pagos y Terminales</h2>
                    <p className="text-xs text-muted-foreground">
                        Configura las credenciales de Mercado Pago y administra las terminales físicas de cobro.
                    </p>
                </div>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {/* 1. MERCADO PAGO CREDENCIALES */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-slate-400 shrink-0" />
                            <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                Proveedor de Pagos (Mercado Pago)
                            </CardTitle>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Conecta tus credenciales de producción para procesar anticipos y cobros con tarjeta y SPEI.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="mercadoPagoPublicKey" className="text-xs font-semibold text-foreground">
                                    Public Key
                                </Label>
                                <Controller
                                    name="mercadoPagoPublicKey"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Input
                                            id="mercadoPagoPublicKey"
                                            {...field}
                                            placeholder="APP_USR-..."
                                            className="h-8 text-xs font-mono"
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="mercadoPagoUserId" className="text-xs font-semibold text-foreground">
                                    User ID de Mercado Pago
                                </Label>
                                <Controller
                                    name="mercadoPagoUserId"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Input
                                            id="mercadoPagoUserId"
                                            {...field}
                                            placeholder="Ej. 123456789"
                                            className="h-8 text-xs font-mono"
                                        />
                                    )}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="mercadoPagoAccessToken" className="text-xs font-semibold text-foreground">
                                Access Token (Privado)
                            </Label>
                            <Controller
                                name="mercadoPagoAccessToken"
                                control={form.control}
                                render={({ field }) => (
                                    <Input
                                        id="mercadoPagoAccessToken"
                                        {...field}
                                        placeholder="APP_USR-..."
                                        type="password"
                                        className="h-8 text-xs font-mono"
                                    />
                                )}
                            />
                        </div>

                        <div className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="space-y-0.5">
                                <span className="text-xs font-semibold text-foreground block">
                                    Sincronizar Sucursales y Cajas con Mercado Pago
                                </span>
                                <p className="text-[11px] text-muted-foreground">
                                    Crea automáticamente la sucursal y caja requerida por las APIs de cobro de Mercado Pago.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isSyncingStore}
                                onClick={handleSyncStore}
                                className="h-8 px-3 text-xs shrink-0 rounded-lg border-border/80 hover:bg-muted/50"
                            >
                                {isSyncingStore && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                Sincronizar Tienda
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. TERMINALES POINT (TABLA COMPACTA - REGLA 6) */}
                <Card className="border border-border/70 shadow-xs overflow-hidden">
                    <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/50 bg-muted/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Smartphone className="h-4 w-4 text-slate-400 shrink-0" />
                                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                                    Terminales Físicas (Mercado Pago Point)
                                </CardTitle>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleFetchAndSaveTerminals}
                                disabled={isFetchingTerminals}
                                className="h-8 px-3 text-xs shrink-0 rounded-lg border-border/80 hover:bg-muted/50 gap-1.5"
                            >
                                <RefreshCw className={cn("h-3.5 w-3.5 text-slate-400", isFetchingTerminals && "animate-spin")} />
                                <span>Refrescar Terminales</span>
                            </Button>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Conecta tus lectores de tarjetas en modo Punto de Venta (PDV) para cobrar en recepción.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground">Nombre de Terminal</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">ID de Dispositivo</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Modo</TableHead>
                                    <TableHead className="py-1 px-3 text-center text-xs font-semibold text-foreground w-28">Principal</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {terminalsLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="py-8 text-center">
                                            <Loader2 className="animate-spin h-5 w-5 text-slate-400 mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : (!terminals || terminals.length === 0) ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                                            No se encontraron terminales registradas. Haz clic en "Refrescar Terminales".
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    terminals.map((terminal: any) => {
                                        const isMain = cashboxSettings?.mercadoPagoTerminalId === terminal.id;
                                        return (
                                            <TableRow key={terminal.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                <TableCell className="py-1.5 px-3.5 text-xs font-semibold text-foreground">
                                                    {terminal.display_name || 'Terminal Point'}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs font-mono text-muted-foreground">
                                                    {terminal.id}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs">
                                                    <Badge variant="outline" className="text-[10px] font-sans font-medium py-0 px-2 rounded-full border-border/60">
                                                        {terminal.operating_mode || 'PDV'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-center">
                                                    <Switch
                                                        className="scale-90"
                                                        checked={isMain}
                                                        onCheckedChange={(checked) => handleSetMainTerminal(terminal.id, checked)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Botón Guardar Cambios (Alfa) */}
                <div className="sticky bottom-0 z-10 py-3 bg-background/90 backdrop-blur-md border-t border-border/40 flex justify-end">
                    <Button
                        type="submit"
                        disabled={isSubmitting || isLoading}
                        variant="alfa"
                        className="h-9 px-6 text-xs font-semibold"
                    >
                        {(isSubmitting || isLoading) ? (
                            <>
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            "Guardar Cambios"
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
