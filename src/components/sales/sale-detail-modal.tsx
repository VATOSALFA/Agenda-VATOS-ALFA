'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import {
    Mail,
    Printer,
    X,
    Pencil,
    Store,
    Receipt,
    CreditCard,
    Calendar,
    User,
    UserCheck,
    Scissors,
    DollarSign,
    CheckCircle2,
    Loader2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client, Local, Sale, Profesional, User as UserType } from '@/lib/types';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import { BluetoothPrinter } from '@/lib/printer';
import { useToast } from '@/hooks/use-toast';
import { db, functions, httpsCallable } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

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

export function SaleDetailModal({ isOpen, onOpenChange, sale }: SaleDetailModalProps) {
    const { toast } = useToast();
    const { data: locales } = useFirestoreQuery<Local>('locales');
    const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');
    const { data: users } = useFirestoreQuery<UserType>('usuarios');
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

    const displaySaleId = useMemo(() => {
        if (!sale) return '';
        if (sale.id.startsWith('deposit_')) {
            return sale.reservationId ? sale.reservationId.slice(0, 8) : sale.id.replace('deposit_', '').slice(0, 8);
        }
        return sale.id.slice(0, 8);
    }, [sale]);

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
        return format(dateObj, "dd 'de' MMMM yyyy, hh:mm a", { locale: es });
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

            const formattedItems = sale.items.map(item => ({
                nombre: item.nombre,
                cantidad: item.cantidad,
                subtotal: (item.precio_unitario || 0) * item.cantidad
            }));

            const pagosRef = doc(db, 'configuracion', 'pagos');
            const pagosSnap = await getDoc(pagosRef);
            const ticketFooterMessage = pagosSnap.exists() ? pagosSnap.data().ticketFooterMessage : undefined;

            const ticketData = {
                storeName: localData?.name || empresa?.name || "VATOS ALFA",
                storeAddress: localData?.address || empresa?.address || "",
                date: formatDate(sale.fecha_hora_venta),
                customerName: sale.client ? `${sale.client.nombre} ${sale.client.apellido}` : "Cliente General",
                reservationId: sale.reservationId || "",
                items: formattedItems,
                subtotal: subtotal,
                anticipoPagado: (sale as any).anticipoPagado || 0,
                discount: discountAmount,
                total: sale.total,
                footerMessage: ticketFooterMessage
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

    const paymentMethodLabel = (() => {
        const method = (sale.metodo_pago || (sale as any).metodo_pago_anticipo || '').toLowerCase().trim();
        switch (method) {
            case 'efectivo': return 'Efectivo';
            case 'tarjeta':
            case 'terminal':
            case 'terminal_point':
                return 'Terminal Point';
            case 'transferencia':
            case 'spei':
                return 'Transferencia';
            case 'mercadopago':
            case 'pagos en linea':
            case 'pagos_en_linea':
            case 'en_linea':
                return 'Pagos en Línea';
            case 'combinado': return 'Pago Combinado';
            case 'alfacoins': return 'Alfa Coins';
            default:
                if (sale.pago_estado === 'deposit_paid') return 'Pagos en Línea';
                return sale.metodo_pago || 'No especificado';
        }
    })();

    const totalConPropina = (sale.total || 0) + (sale.propina || 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background" hideCloseButton>
                {/* HEADER ESTILO VATOS ALFA */}
                <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                    {/* Haz de luz animado sutil */}
                    <div className="header-light-beam" aria-hidden="true" />

                    <div className="relative z-10 flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                            <Receipt className="h-5 w-5 text-slate-300 shrink-0" />
                            <div className="space-y-0.5">
                                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                    Comprobante de Pago
                                </DialogTitle>
                                <div className="flex items-center gap-2 text-xs text-slate-300 flex-wrap">
                                    <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-[11px] border border-white/10">
                                        ID: {displaySaleId}
                                    </span>
                                    {localData && (
                                        <>
                                            <span>•</span>
                                            <span className="text-slate-300 font-medium">{localData.name}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Botones de acción minimalistas sin contenedor */}
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleSendEmail}
                                disabled={isSendingEmail || isPrinting}
                                className="p-1.5 text-slate-300 hover:text-white transition-colors disabled:opacity-40"
                                title="Enviar comprobante por correo"
                                aria-label="Enviar por correo"
                            >
                                {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Mail className="h-4 w-4" />}
                            </button>
                            <button
                                type="button"
                                onClick={handlePrintTicket}
                                disabled={isPrinting || isSendingEmail}
                                className="p-1.5 text-slate-300 hover:text-white transition-colors disabled:opacity-40"
                                title="Imprimir ticket térmico"
                                aria-label="Imprimir ticket"
                            >
                                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : <Printer className="h-4 w-4" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="p-1.5 text-slate-300 hover:text-white transition-colors"
                                aria-label="Cerrar modal"
                                title="Cerrar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* CONTENIDO SCROLLEABLE */}
                <div className="p-4 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto text-sm">
                    {/* ENCABEZADO DE MARCA / LOGO */}
                    <div className="flex items-center justify-between gap-4 pt-1 pb-4 border-b border-border/60">
                        <div className="flex items-center">
                            {empresa?.receipt_logo_url ? (
                                <Image
                                    src={empresa.receipt_logo_url}
                                    alt="Logo"
                                    width={240}
                                    height={90}
                                    className="h-auto max-h-16 sm:max-h-20 w-auto object-contain dark:brightness-110"
                                    priority
                                />
                            ) : (
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black tracking-widest text-foreground uppercase">VATOS ALFA</h2>
                                    <span className="text-[10px] text-muted-foreground tracking-widest uppercase">Barber Shop</span>
                                </div>
                            )}
                        </div>
                        <div className="text-right space-y-0.5 max-w-[55%]">
                            <p className="font-bold text-sm sm:text-base text-foreground leading-tight">
                                {localData?.name || empresa?.name || 'VATOS ALFA Barber Shop'}
                            </p>
                            <p className="text-xs text-muted-foreground leading-snug">
                                {localData?.address || empresa?.address || 'Querétaro, Qro.'}
                            </p>
                            {localData?.phone && (
                                <p className="text-[11px] text-muted-foreground font-mono">
                                    Tel: {localData.phone}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 1. RESUMEN DE PAGO */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <CreditCard className="w-3.5 h-3.5 text-primary" /> Resumen de Pago
                            </h3>
                            <Badge variant="outline" className="border-border bg-muted/40 font-semibold text-[11px] px-2 py-0.5">
                                {paymentMethodLabel}
                            </Badge>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                            <div className="space-y-0.5">
                                <span className="text-muted-foreground block text-[11px]">Fecha y Hora:</span>
                                <strong className="text-foreground font-semibold">{formatDate(sale.fecha_hora_venta)}</strong>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-muted-foreground block text-[11px]">Cajero / Recepción:</span>
                                <strong className="text-foreground font-semibold truncate block">{sale.creado_por_nombre || 'Recepción'}</strong>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-muted-foreground block text-[11px]">Cliente:</span>
                                <strong className="text-foreground font-semibold truncate block">
                                    {`${sale.client?.nombre || ''} ${sale.client?.apellido || ''}`.trim() || 'Cliente General'}
                                </strong>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-muted-foreground block text-[11px]">Sucursal:</span>
                                <strong className="text-foreground font-semibold truncate block">{localData?.name || 'Sucursal Principal'}</strong>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-muted-foreground block text-[11px]">Método de Pago:</span>
                                <strong className="text-foreground font-semibold block">{paymentMethodLabel}</strong>
                            </div>
                            <div className="space-y-0.5">
                                <span className="text-muted-foreground block text-[11px]">Total Transacción:</span>
                                <strong className="text-foreground font-bold text-sm block">
                                    ${totalConPropina.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    {Boolean(sale.propina && sale.propina > 0) && (
                                        <span className="text-[10px] text-blue-400 font-normal ml-1">
                                            (incluye propina)
                                        </span>
                                    )}
                                </strong>
                            </div>
                        </div>

                        {/* Desglose de pago combinado si aplica */}
                        {sale.metodo_pago === 'combinado' && sale.detalle_pago_combinado && (
                            <div className="mt-3 pt-2 border-t border-border/50 text-xs">
                                <span className="font-semibold text-[11px] text-muted-foreground block mb-1.5 uppercase tracking-wider">
                                    Desglose del Pago Combinado:
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    {Boolean(sale.detalle_pago_combinado.efectivo && sale.detalle_pago_combinado.efectivo > 0) && (
                                        <div className="flex justify-between bg-muted/30 p-2 rounded-lg">
                                            <span className="text-muted-foreground">Efectivo:</span>
                                            <strong className="text-foreground font-semibold">${sale.detalle_pago_combinado.efectivo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                        </div>
                                    )}
                                    {Boolean(sale.detalle_pago_combinado.tarjeta && sale.detalle_pago_combinado.tarjeta > 0) && (
                                        <div className="flex justify-between bg-muted/30 p-2 rounded-lg">
                                            <span className="text-muted-foreground">Terminal Point:</span>
                                            <strong className="text-foreground font-semibold">${sale.detalle_pago_combinado.tarjeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                        </div>
                                    )}
                                    {Boolean(sale.detalle_pago_combinado.transferencia && sale.detalle_pago_combinado.transferencia > 0) && (
                                        <div className="flex justify-between bg-muted/30 p-2 rounded-lg">
                                            <span className="text-muted-foreground">Transferencia:</span>
                                            <strong className="text-foreground font-semibold">${(sale.detalle_pago_combinado.transferencia || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                        </div>
                                    )}
                                    {Boolean(sale.detalle_pago_combinado.pagos_en_linea && sale.detalle_pago_combinado.pagos_en_linea > 0) && (
                                        <div className="flex justify-between bg-muted/30 p-2 rounded-lg">
                                            <span className="text-muted-foreground">Pagos en Línea:</span>
                                            <strong className="text-foreground font-semibold">${(sale.detalle_pago_combinado.pagos_en_linea || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. DETALLE DE LA VENTA */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs space-y-3">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Scissors className="w-3.5 h-3.5 text-primary" /> Detalle de la Venta ({sale.items?.length || 0})
                        </h3>
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border/60 hover:bg-transparent">
                                    <TableHead className="text-xs uppercase text-muted-foreground font-semibold">Concepto</TableHead>
                                    <TableHead className="text-xs uppercase text-muted-foreground font-semibold">Profesional</TableHead>
                                    <TableHead className="text-right text-xs uppercase text-muted-foreground font-semibold">Precio</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sale.items?.map((item, index) => (
                                    <TableRow key={index} className="border-border/40 hover:bg-muted/20">
                                        <TableCell className="font-medium text-foreground py-2.5 text-xs">
                                            {item.nombre}
                                            {item.cantidad > 1 && (
                                                <span className="text-muted-foreground ml-1.5 text-[11px]">x{item.cantidad}</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs py-2.5">
                                            {sellerMap.get(item.barbero_id) || 'Personal Sucursal'}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-foreground text-xs py-2.5">
                                            ${(item.precio_unitario || item.precio || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-transparent">
                                <TableRow className="hover:bg-transparent border-t border-border/60">
                                    <TableCell colSpan={2} className="text-right text-xs text-muted-foreground font-medium">Subtotal</TableCell>
                                    <TableCell className="text-right text-xs font-semibold text-foreground">${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>

                                {discountAmount > 0 ? (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={2} className="text-right text-xs text-destructive font-medium">Descuento</TableCell>
                                        <TableCell className="text-right text-xs font-semibold text-destructive">-${discountAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                ) : null}

                                {Number((sale as any).descuento_alfacoins || 0) > 0 ? (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={2} className="text-right text-xs text-[#C5A880] font-semibold">
                                            Canje ALFA COINS {Number((sale as any).alfacoins_canjeados || 0) > 0 ? `(${Number((sale as any).alfacoins_canjeados)} monedas)` : ''}
                                        </TableCell>
                                        <TableCell className="text-right text-xs font-bold text-[#C5A880]">
                                            -${Number((sale as any).descuento_alfacoins || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ) : null}

                                {Boolean(sale.propina && sale.propina > 0) ? (
                                    <TableRow className="hover:bg-transparent text-blue-400 bg-blue-500/5">
                                        <TableCell colSpan={2} className="text-right text-xs font-medium">
                                            Propina {sale.propina_detalles?.length === 1 && sellerMap.get(sale.propina_detalles[0].barbero_id) ? `(${sellerMap.get(sale.propina_detalles[0].barbero_id)})` : ''} {(sale as any).propina_metodo ? `• ${(sale as any).propina_metodo.charAt(0).toUpperCase() + (sale as any).propina_metodo.slice(1)}` : ''}
                                        </TableCell>
                                        <TableCell className="text-right text-xs font-bold">+${(sale.propina || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                ) : null}

                                <TableRow className="font-bold text-base border-t-2 border-border hover:bg-transparent">
                                    <TableCell colSpan={2} className="text-right text-foreground pt-3">
                                        {sale.propina && sale.propina > 0 ? "Total Pagado" : "Total"}
                                    </TableCell>
                                    <TableCell className="text-right text-foreground font-black text-lg pt-3">
                                        ${totalConPropina.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>

                                {/* Desglose si es anticipo parcial */}
                                {Boolean(sale.pago_estado === 'deposit_paid' || (sale.pago_estado !== 'Pagado' && sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total && !sale.anticipoPagado)) ? (
                                    <>
                                        <TableRow className="text-slate-600 dark:text-slate-400 font-medium text-xs hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right">Anticipo Pagado</TableCell>
                                            <TableCell className="text-right">-${(sale.monto_pagado_real || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                        <TableRow className="text-muted-foreground text-xs hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right">Saldo Pendiente</TableCell>
                                            <TableCell className="text-right font-semibold">${(sale.total - (sale.monto_pagado_real || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    </>
                                ) : null}

                                {/* Desglose si es liquidación de cita que ya tenía anticipo previo */}
                                {Boolean(sale.pago_estado === 'Pagado' && sale.anticipoPagado && sale.anticipoPagado > 0) ? (
                                    <>
                                        <TableRow className="text-slate-600 dark:text-slate-400 font-medium text-xs hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right">Anticipo Pagado Previamente</TableCell>
                                            <TableCell className="text-right">-${(sale.anticipoPagado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                        <TableRow className="text-blue-400 font-bold text-xs hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right">Liquidación Pagada en esta Venta</TableCell>
                                            <TableCell className="text-right font-bold">${(sale.total - (sale.anticipoPagado || 0) + (sale.propina || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    </>
                                ) : null}
                            </TableFooter>
                        </Table>
                    </div>
                </div>

                {/* FOOTER DE ACCIONES */}
                <DialogFooter className="p-4 sm:p-5 border-t border-border/80 flex items-center justify-between flex-shrink-0 bg-muted/20">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrintTicket}
                        disabled={isPrinting}
                        className="rounded-xl text-xs gap-1.5"
                    >
                        {isPrinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                        Imprimir Ticket
                    </Button>
                    <Button
                        variant="alfa"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="rounded-xl px-5 text-xs font-bold text-white shadow-md"
                    >
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
