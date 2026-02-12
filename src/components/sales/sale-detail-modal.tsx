

'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Mail, Printer, X, Pencil, Store } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client, Local, Sale, Profesional, User } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import { BluetoothPrinter } from '@/lib/printer';
import { useToast } from '@/hooks/use-toast';
import { functions, httpsCallable } from '@/lib/firebase-client';

interface EmpresaSettings {
    receipt_logo_url?: string;
    name?: string;
    address?: string;
}

interface SaleDetailModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    sale: Sale | null;
}

const InfoItem = ({ label, value }: { label: string, value: string | number | undefined }) => (
    <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
    </div>
);

export function SaleDetailModal({ isOpen, onOpenChange, sale }: SaleDetailModalProps) {
    const { toast } = useToast();
    const { data: locales } = useFirestoreQuery<Local>('locales');
    const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');
    const { data: users } = useFirestoreQuery<User>('usuarios');
    const { data: empresaData } = useFirestoreQuery<EmpresaSettings>('empresa');
    const empresa = empresaData?.[0];
    const [isPrinting, setIsPrinting] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const localData = useMemo(() => {
        if (!sale || !sale.local_id || !locales) return null;
        return locales.find(l => l.id === sale.local_id);
    }, [sale, locales]);

    const sellerMap = useMemo(() => {
        const map = new Map<string, string>();
        if (professionals) {
            professionals.forEach(p => map.set(p.id, p.name));
        }
        if (users) {
            users.forEach(u => map.set(u.id, u.name));
        }
        return map;
    }, [professionals, users]);


    if (!sale) return null;

    const formatDate = (date: any) => {
        if (!date) return 'Fecha no disponible';
        let dateObj: Date;
        if (date.seconds) { // Firestore Timestamp
            dateObj = new Date(date.seconds * 1000);
        } else if (typeof date === 'string') { // ISO String
            dateObj = parseISO(date);
        } else {
            return 'Fecha inválida';
        }
        if (isNaN(dateObj.getTime())) return 'Fecha inválida';
        return format(dateObj, 'PP p', { locale: es });
    };

    const subtotal = sale.subtotal || sale.items?.reduce((acc, item) => acc + (item.precio_unitario || 0) * item.cantidad, 0) || 0;
    const discountAmount = sale.descuento?.valor && sale.descuento.tipo === 'percentage'
        ? (subtotal * sale.descuento.valor) / 100
        : (sale.descuento?.valor || 0);

    const handlePrintTicket = async () => {
        setIsPrinting(true);
        try {
            const printer = BluetoothPrinter.getInstance();
            if (!printer.isConnected()) await printer.connect();

            // Print Logo
            if (empresa?.receipt_logo_url) {
                await printer.printImage(empresa.receipt_logo_url);
            }

            // Prepare cart items from sale.items
            // sale.items structure matches what formatTicket expects (nombre, cantidad, subtotal/precio_unitario)
            // But we need to ensure 'subtotal' exists on item for the printer or rename it.
            // In new-sale-sheet, we passed 'cart' which has 'subtotal'.
            // Here sale.items has 'precio_unitario' and 'cantidad'.
            const formattedItems = sale.items.map(item => ({
                nombre: item.nombre,
                cantidad: item.cantidad,
                subtotal: (item.precio_unitario || 0) * item.cantidad
            }));

            const ticketData = {
                storeName: localData?.name || empresa?.name || "VATOS ALFA",
                storeAddress: localData?.address || empresa?.address || "",
                date: formatDate(sale.fecha_hora_venta), // Reuse format logic or simplified
                customerName: sale.client ? `${sale.client.nombre} ${sale.client.apellido}` : "Cliente General",
                reservationId: sale.reservationId || "",
                items: formattedItems,
                subtotal: subtotal,
                anticipoPagado: (sale as any).anticipoPagado || 0, // In case we added it to Sale type or it's extra field
                discount: discountAmount,
                total: sale.total
            };

            await printer.print(printer.formatTicket(ticketData));
            toast({ title: "Imprimiendo copia del ticket..." });

        } catch (error: any) {
            console.error("Print error:", error);
            toast({
                variant: "destructive",
                title: "Error al imprimir",
                description: error.message || "No se pudo conectar a la impresora."
            });
        } finally {
            setIsPrinting(false);
        }
    };

    const handleSendEmail = async () => {
        if (!sale) return;
        setIsSendingEmail(true);
        try {
            const sendReceipt = httpsCallable(functions, 'sendSaleReceipt');
            const result: any = await sendReceipt({ saleId: sale.id });

            if (result.data.success) {
                toast({ title: "Correo enviado", description: "El comprobante se ha enviado al cliente." });
            } else {
                toast({ variant: "destructive", title: "Atención", description: result.data.message || "No se pudo enviar el correo." });
            }
        } catch (error: any) {
            console.error("Email error:", error);
            toast({ variant: "destructive", title: "Error", description: error.message || "Error al enviar el correo." });
        } finally {
            setIsSendingEmail(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0" hideCloseButton>
                <DialogHeader className="p-4 border-b flex-row items-center justify-between">
                    <DialogTitle>Comprobante de pago ID: {sale.id.slice(0, 8)}</DialogTitle>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={handleSendEmail} disabled={isSendingEmail || isPrinting}>
                            <Mail className={`h-4 w-4 ${isSendingEmail ? 'animate-pulse text-primary' : ''}`} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handlePrintTicket} disabled={isPrinting || isSendingEmail}>
                            <Printer className={`h-4 w-4 ${isPrinting ? 'animate-pulse text-blue-500' : ''}`} />
                        </Button>
                    </div>
                </DialogHeader>
                <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                    <div className="flex justify-center items-center mb-6">
                        {empresa?.receipt_logo_url ? (
                            <Image src={empresa.receipt_logo_url} alt="Logo" width={200} height={100} className="h-auto" />
                        ) : (
                            <h2 className="text-2xl font-bold">{empresa?.name || "Vatos Alfa"}</h2>
                        )}
                    </div>
                    <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold mb-4">Resumen de pago</h3>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <InfoItem label="Fecha" value={formatDate(sale.fecha_hora_venta)} />
                            <InfoItem label="Cajero" value={sale.creado_por_nombre || 'Sin información'} />
                            <InfoItem label="Cliente" value={`${sale.client?.nombre || ''} ${sale.client?.apellido || ''}`.trim() || 'No registrado'} />
                            <InfoItem label="Local" value={localData?.name || 'Desconocido'} />
                            {sale.metodo_pago === 'combinado' && sale.detalle_pago_combinado ? (
                                <div className="col-span-3 mt-2 border-t pt-2">
                                    <div className="font-semibold text-xs mb-1">Desglose de Pago:</div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                        {(sale.detalle_pago_combinado.efectivo > 0) && (
                                            <div className="flex justify-between"><span>Efectivo:</span> <span>${sale.detalle_pago_combinado.efectivo.toLocaleString('es-MX')}</span></div>
                                        )}
                                        {(sale.detalle_pago_combinado.tarjeta > 0) && (
                                            <div className="flex justify-between"><span>Tarjeta:</span> <span>${sale.detalle_pago_combinado.tarjeta.toLocaleString('es-MX')}</span></div>
                                        )}
                                        {(sale.detalle_pago_combinado.transferencia && sale.detalle_pago_combinado.transferencia > 0) && (
                                            <div className="flex justify-between"><span>Transferencia:</span> <span>${(sale.detalle_pago_combinado.transferencia || 0).toLocaleString('es-MX')}</span></div>
                                        )}
                                        {(sale.detalle_pago_combinado.pagos_en_linea && sale.detalle_pago_combinado.pagos_en_linea > 0) && (
                                            <div className="flex justify-between"><span>Pagos en Linea:</span> <span>${sale.detalle_pago_combinado.pagos_en_linea.toLocaleString('es-MX')}</span></div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <InfoItem label="Método de pago" value={sale.metodo_pago === 'mercadopago' ? 'Pagos en Linea' : sale.metodo_pago} />
                            )}
                            <InfoItem label="Monto total" value={`$${sale.total.toLocaleString('es-MX')}`} />
                        </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold mb-4">Detalle de la venta</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Vendedor</TableHead>
                                    <TableHead className="text-right">Precio</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sale.items?.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.nombre}</TableCell>
                                        <TableCell>{sellerMap.get(item.barbero_id) || 'N/A'}</TableCell>
                                        <TableCell className="text-right">${(item.precio_unitario || item.precio || 0).toLocaleString('es-MX')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={2} className="text-right">Subtotal</TableCell>
                                    <TableCell className="text-right">${subtotal.toLocaleString('es-MX')}</TableCell>
                                </TableRow>
                                {discountAmount > 0 && (
                                    <TableRow>
                                        <TableCell colSpan={2} className="text-right">Descuento</TableCell>
                                        <TableCell className="text-right text-destructive">-${discountAmount.toLocaleString('es-MX')}</TableCell>
                                    </TableRow>
                                )}
                                <TableRow className="font-bold text-lg border-t-2">
                                    {/* Logic to detailed breakdown if it's a partial payment */}
                                    {(sale.pago_estado === 'deposit_paid' || (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)) ? (
                                        <>
                                            <TableCell colSpan={2} className="text-right pt-2">Valor Total del Servicio</TableCell>
                                            <TableCell className="text-right pt-2">${sale.total.toLocaleString('es-MX')}</TableCell>
                                        </>
                                    ) : (
                                        <>
                                            <TableCell colSpan={2} className="text-right">Total</TableCell>
                                            <TableCell className="text-right">${sale.total.toLocaleString('es-MX')}</TableCell>
                                        </>
                                    )}
                                </TableRow>
                                {(sale.pago_estado === 'deposit_paid' || (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)) && (
                                    <>
                                        <TableRow className="text-orange-600 font-medium">
                                            <TableCell colSpan={2} className="text-right">Anticipo Pagado</TableCell>
                                            <TableCell className="text-right">-${(sale.monto_pagado_real || 0).toLocaleString('es-MX')}</TableCell>
                                        </TableRow>
                                        <TableRow className="text-muted-foreground">
                                            <TableCell colSpan={2} className="text-right">Saldo Pendiente</TableCell>
                                            <TableCell className="text-right">${(sale.total - (sale.monto_pagado_real || 0)).toLocaleString('es-MX')}</TableCell>
                                        </TableRow>
                                    </>
                                )}
                            </TableFooter>
                        </Table>
                    </div>
                </div>
                <DialogFooter className="p-4 border-t flex justify-end">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
