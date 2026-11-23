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

            const ben = (sale as any).beneficio_aplicado;
            const benefitLabel = ben
                ? (ben.id === 'invita_amigo' || String(ben.folio || '').startsWith('VA-REF-'))
                    ? `Invita a un Amigo (-20%${ben.codigo_referido ? ` | ${ben.codigo_referido}` : ''})`
                    : (ben.titulo || 'Beneficio Pase Alfa')
                : undefined;

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
                benefitLabel,
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
            case 'monedero': return 'Saldo Pase Alfa';
            default:
                if (sale.pago_estado === 'deposit_paid') return 'Pagos en Línea';
                return sale.metodo_pago || 'No especificado';
        }
    })();

    const isAnticipoSale = sale.tipo_venta === 'anticipo' || sale.pago_estado === 'deposit_paid';
    const transactionAmount = isAnticipoSale
        ? ((sale.monto_pagado_real ?? (sale as any).anticipo_pagado ?? (sale as any).anticipoPagado ?? (sale.total ? sale.total / 2 : 0)) + (sale.propina || 0))
        : ((sale.total || 0) + (sale.propina || 0));
    const totalConPropina = (sale.total || 0) + (sale.propina || 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[92dvh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background" hideCloseButton>
                {/* HEADER ESTILO VATOS ALFA */}
                <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                    <div className="header-light-beam" aria-hidden="true" />

                    <div className="relative z-10 flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5">
                            <Receipt className="h-4 w-4 text-slate-300 shrink-0" />
                            <div className="space-y-0.5">
                                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide leading-tight">
                                    Comprobante de Pago
                                </DialogTitle>
                                <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-wrap">
                                    <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px] border border-white/10">
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

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={handleSendEmail}
                                disabled={isSendingEmail || isPrinting}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                                title="Enviar comprobante por correo"
                                aria-label="Enviar por correo"
                            >
                                {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Mail className="h-4 w-4" />}
                            </button>
                            <button
                                type="button"
                                onClick={handlePrintTicket}
                                disabled={isPrinting || isSendingEmail}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                                title="Imprimir ticket térmico"
                                aria-label="Imprimir ticket"
                            >
                                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : <Printer className="h-4 w-4" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label="Cerrar modal"
                                title="Cerrar"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* CONTENIDO EN 2 COLUMNAS PARA TABLET HORIZONTAL */}
                <div className="p-3.5 sm:p-4 flex-1 min-h-0 overflow-y-auto text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
                        {/* COLUMNA IZQUIERDA: Marca y Resumen de Pago */}
                        <div className="md:col-span-5 space-y-3">
                            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card">
                                <div className="flex items-center shrink-0">
                                    {empresa?.receipt_logo_url ? (
                                        <Image
                                            src={empresa.receipt_logo_url}
                                            alt="Logo"
                                            width={160}
                                            height={60}
                                            className="h-auto max-h-11 w-auto object-contain dark:brightness-110"
                                            priority
                                        />
                                    ) : (
                                        <div>
                                            <h2 className="text-base font-black tracking-widest text-foreground uppercase leading-none">VATOS ALFA</h2>
                                            <span className="text-[9px] text-muted-foreground tracking-widest uppercase">Barber Shop</span>
                                        </div>
                                    )}
                                </div>
                                <div className="text-right space-y-0.5 min-w-0">
                                    <p className="font-bold text-xs text-foreground leading-tight truncate">
                                        {localData?.name || empresa?.name || 'VATOS ALFA Barber Shop'}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                                        {localData?.address || empresa?.address || 'Querétaro, Qro.'}
                                    </p>
                                    {localData?.phone && (
                                        <p className="text-[10px] text-muted-foreground font-sans">
                                            Tel: {localData.phone}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 rounded-xl border border-border/60 bg-card space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <CreditCard className="w-3.5 h-3.5 text-blue-400" /> Resumen de Pago
                                    </h3>
                                    <Badge variant="outline" className="border-border bg-muted/40 font-semibold text-[10px] px-2 py-0.5">
                                        {paymentMethodLabel}
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 text-xs pt-0.5">
                                    <div className="space-y-0.5">
                                        <span className="text-muted-foreground block text-[10px]">Fecha y Hora:</span>
                                        <strong className="text-foreground font-semibold text-xs">{formatDate(sale.fecha_hora_venta)}</strong>
                                    </div>
                                    <div className="space-y-0.5">
                                        <span className="text-muted-foreground block text-[10px]">Cajero / Recepción:</span>
                                        <strong className="text-foreground font-semibold truncate block">{sale.creado_por_nombre || 'Recepción'}</strong>
                                    </div>
                                    <div className="space-y-0.5">
                                        <span className="text-muted-foreground block text-[10px]">Cliente:</span>
                                        <strong className="text-foreground font-semibold truncate block">
                                            {`${sale.client?.nombre || ''} ${sale.client?.apellido || ''}`.trim() || 'Cliente General'}
                                        </strong>
                                    </div>
                                    <div className="space-y-0.5">
                                        <span className="text-muted-foreground block text-[10px]">Sucursal:</span>
                                        <strong className="text-foreground font-semibold truncate block">{localData?.name || 'Sucursal Principal'}</strong>
                                    </div>
                                    <div className="col-span-2 pt-2 border-t border-border/50 flex items-center justify-between">
                                        <span className="text-muted-foreground text-[11px] font-medium">{isAnticipoSale ? "Monto Cobrado (Anticipo):" : "Total Transacción:"}</span>
                                        <strong className="text-foreground font-bold text-sm font-sans">
                                            ${transactionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            {Boolean(sale.propina && sale.propina > 0) && (
                                                <span className="text-[10px] text-blue-400 font-normal ml-1">
                                                    (incluye propina)
                                                </span>
                                            )}
                                        </strong>
                                    </div>
                                </div>

                                {sale.metodo_pago === 'combinado' && sale.detalle_pago_combinado && (
                                    <div className="pt-2 border-t border-border/50 text-xs">
                                        <span className="font-semibold text-[10px] text-muted-foreground block mb-1.5 uppercase tracking-wider">
                                            Desglose del Pago Combinado:
                                        </span>
                                        <div className="grid grid-cols-2 gap-1.5 text-xs">
                                            {Boolean(sale.detalle_pago_combinado.efectivo && sale.detalle_pago_combinado.efectivo > 0) && (
                                                <div className="flex justify-between bg-muted/30 p-1.5 rounded-lg">
                                                    <span className="text-muted-foreground">Efectivo:</span>
                                                    <strong className="text-foreground font-semibold font-sans">${sale.detalle_pago_combinado.efectivo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                                </div>
                                            )}
                                            {Boolean(sale.detalle_pago_combinado.tarjeta && sale.detalle_pago_combinado.tarjeta > 0) && (
                                                <div className="flex justify-between bg-muted/30 p-1.5 rounded-lg">
                                                    <span className="text-muted-foreground">Point:</span>
                                                    <strong className="text-foreground font-semibold font-sans">${sale.detalle_pago_combinado.tarjeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                                </div>
                                            )}
                                            {Boolean(sale.detalle_pago_combinado.transferencia && sale.detalle_pago_combinado.transferencia > 0) && (
                                                <div className="flex justify-between bg-muted/30 p-1.5 rounded-lg">
                                                    <span className="text-muted-foreground">Transf.:</span>
                                                    <strong className="text-foreground font-semibold font-sans">${(sale.detalle_pago_combinado.transferencia || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                                </div>
                                            )}
                                            {Boolean(sale.detalle_pago_combinado.pagos_en_linea && sale.detalle_pago_combinado.pagos_en_linea > 0) && (
                                                <div className="flex justify-between bg-muted/30 p-1.5 rounded-lg">
                                                    <span className="text-muted-foreground">En Línea:</span>
                                                    <strong className="text-foreground font-semibold font-sans">${(sale.detalle_pago_combinado.pagos_en_linea || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                                </div>
                                            )}
                                            {Boolean(sale.detalle_pago_combinado.monedero && sale.detalle_pago_combinado.monedero > 0) && (
                                                <div className="flex justify-between bg-blue-500/10 border border-blue-500/20 p-1.5 rounded-lg col-span-2">
                                                    <span className="text-blue-400">Saldo Pase Alfa:</span>
                                                    <strong className="text-blue-400 font-semibold font-sans">${(sale.detalle_pago_combinado.monedero || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: Detalle de la Venta y Totales */}
                        <div className="md:col-span-7 p-3 rounded-xl border border-border/60 bg-card space-y-2">
                            <h3 className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Scissors className="w-3.5 h-3.5 text-slate-400" /> Detalle de la Venta ({sale.items?.length || 0})
                            </h3>
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-2.5 text-xs font-semibold">Concepto</TableHead>
                                        <TableHead className="py-1 px-2.5 text-xs font-semibold">Profesional</TableHead>
                                        <TableHead className="py-1 px-2.5 text-right text-xs font-semibold">Precio</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.items?.map((item, index) => (
                                        <TableRow key={index} className="h-9 border-b border-border/40 hover:bg-muted/20">
                                            <TableCell className="font-medium text-foreground py-1.5 px-2.5 text-xs">
                                                {item.nombre}
                                                {item.cantidad > 1 && (
                                                    <span className="text-muted-foreground ml-1 text-[11px]">x{item.cantidad}</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs py-1.5 px-2.5">
                                                {item.id === 'recarga_saldo_pase_alfa' || (item as any).tipo === 'recarga_monedero'
                                                    ? 'Recarga de Saldo'
                                                    : (sellerMap.get(item.barbero_id) || (item as any).barbero_nombre || 'Personal Sucursal')}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-foreground text-xs py-1.5 px-2.5 font-sans">
                                                ${(item.precio_unitario || item.precio || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter className="bg-transparent">
                                    <TableRow className="hover:bg-transparent border-t border-border/60">
                                        <TableCell colSpan={2} className="text-right text-xs text-muted-foreground font-medium py-1.5 px-2.5">Subtotal</TableCell>
                                        <TableCell className="text-right text-xs font-semibold text-foreground py-1.5 px-2.5 font-sans">${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    </TableRow>

                                    {discountAmount > 0 ? (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right text-xs text-destructive font-medium py-1 px-2.5">Descuento</TableCell>
                                            <TableCell className="text-right text-xs font-semibold text-destructive py-1 px-2.5 font-sans">-${discountAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    ) : null}

                                    {(sale as any).beneficio_aplicado ? (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right text-xs text-[#C5A880] font-semibold py-1 px-2.5">
                                                Beneficio: {(sale as any).beneficio_aplicado.titulo || 'Beneficio Pase Alfa'}
                                                {(sale as any).beneficio_aplicado.codigo_referido ? ` (${(sale as any).beneficio_aplicado.codigo_referido})` : ''}
                                                {(sale as any).beneficio_aplicado.referrer_name ? ` • Anfitrión: ${(sale as any).beneficio_aplicado.referrer_name}` : ''}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-bold text-[#C5A880] py-1 px-2.5">
                                                {(sale as any).beneficio_aplicado.id === 'invita_amigo' ? '-20%' : ((sale as any).beneficio_aplicado.folio || 'Canjeado')}
                                            </TableCell>
                                        </TableRow>
                                    ) : null}

                                    {Number((sale as any).descuento_alfacoins || 0) > 0 ? (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right text-xs text-[#C5A880] font-semibold py-1 px-2.5">
                                                Canje ALFA COINS {Number((sale as any).alfacoins_canjeados || 0) > 0 ? `(${Number((sale as any).alfacoins_canjeados)} monedas)` : ''}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-bold text-[#C5A880] py-1 px-2.5 font-sans">
                                                -${Number((sale as any).descuento_alfacoins || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    ) : null}

                                    {Number((sale as any).pago_monedero || sale.detalle_pago_combinado?.monedero || 0) > 0 ? (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={2} className="text-right text-xs text-blue-400 font-semibold py-1 px-2.5">
                                                Cubierto con Saldo Pase Alfa
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-bold text-blue-400 py-1 px-2.5 font-sans">
                                                -${Number((sale as any).pago_monedero || sale.detalle_pago_combinado?.monedero || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    ) : null}

                                    {Boolean(sale.propina && sale.propina > 0) ? (
                                        <TableRow className="hover:bg-transparent text-blue-400 bg-blue-500/5">
                                            <TableCell colSpan={2} className="text-right text-xs font-medium py-1 px-2.5">
                                                Propina {sale.propina_detalles?.length === 1 && sellerMap.get(sale.propina_detalles[0].barbero_id) ? `(${sellerMap.get(sale.propina_detalles[0].barbero_id)})` : ''} {(sale as any).propina_metodo ? `• ${(sale as any).propina_metodo.charAt(0).toUpperCase() + (sale as any).propina_metodo.slice(1)}` : ''}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-bold py-1 px-2.5 font-sans">+${(sale.propina || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    ) : null}

                                    <TableRow className="font-bold text-sm border-t-2 border-border hover:bg-transparent">
                                        <TableCell colSpan={2} className="text-right text-foreground py-2 px-2.5">
                                            {sale.propina && sale.propina > 0 ? "Total Pagado" : "Total"}
                                        </TableCell>
                                        <TableCell className="text-right text-foreground font-black text-base py-2 px-2.5 font-sans">
                                            ${totalConPropina.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>

                                    {Boolean(sale.pago_estado === 'deposit_paid' || (sale.pago_estado !== 'Pagado' && sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total && !sale.anticipoPagado)) ? (
                                        <>
                                            <TableRow className="text-slate-600 dark:text-slate-400 font-medium text-xs hover:bg-transparent">
                                                <TableCell colSpan={2} className="text-right py-1 px-2.5">Anticipo Pagado</TableCell>
                                                <TableCell className="text-right py-1 px-2.5 font-sans">-${(sale.monto_pagado_real || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            </TableRow>
                                            <TableRow className="text-muted-foreground text-xs hover:bg-transparent">
                                                <TableCell colSpan={2} className="text-right py-1 px-2.5">Saldo Pendiente</TableCell>
                                                <TableCell className="text-right font-semibold py-1 px-2.5 font-sans">${(sale.total - (sale.monto_pagado_real || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            </TableRow>
                                        </>
                                    ) : null}

                                    {Boolean(sale.pago_estado === 'Pagado' && sale.anticipoPagado && sale.anticipoPagado > 0) ? (
                                        <>
                                            <TableRow className="text-slate-600 dark:text-slate-400 font-medium text-xs hover:bg-transparent">
                                                <TableCell colSpan={2} className="text-right py-1 px-2.5">Anticipo Pagado Previamente</TableCell>
                                                <TableCell className="text-right py-1 px-2.5 font-sans">-${(sale.anticipoPagado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            </TableRow>
                                            <TableRow className="text-blue-400 font-bold text-xs hover:bg-transparent">
                                                <TableCell colSpan={2} className="text-right py-1 px-2.5">Liquidación Pagada en esta Venta</TableCell>
                                                <TableCell className="text-right font-bold py-1 px-2.5 font-sans">${(sale.total - (sale.anticipoPagado || 0) + (sale.propina || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            </TableRow>
                                        </>
                                    ) : null}
                                </TableFooter>
                            </Table>
                        </div>
                    </div>
                </div>

                {/* FOOTER DE ACCIONES */}
                <DialogFooter className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-border/80 flex items-center justify-between flex-shrink-0 bg-muted/20">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrintTicket}
                        disabled={isPrinting}
                        className="rounded-xl text-xs gap-1.5 h-9"
                    >
                        {isPrinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                        Imprimir Ticket
                    </Button>
                    <Button
                        variant="alfa"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="rounded-xl px-5 h-9 text-xs font-bold text-white shadow-md"
                    >
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
